"""
Get coach's teams: Coach provides user_token → return list of teams where they're admin
"""
import json
import os
import time
import secrets
from common.responses import ok, err
from common.db import get_item
from common.config import DYNAMODB
from common.auth import token_hash

dynamodb = DYNAMODB

def handle_get_coach_teams(event):
    """
    GET /coach/teams
    Headers: x-user-token
    Returns: { teams: [{ team_id, team_name, role, invite_token }] }
    """
    user_token = event.get("headers", {}).get("x-user-token", "").strip()
    if not user_token:
        return err("User token required", status_code=401)
    
    try:
        # Look up user by token
        tokens_table = dynamodb.Table(os.getenv("TABLE_USER_TOKENS", "UserTokensTable"))
        response = tokens_table.get_item(Key={"token_hash": user_token})
        token_record = response.get("Item")
        
        if not token_record:
            return err("Invalid token", status_code=401)
        
        user_id = token_record.get("user_id")
        email = token_record.get("email")
        coach_verified = token_record.get("coach_verified", False)
        
        # Get all teams where this user is a member with admin role
        team_members_table = dynamodb.Table(os.getenv("TABLE_TEAM_MEMBERS", "TeamMembersTable"))
        
        # Query by user_id (partition key - no need for GSI)
        try:
            response = team_members_table.query(
                KeyConditionExpression="user_id = :uid",
                ExpressionAttributeValues={":uid": user_id},
            )
            team_memberships = response.get("Items", [])
        except Exception as e:
            print(f"Query error: {e}")
            team_memberships = []
        
        # Get team details for each membership
        teams_table = dynamodb.Table(os.getenv("TABLE_TEAMS", "TeamsTable"))
        invites_table = dynamodb.Table(os.getenv("TABLE_INVITES", "InvitesTable"))
        teams = []
        
        for membership in team_memberships:
            team_id = membership.get("team_id")
            role = membership.get("role")
            
            # Only include if admin
            if role not in ["admin", "coach"]:
                continue
            
            # Get team details
            team_response = teams_table.get_item(Key={"team_id": team_id})
            team = team_response.get("Item")
            
            if team:
                # Try to get invite token from membership first (for coach-created teams)
                invite_token = membership.get("invite_token")
                
                if not invite_token:
                    # Fallback: scan for existing admin token
                    try:
                        invite_response = invites_table.scan(
                            FilterExpression="team_id = :tid AND #role = :role",
                            ExpressionAttributeNames={"#role": "role"},
                            ExpressionAttributeValues={":tid": team_id, ":role": "admin"},
                            Limit=1,
                        )
                        # Note: InvitesTable stores token_hash, not the token itself
                        # So we can't retrieve the original token
                        items = invite_response.get("Items", [])
                        if items and items[0].get("token_hash"):
                            # Token exists but we can't get the original
                            # For now, generate a new admin token
                            invite_token = _create_admin_token(team_id, invites_table)
                    except:
                        # Create a new admin token
                        invite_token = _create_admin_token(team_id, invites_table)
                
                if not invite_token:
                    # Last resort: create a new admin token
                    invite_token = _create_admin_token(team_id, invites_table)
                
                teams.append({
                    "team_id": team_id,
                    "team_name": team.get("team_name"),
                    "role": role,
                    "invite_token": invite_token,
                })
        
        return ok({"teams": teams, "coach_verified": coach_verified})
    
    except Exception as e:
        print(f"Get coach teams error: {e}")
        return err("Failed to fetch teams", status_code=500)


def _create_admin_token(team_id, invites_table):
    """Generate and store a new admin invite token for a team"""
    try:
        raw_token = secrets.token_urlsafe(32)
        ts = int(time.time())
        
        invites_table.put_item(Item={
            "token_hash": token_hash(raw_token),
            "team_id": team_id,
            "role": "admin",
            "created_at": ts,
            "expires_at": ts + (365 * 24 * 3600),
        })
        
        return raw_token
    except Exception as e:
        print(f"Failed to create admin token: {e}")
        return None
