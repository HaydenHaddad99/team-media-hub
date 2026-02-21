
from common.responses import ok, err
from common.auth import require_invite, get_user_from_token
from common.config import TABLE_TEAMS
from common.db import get_item
from common.audit import write_audit


def handle_me(event):
    # Try invite-token auth first (traditional parents via invite link)
    invite, invite_err = require_invite(event)
    if not invite_err:
        # Using invite-token auth
        team_id = invite.get("team_id")
        if not team_id:
            return err("Invalid invite record.", 401, code="unauthorized")

        team = get_item(TABLE_TEAMS, {"team_id": team_id}) or {}

        write_audit(team_id, "me", invite_token=invite.get("_raw_token"))

        response = {
            "team": {
                "team_id": team_id,
                "team_name": team.get("team_name", "Team"),
                "team_code": team.get("team_code"),
                "plan": team.get("plan", "free"),
                "storage_limit_gb": team.get("storage_limit_gb", 10),
                "storage_limit_bytes": team.get("storage_limit_bytes", 10 * 1024 * 1024 * 1024),
                "used_bytes": team.get("used_bytes", 0),
                "subscription_status": team.get("subscription_status"),
            },
            "invite": {
                "role": invite.get("role", "viewer"),
                "expires_at": invite.get("expires_at"),
            }
        }
        
        # Include user_id if available (for authenticated parents who joined via email/verify)
        user_id = invite.get("user_id")
        if user_id:
            response["user_id"] = user_id
        
        return ok(response)
    
    # Try user-token auth (coach/authenticated users)
    user_record, user_err = get_user_from_token(event)
    if user_err:
        return user_err  # Explicit error retrieving user token
    
    if user_record:
        # Using user-token auth
        # For coaches, we need to get their team context from TeamMembersTable
        # But user_id alone doesn't give us a single team - coaches can be on multiple teams
        # For now, return the user info without a specific team
        # (Coach dashboard shows multiple teams; Feed requires invite token per team)
        
        user_id = user_record.get("user_id")
        email = user_record.get("email")
        
        write_audit(None, "me_user", user_id=user_id)  # audit with user_id, no team context
        
        return ok({
            "user_id": user_id,
            "email": email,
            "auth_type": "user",
            # No team context for multi-team users
        })
    
    # Neither auth method provided
    return err("Missing authentication token.", 401, code="unauthorized")
