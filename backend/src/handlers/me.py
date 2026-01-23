
from common.responses import ok, err
from common.auth import require_invite
from common.config import TABLE_TEAMS
from common.db import get_item
from common.audit import write_audit


def handle_me(event):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    team_id = invite.get("team_id")
    if not team_id:
        return err("Invalid invite record.", 401, code="unauthorized")

    team = get_item(TABLE_TEAMS, {"team_id": team_id}) or {}

    write_audit(team_id, "me", invite_token=invite.get("_raw_token"))

    return ok({
        "team": {
            "team_id": team_id,
            "team_name": team.get("team_name", "Team"),
        },
        "invite": {
            "role": invite.get("role", "viewer"),
            "expires_at": invite.get("expires_at"),
        }
    })
