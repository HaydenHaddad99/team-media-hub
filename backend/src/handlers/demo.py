import time
import secrets

from common.config import DEMO_ENABLED, DEMO_TEAM_ID, DEMO_INVITE_TTL_DAYS, TABLE_INVITES, FRONTEND_BASE_URL
from common.responses import ok, err
from common.db import put_item
from common.auth import token_hash
from common.audit import write_audit

def _now() -> int:
    return int(time.time())

def handle_demo(event):
    """
    Public demo endpoint. Returns a short-lived uploader invite link for the demo team.
    Security posture:
    - Only enabled when DEMO_ENABLED=true
    - Requires DEMO_TEAM_ID
    - Issues uploader tokens with short TTL (default 1 day) so users can try uploading/deleting
    """
    if not DEMO_ENABLED:
        return err("Demo mode is disabled.", 404, code="not_found")

    if not DEMO_TEAM_ID:
        return err("Demo is not configured.", 500, code="server_error")

    ts = _now()
    raw_token = secrets.token_urlsafe(32)

    put_item(TABLE_INVITES, {
        "token_hash": token_hash(raw_token),
        "team_id": DEMO_TEAM_ID,
        "role": "uploader",
        "created_at": ts,
        "expires_at": ts + (max(1, DEMO_INVITE_TTL_DAYS) * 24 * 3600),
        "is_demo": True,
    })

    invite_url = f"{FRONTEND_BASE_URL}/?token={raw_token}" if FRONTEND_BASE_URL else f"/?token={raw_token}"

    # Audit without storing raw token
    write_audit(DEMO_TEAM_ID, "demo_invite_issued", invite_token=raw_token)

    return ok({
        "team_id": DEMO_TEAM_ID,
        "role": "uploader",
        "expires_in_days": max(1, DEMO_INVITE_TTL_DAYS),
        "invite_url": invite_url,
        "invite_token": raw_token,  # frontend will store it; not for long-term use
    })
