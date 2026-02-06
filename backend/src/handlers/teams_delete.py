import os
import time

from common.config import DYNAMODB, TABLE_TEAMS, TABLE_INVITES
from common.db import get_item
from common.responses import ok, err
from common.auth import require_invite, require_role
from common.audit import write_audit
from boto3.dynamodb.conditions import Key as DynamoKey


def handle_teams_delete(event, team_id=None):
    """Delete a team and revoke all its invite tokens. Only admins can delete."""
    if not team_id:
        return err("team_id is required", 400, code="validation_error")

    # Verify user is admin of this team
    auth_result = require_invite(event)
    if auth_result:
        return auth_result

    role_result = require_role(event, ["admin"], team_id=team_id)
    if role_result:
        return role_result

    try:
        # Get team to verify it exists
        team = get_item(TABLE_TEAMS, {"team_id": team_id})
        if not team:
            return err("Team not found", 404, code="not_found")

        ts = int(time.time())

        # Soft delete: mark team as deleted
        teams_table = DYNAMODB.Table(TABLE_TEAMS)
        teams_table.update_item(
            Key={"team_id": team_id},
            UpdateExpression="SET deleted_at = :ts",
            ExpressionAttributeValues={":ts": ts}
        )

        # Revoke all invite tokens for this team
        try:
            invites_table = DYNAMODB.Table(TABLE_INVITES)
            # Query all invites for this team using GSI
            response = invites_table.query(
                IndexName="gsi1pk-gsi1sk-index",
                KeyConditionExpression=DynamoKey("gsi1pk").eq(team_id)
            )
            
            for invite in response.get("Items", []):
                invites_table.update_item(
                    Key={"token_hash": invite["token_hash"]},
                    UpdateExpression="SET revoked_at = :ts",
                    ExpressionAttributeValues={":ts": ts}
                )
        except Exception as e:
            print(f"[TEAMS_DELETE] Warning: Failed to revoke invites: {e}")
            # Continue anyway - team is already marked deleted

        # Audit log
        write_audit(team_id, "team_deleted", invite_token=event.get("headers", {}).get("x-invite-token"),
                   meta={"team_name": team.get("team_name")})

        return ok({
            "team_id": team_id,
            "deleted_at": ts,
        }, 200)

    except Exception as e:
        print(f"[TEAMS_DELETE] Failed to delete team: {e}")
        return err("Failed to delete team", 500, code="server_error")
