"""
/auth/verify endpoint

Verify the magic link code and create session.
"""
import json
import secrets
import hashlib
import time
from common.responses import ok, err
from common.team_codes import get_team_by_code
from common.user_auth import verify_code, add_user_to_team, create_or_get_user
from common.db import put_item
from common.config import TABLE_INVITES

def generate_session_token() -> str:
    """Generate session token (replaces invite token for authenticated users)."""
    return secrets.token_urlsafe(32)

def hash_token(token: str) -> str:
    """Hash token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()

def handle_auth_verify(event):
    """
    POST /auth/verify
    Body: {"email": "parent@example.com", "code": "123456", "team_code": "DALLAS-11B"}
    
    Returns: {"ok": true, "session_token": "...", "user_id": "...", "team_id": "..."}
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return err("Invalid JSON", status=400)
    
    email = body.get("email", "").strip().lower()
    code = body.get("code", "").strip()
    team_code = body.get("team_code", "").strip().upper()
    
    # Validate inputs
    if not email or not code or not team_code:
        return err("Missing required fields", status=400)
    
    # Verify code
    valid, error_msg = verify_code(email, code)
    if not valid:
        return err(error_msg or "Invalid code", status=401)
    
    # Get team
    team = get_team_by_code(team_code)
    if not team:
        return err("Team not found", status=404)
    
    team_id = team.get("team_id")
    
    # Get/create user and mark email verified
    user = create_or_get_user(email)
    user_id = user["user_id"]
    
    # Add user to team (default role: uploader)
    add_user_to_team(user_id, team_id, role="uploader")
    
    # Generate session token
    session_token = generate_session_token()
    token_hash = hash_token(session_token)
    
    # Store session in invites table (for backward compatibility with existing auth)
    # This allows us to use the same auth middleware
    session_record = {
        "token_hash": token_hash,
        "team_id": team_id,
        "role": "uploader",
        "user_id": user_id,  # NEW: link to user
        "email": email,
        "created_at": int(time.time()),
        "expires_at": int(time.time()) + (365 * 86400),  # 1 year
        "revoked_at": None,
    }
    
    put_item(TABLE_INVITES, session_record)
    
    return ok({
        "session_token": session_token,
        "user_id": user_id,
        "team_id": team_id,
        "team_name": team.get("team_name"),
        "role": "uploader",
    })
