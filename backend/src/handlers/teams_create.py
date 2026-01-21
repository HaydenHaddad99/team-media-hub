
import time
import uuid
import secrets

from common.config import TABLE_TEAMS, TABLE_INVITES, SETUP_KEY, FRONTEND_BASE_URL
from common.db import put_item
from common.responses import ok, err
from common.auth import token_hash
from common.audit import write_audit

def _now() -> int:
    return int(time.time())

def handle_teams_create(event, body):
    # Validate setup key if configured
    if SETUP_KEY:
        headers = (event or {}).get("headers") or {}
        provided_key = headers.get("x-setup-key") or headers.get("X-Setup-Key") or ""
        if provided_key != SETUP_KEY:
            return err("Invalid or missing setup key.", 403, code="forbidden")

    team_name = (body or {}).get("team_name", "").strip()
    if not team_name:
        return err("team_name is required.", 400, code="validation_error")

    team_id = str(uuid.uuid4())
    ts = _now()

    put_item(TABLE_TEAMS, {
        "team_id": team_id,
        "team_name": team_name,
        "created_at": ts,
    })

    # Create an admin invite token (token-only MVP).
    raw_token = secrets.token_urlsafe(32)
    put_item(TABLE_INVITES, {
        "token_hash": token_hash(raw_token),
        "team_id": team_id,
        "role": "admin",
        "created_at": ts,
        "expires_at": ts + (365 * 24 * 3600),  # 1 year for admin token (adjust later)
    })

    write_audit(team_id, "team_created", invite_token=None, meta={"team_name": team_name})

    invite_url = f"{FRONTEND_BASE_URL}/?token={raw_token}" if FRONTEND_BASE_URL else None

    return ok({
        "team_id": team_id,
        "team_name": team_name,
        "admin_invite_token": raw_token,  # Show once. Store securely client-side.
        "invite_url": invite_url,  # Shareable admin invite link
    }, 201)