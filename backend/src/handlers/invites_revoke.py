
import time

from common.config import TABLE_INVITES
from common.db import get_item, put_item
from common.responses import ok, err
from common.auth import require_invite, token_hash
from common.audit import write_audit

def _now() -> int:
    return int(time.time())

def handle_invites_revoke(event, body):
    invite, auth_err = require_invite(event, required_role="admin")
    if auth_err:
        return auth_err

    target_token = (body or {}).get("invite_token", "").strip()
    if not target_token:
        return err("invite_token is required.", 400, code="validation_error")

    team_id = invite["team_id"]
    target_hash = token_hash(target_token)

    # Lookup the target invite
    target_invite = get_item(TABLE_INVITES, {"token_hash": target_hash})
    if not target_invite:
        return err("Invite not found.", 404, code="not_found")

    # Ensure it belongs to the same team
    if target_invite.get("team_id") != team_id:
        return err("Cannot revoke invite from another team.", 403, code="forbidden")

    # Check if already revoked
    if target_invite.get("revoked_at"):
        return err("Invite already revoked.", 400, code="validation_error")

    # Mark as revoked
    target_invite["revoked_at"] = _now()
    put_item(TABLE_INVITES, target_invite)

    write_audit(
        team_id,
        "invite_revoked",
        invite_token=invite.get("_raw_token"),
        meta={"revoked_token_hash": target_hash, "revoked_role": target_invite.get("role")}
    )

    return ok({"message": "Invite revoked successfully."})
