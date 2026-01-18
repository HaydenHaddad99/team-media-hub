
import hashlib
import time
from typing import Dict, Optional, Tuple

from boto3.dynamodb.conditions import Key

from .config import TABLE_INVITES
from .db import get_item
from .responses import err

def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def require_invite(event: Dict) -> Tuple[Optional[Dict], Optional[Dict]]:
    """
    Returns: (invite_record, error_response)
    """
    headers = event.get("headers") or {}
    token = headers.get("x-invite-token") or headers.get("X-Invite-Token")
    if not token:
        return None, err("Missing invite token.", 401, code="unauthorized")

    h = token_hash(token)
    invite = get_item(TABLE_INVITES, {"token_hash": h})
    if not invite:
        return None, err("Invalid invite token.", 401, code="unauthorized")

    now = int(time.time())
    exp = int(invite.get("expires_at", 0))
    if exp and now > exp:
        return None, err("Invite token expired.", 401, code="unauthorized")

    # Attach raw token only in-memory for audit hashing; do not persist raw token.
    invite["_raw_token"] = token
    return invite, None

def require_role(invite: Dict, allowed_roles: set) -> Optional[Dict]:
    role = invite.get("role")
    if role not in allowed_roles:
        return err("Insufficient permissions.", 403, code="forbidden")
    return None