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
        print("[coach_teams] No user token provided")
        return err("User token required", status_code=401)
    
    print(f"[coach_teams] Looking up token: {user_token[:20]}...")
    
    try:
        # Look up user by token
        tokens_table = dynamodb.Table(os.getenv("TABLE_USER_TOKENS", "UserTokensTable"))
        response = tokens_table.get_item(Key={"token_hash": user_token})
        token_record = response.get("Item")
        
        if not token_record:
            print(f"[coach_teams] Token not found")
            return err("Invalid token", status_code=401)
        
        print(f"[coach_teams] ✓ Token found, user_id: {token_record.get('user_id')}")
        
        user_id = token_record.get("user_id")
        email = token_record.get("email")
        coach_verified = token_record.get("coach_verified", False)
        
        # Get all teams where this user is a member with admin role
        team_members_table = dynamodb.Table(os.getenv("TABLE_TEAM_MEMBERS", "TeamMembersTable"))
        
        # Query by user_id (partition key - no need for GSI)
        print(f"[coach_teams] Querying TeamMembersTable for user_id: {user_id}")
        try:
            response = team_members_table.query(
                KeyConditionExpression="user_id = :uid",
                ExpressionAttributeValues={":uid": user_id},
            )
            team_memberships = response.get("Items", [])
            print(f"[coach_teams] ✓ Found {len(team_memberships)} team memberships")
            for i, m in enumerate(team_memberships):
                print(f"[coach_teams]   [{i}] team_id={m.get('team_id')}, role={m.get('role')}")
        except Exception as e:
            print(f"[coach_teams] ✗ Query error: {e}")
            team_memberships = []
        
        # Get team details for each membership
        teams_table = dynamodb.Table(os.getenv("TABLE_TEAMS", "TeamsTable"))
        invites_table = dynamodb.Table(os.getenv("TABLE_INVITES", "InvitesTable"))
        teams = []
        
        for membership in team_memberships:
            team_id = membership.get("team_id")
            role = membership.get("role")
            
            print(f"[coach_teams] Processing membership: team_id={team_id}, role={role}")
            
            # Only include if admin
            if role not in ["admin", "coach"]:
                print(f"[coach_teams]   ✗ Skipped (role not admin/coach)")
                continue
            
            print(f"[coach_teams]   ✓ Role is {role}")
            
            # Get team details
            team_response = teams_table.get_item(Key={"team_id": team_id})
            team = team_response.get("Item")
            
            # Skip soft-deleted teams
            if team and team.get("deleted_at"):
                print(f"[coach_teams]   ✗ Skipped (deleted_at={team.get('deleted_at')})")
                continue
            
            if team:
                team_name = team.get("team_name", "Unnamed Team")
                print(f"[coach_teams]   team_name: {team_name}")
                
                # Try to get invite token from membership first (for coach-created teams)
                invite_token = membership.get("invite_token")
                print(f"[coach_teams]   invite_token from membership: {invite_token[:20] if invite_token else 'None'}...")
                
                if not invite_token:
                    # Fallback: scan for existing admin token
                    print(f"[coach_teams]   Scanning for existing admin token...")
                    try:
                        invite_response = invites_table.scan(
                            FilterExpression="team_id = :tid AND #role = :role",
                            ExpressionAttributeNames={"#role": "role"},
                            ExpressionAttributeValues={":tid": team_id, ":role": "admin"},
                            Limit=1,
                        )
                        items = invite_response.get("Items", [])
                        print(f"[coach_teams]   Found {len(items)} admin invites")
                        
                        if items and items[0].get("token_hash"):
                            # Token exists but we can't get the original
                            # For now, generate a new admin token
                            print(f"[coach_teams]   Creating new admin token...")
                            invite_token = _create_admin_token(team_id, invites_table)
                    except Exception as e:
                        print(f"[coach_teams]   Scan error: {e}")
                        # Create a new admin token
                        print(f"[coach_teams]   Creating new admin token (fallback)...")
                        invite_token = _create_admin_token(team_id, invites_table)
                
                if not invite_token:
                    # Last resort: create a new admin token
                    print(f"[coach_teams]   Creating new admin token (last resort)...")
                    invite_token = _create_admin_token(team_id, invites_table)
                
                print(f"[coach_teams]   Final invite_token: {invite_token[:20] if invite_token else 'FAILED'}...")
                
                teams.append({
                    "team_id": team_id,
                    "team_name": team_name,
                    "role": role,
                    "invite_token": invite_token,
                })
                print(f"[coach_teams]   ✓ Added to teams list")
            else:
                print(f"[coach_teams]   ✗ Team not found in TeamsTable")
        
        print(f"[coach_teams] ✓ Returning {len(teams)} teams")
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
