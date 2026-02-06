import os
import time

from common.config import DYNAMODB, TABLE_TEAMS
from common.db import get_item
from common.responses import ok, err
from common.auth import require_invite, require_role
from common.audit import write_audit


def handle_teams_update(event, body, team_id=None):
    """Update team metadata (e.g., team_name). Only admins can update."""
    if not team_id:
        return err("team_id is required", 400, code="validation_error")

    # Verify user is admin of this team
    auth_result = require_invite(event)
    if auth_result:
        return auth_result

    role_result = require_role(event, ["admin"], team_id=team_id)
    if role_result:
        return role_result

    team_name = (body or {}).get("team_name", "").strip()
    if not team_name:
        return err("team_name is required", 400, code="validation_error")

    # Get current team to verify it exists
    try:
        team = get_item(TABLE_TEAMS, {"team_id": team_id})
        if not team:
            return err("Team not found", 404, code="not_found")
    except Exception as e:
        print(f"[TEAMS_UPDATE] Failed to get team: {e}")
        return err("Failed to get team", 500, code="server_error")

    # Update team name
    try:
        ts = int(time.time())
        teams_table = DYNAMODB.Table(TABLE_TEAMS)
        teams_table.update_item(
            Key={"team_id": team_id},
            UpdateExpression="SET team_name = :name, updated_at = :ts",
            ExpressionAttributeValues={
                ":name": team_name,
                ":ts": ts,
            }
        )
        
        # Audit log
        write_audit(team_id, "team_updated", invite_token=event.get("headers", {}).get("x-invite-token"), 
                   meta={"field": "team_name", "new_value": team_name})
        
        return ok({
            "team_id": team_id,
            "team_name": team_name,
            "team_code": team.get("team_code"),
            "updated_at": ts,
        }, 200)
    except Exception as e:
        print(f"[TEAMS_UPDATE] Failed to update team: {e}")
        return err("Failed to update team", 500, code="server_error")
