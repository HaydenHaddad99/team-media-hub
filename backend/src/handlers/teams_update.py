import os
import time

from common.config import DYNAMODB, TABLE_TEAMS, TABLE_TEAM_MEMBERS
from common.db import get_item
from common.responses import ok, err
from common.auth import require_invite, require_role
from common.audit import write_audit


def handle_teams_update(event, body, team_id=None):
    """Update team metadata (e.g., team_name). Only admins can update."""
    if not team_id:
        return err("team_id is required", 400, code="validation_error")

    # Check if this is a coach - if so, verify coach_verified flag
    user_token = event.get("headers", {}).get("x-user-token", "").strip()
    if user_token:
        try:
            tokens_table = DYNAMODB.Table(os.getenv("TABLE_USER_TOKENS", "UserTokensTable"))
            response = tokens_table.get_item(Key={"token_hash": user_token})
            token_record = response.get("Item")
            if not token_record:
                return err("Invalid user token", 401, code="unauthorized")
            if not token_record.get("coach_verified", False):
                return err("Coach access not verified. Please verify your setup key first.", 403, code="forbidden")
            
            # Coach verified - check if they're admin of this team
            user_id = token_record.get("user_id")
            team_members_table = DYNAMODB.Table(os.getenv("TABLE_TEAM_MEMBERS", "TeamMembersTable"))
            try:
                response = team_members_table.get_item(Key={
                    "user_id": user_id,
                    "team_id": team_id
                })
                membership = response.get("Item")
                if not membership or membership.get("role") != "admin":
                    return err("Insufficient permissions. Only admins can update teams.", 403, code="forbidden")
            except Exception as e:
                print(f"Warning: Failed to check team membership: {e}")
                return err("Failed to verify permissions", 500, code="server_error")
            
            # Coach is admin, proceed with update
            return _update_team(team_id, body, event)
        except Exception as e:
            print(f"Error in coach update path: {e}")
            return err("Failed to update team", 500, code="server_error")

    # If no user token, verify user is admin via invite token
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    if invite.get("team_id") != team_id:
        return err("Insufficient permissions.", 403, code="forbidden")

    role_err = require_role(invite, {"admin"})
    if role_err:
        return role_err

    return _update_team(team_id, body, event)


def _update_team(team_id, body, event):
    """Internal function to perform team update."""
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
