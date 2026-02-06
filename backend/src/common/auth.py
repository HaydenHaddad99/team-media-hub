
import hashlib
import time
import os
from typing import Dict, Optional, Tuple

from boto3.dynamodb.conditions import Key

from .config import TABLE_INVITES, DYNAMODB
from .db import get_item
from .responses import err

def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def require_invite(event: Dict, required_role: Optional[str] = None) -> Tuple[Optional[Dict], Optional[Dict]]:
    """
    Returns: (invite_record, error_response)
    If required_role is specified, also checks role permission.
    """
    headers = event.get("headers") or {}
    token = headers.get("x-invite-token") or headers.get("X-Invite-Token")
    if not token:
        return None, err("Missing invite token.", 401, code="unauthorized")

    h = token_hash(token)
    invite = get_item(TABLE_INVITES, {"token_hash": h})
    if not invite:
        return None, err("Invalid invite token.", 401, code="unauthorized")

    # Check if revoked
    if invite.get("revoked_at"):
        return None, err("Invite token has been revoked.", 401, code="unauthorized")

    now = int(time.time())
    exp = int(invite.get("expires_at", 0))
    if exp and now > exp:
        return None, err("Invite token expired.", 401, code="unauthorized")

    # Check role if specified
    if required_role:
        role = invite.get("role")
        if role != required_role:
            return None, err("Insufficient permissions.", 403, code="forbidden")

    # Attach raw token only in-memory for audit hashing; do not persist raw token.
    invite["_raw_token"] = token
    return invite, None

def require_role(invite: Dict, allowed_roles: set) -> Optional[Dict]:
    role = invite.get("role")
    if role not in allowed_roles:
        return err("Insufficient permissions.", 403, code="forbidden")
    return None

def get_user_from_token(event: Dict) -> Tuple[Optional[Dict], Optional[Dict]]:
    """
    Get user record from x-user-token header.
    Returns: (user_record with user_id and email, error_response)
    """
    headers = event.get("headers") or {}
    token = headers.get("x-user-token") or headers.get("X-User-Token")
    if not token:
        return None, None  # Not an error, just not provided
    
    try:
        dynamodb = DYNAMODB
        tokens_table = dynamodb.Table(os.getenv("TABLE_USER_TOKENS", "UserTokensTable"))
        response = tokens_table.get_item(Key={"token_hash": token})
        token_record = response.get("Item")
        
        if not token_record:
            return None, err("Invalid user token.", 401, code="unauthorized")
        
        return token_record, None
    except Exception as e:
        print(f"Error getting user token: {e}")
        return None, err("Failed to validate user token.", 500)
