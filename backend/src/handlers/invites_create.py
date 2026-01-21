
import time
import secrets

from common.config import TABLE_INVITES, FRONTEND_BASE_URL
from common.db import put_item
from common.responses import ok, err
from common.auth import require_invite, require_role, token_hash
from common.audit import write_audit

def _now() -> int:
    return int(time.time())

def handle_invites_create(event, body):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    # Only admin can create invites
    role_err = require_role(invite, {"admin"})
    if role_err:
        return role_err

    team_id = (body or {}).get("team_id") or invite.get("team_id")
    role = (body or {}).get("role seen", (body or {}).get("role", "")).strip()
    if role not in {"viewer", "uploader", "admin"}:
        return err("role must be viewer, uploader, or admin.", 400, code="validation_error")

    expires_in_days = int((body or {}).get("expires_in_days", 30))
    expires_in_days = max(1, min(expires_in_days, 365))  # 1..365

    ts = _now()
    raw_token = secrets.token_urlsafe(32)
    put_item(TABLE_INVITES, {
        "token_hash": token_hash(raw_token),
        "team_id": team_id,
        "role": role,
        "created_at": ts,
        "expires_at": ts + (expires_in_days * 24 * 3600),
    })

    # Build invite URL for front-end with CloudFront domain
    invite_url = f"{FRONTEND_BASE_URL}/?token={raw_token}" if FRONTEND_BASE_URL else None
    write_audit(team_id, "invite_created", invite_token=invite.get("_raw_token"), meta={"role": role, "expires_in_days": expires_in_days})

    return ok({
        "team_id": team_id,
        "role": role,
        "expires_in_days": expires_in_days,
        "invite_token": raw_token,
        "invite_url": invite_url,  # Real shareable URL if FRONTEND_BASE_URL is set
    }, 201)