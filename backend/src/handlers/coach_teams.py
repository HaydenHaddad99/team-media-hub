"""
Get coach's teams: Coach provides user_token → return list of teams where they're admin
"""
import json
import os
from common.responses import ok, err
from common.db import get_item
from common.config import DYNAMODB

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
        
        # Get all teams where this user is a member with admin role
        team_members_table = dynamodb.Table(os.getenv("TABLE_TEAM_MEMBERS", "TeamMembersTable"))
        
        # Query by user_id (assumes GSI user-id-index exists)
        try:
            response = team_members_table.query(
                IndexName="user-id-index",
                KeyConditionExpression="user_id = :uid",
                ExpressionAttributeValues={":uid": user_id},
            )
            team_memberships = response.get("Items", [])
        except Exception as e:
            print(f"Query error: {e}")
            team_memberships = []
        
        # Get team details for each membership
        teams_table = dynamodb.Table(os.getenv("TABLE_TEAMS", "TeamsTable"))
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
                # Get an invite token for this team
                invites_table = dynamodb.Table(os.getenv("TABLE_INVITES", "InvitesTable"))
                
                # Query by team_id GSI (if exists)
                try:
                    invite_response = invites_table.query(
                        IndexName="team-id-index",
                        KeyConditionExpression="team_id = :tid AND #role = :role",
                        ExpressionAttributeNames={"#role": "role"},
                        ExpressionAttributeValues={":tid": team_id, ":role": "admin"},
                        Limit=1,
                    )
                    invite = invite_response.get("Items", [None])[0]
                    invite_token = invite.get("token") if invite else None
                except:
                    invite_token = None
                
                teams.append({
                    "team_id": team_id,
                    "team_name": team.get("team_name"),
                    "role": role,
                    "invite_token": invite_token,
                })
        
        return ok({"teams": teams})
    
    except Exception as e:
        print(f"Get coach teams error: {e}")
        return err("Failed to fetch teams", status_code=500)
