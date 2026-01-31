"""
Magic link authentication (passwordless).

Users receive a 6-digit code or magic link via email.
No passwords stored - just time-limited verification codes.
"""
import secrets
import hashlib
import time
from typing import Tuple, Optional
from common.config import TABLE_USERS, TABLE_AUTH_CODES, TABLE_TEAM_MEMBERS, AWS_REGION, SES_FROM_EMAIL, FRONTEND_BASE_URL
from common.db import get_item, put_item, query_items

def generate_user_id() -> str:
    """Generate unique user ID."""
    return f"usr_{secrets.token_urlsafe(16)}"

def hash_code(code: str) -> str:
    """Hash verification code for storage."""
    return hashlib.sha256(code.encode()).hexdigest()

def generate_verification_code() -> str:
    """Generate 6-digit verification code."""
    return str(secrets.randbelow(1000000)).zfill(6)

def create_or_get_user(email: str) -> dict:
    """
    Get existing user by email or create new one.
    Returns user record.
    """
    # Query by email GSI
    items, _ = query_items(
        TABLE_USERS,
        key_condition="email = :email",
        expression_values={":email": email},
        index_name="email-index",
        limit=1
    )
    
    if items:
        return items[0]
    
    # Create new user
    user_id = generate_user_id()
    user = {
        "user_id": user_id,
        "email": email,
        "email_verified": False,
        "created_at": int(time.time()),
    }
    
    put_item(TABLE_USERS, user)
    return user

def store_verification_code(email: str, code: str, ttl_seconds: int = 600) -> None:
    """
    Store hashed verification code with TTL (default 10 minutes).
    """
    code_hash = hash_code(code)
    expires_at = int(time.time()) + ttl_seconds
    
    record = {
        "code_hash": code_hash,
        "email": email,
        "created_at": int(time.time()),
        "expires_at": expires_at,
    }
    
    put_item(TABLE_AUTH_CODES, record)

def verify_code(email: str, code: str) -> Tuple[bool, Optional[str]]:
    """
    Verify code matches stored hash for email.
    Returns (success, error_message).
    """
    code_hash = hash_code(code)
    
    # Get code record
    record = get_item(TABLE_AUTH_CODES, {"code_hash": code_hash})
    
    if not record:
        return False, "Invalid or expired code"
    
    if record.get("email") != email:
        return False, "Code does not match email"
    
    # Check expiration (DynamoDB TTL might not have cleaned up yet)
    if record.get("expires_at", 0) < time.time():
        return False, "Code expired"
    
    return True, None

def add_user_to_team(user_id: str, team_id: str, role: str = "uploader") -> None:
    """
    Add user to team with specified role.
    Role: admin, uploader, viewer
    """
    membership = {
        "user_id": user_id,
        "team_id": team_id,
        "role": role,
        "joined_at": int(time.time()),
    }
    
    put_item(TABLE_TEAM_MEMBERS, membership)

def get_user_teams(user_id: str) -> list[dict]:
    """Get all teams user belongs to."""
    items, _ = query_items(
        TABLE_TEAM_MEMBERS,
        key_condition="user_id = :uid",
        expression_values={":uid": user_id},
        limit=50
    )
    
    return items

def get_team_members(team_id: str) -> list[dict]:
    """Get all members of a team."""
    items, _ = query_items(
        TABLE_TEAM_MEMBERS,
        key_condition="team_id = :tid",
        expression_values={":tid": team_id},
        index_name="team-index",
        limit=100
    )
    
    return items

def send_magic_link_email(email: str, code: str, team_name: str = "") -> None:
    """
    Send verification code via email (AWS SES).
    """
    if not SES_FROM_EMAIL:
        print(f"[MAGIC LINK] SES not configured. Email: {email}, Code: {code}, Team: {team_name}")
        return

    import boto3

    subject_team = f" {team_name}" if team_name else ""
    subject = f"Your Team Media Hub code{subject_team}".strip()
    join_url = f"{FRONTEND_BASE_URL}/join" if FRONTEND_BASE_URL else ""

    body_lines = [
        f"Your verification code is: {code}",
        "",
        "This code expires in 10 minutes.",
    ]
    if join_url:
        body_lines.extend(["", f"Join here: {join_url}"])

    ses = boto3.client("ses", region_name=AWS_REGION)
    ses.send_email(
        Source=SES_FROM_EMAIL,
        Destination={"ToAddresses": [email]},
        Message={
            "Subject": {"Data": subject},
            "Body": {"Text": {"Data": "\n".join(body_lines)}},
        },
    )
