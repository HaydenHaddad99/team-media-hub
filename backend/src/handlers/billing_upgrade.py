import os

import stripe

from common.responses import ok, err
from common.config import TABLE_TEAMS, DYNAMODB
from common.db import get_item
from common.auth import get_user_from_token
from common.stripe_service import upgrade_subscription


def _require_coach_admin(event, team_id: str):
    user_record, user_err = get_user_from_token(event)
    if user_err:
        return None, user_err
    if not user_record:
        return None, err("User token required.", 401, code="unauthorized")

    user_id = user_record.get("user_id")
    if not user_id:
        return None, err("Invalid user token.", 401, code="unauthorized")

    team_members_table = DYNAMODB.Table(os.getenv("TABLE_TEAM_MEMBERS", "TeamMembersTable"))
    resp = team_members_table.get_item(Key={"user_id": user_id, "team_id": team_id})
    membership = resp.get("Item")
    role = (membership or {}).get("role")
    if role not in ("admin", "coach"):
        return None, err("Not authorized.", 403, code="forbidden")

    return user_record, None


def handle_billing_upgrade(event, body=None):
    if body is None:
        body = {}

    team_id = (body.get("team_id") or "").strip()
    tier = (body.get("tier") or "").strip()

    if not team_id or tier not in ("pro",):
        return err("team_id and tier are required.", 400, code="validation_error")

    _, auth_err = _require_coach_admin(event, team_id)
    if auth_err:
        return auth_err

    team = get_item(TABLE_TEAMS, {"team_id": team_id})
    if not team:
        return err("Team not found.", 404, code="not_found")

    try:
        upgrade_subscription(team, tier)
        return ok({"ok": True})
    except ValueError as e:
        return err(str(e), 400, code="validation_error")
    except Exception as e:
        print(f"[billing_upgrade] Error: {e}")
        return err("Failed to upgrade subscription.", 500, code="server_error")
