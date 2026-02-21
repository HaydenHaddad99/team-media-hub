"""
Stripe Customer Portal session creation.
Allows coaches/admins to manage billing, cancel subscriptions, update payment methods.
"""

from common.responses import ok, err
from common.config import TABLE_TEAMS, TABLE_TEAM_MEMBERS
from common.db import get_item, query_items
from common.stripe_service import create_portal_session
from common.audit import write_audit


def handle_billing_portal(event):
    """
    POST /billing/portal
    Create a Stripe Customer Portal session for subscription management.
    Auth: coach/admin only (via user token)
    """
    # Get user_id from user-token header (coach authentication)
    headers = event.get("headers") or {}
    user_token = headers.get("x-user-token") or headers.get("X-User-Token")
    
    if not user_token:
        return err("Missing user token. Coach authentication required.", 401, code="unauthorized")
    
    # Verify user token and get user_id
    from common.auth import get_user_from_token
    user_record, user_err = get_user_from_token(event)
    if user_err:
        return user_err
    if not user_record:
        return err("Invalid user token.", 401, code="unauthorized")
    
    user_id = user_record.get("user_id")
    
    # Parse body to get team_id
    import json
    try:
        body = json.loads(event.get("body") or "{}")
        team_id = body.get("team_id")
    except (json.JSONDecodeError, ValueError):
        return err("Invalid JSON body.", 400, code="validation_error")
    
    if not team_id:
        return err("Missing team_id in request body.", 400, code="validation_error")
    
    # Verify user is admin/coach for this team
    from boto3.dynamodb.conditions import Key
    member_items = query_items(
        TABLE_TEAM_MEMBERS,
        Key("user_id").eq(user_id) & Key("team_id").eq(team_id),
    )
    
    if not member_items:
        return err("Not a member of this team.", 403, code="forbidden")
    
    member = member_items[0]
    role = member.get("role", "viewer")
    
    if role not in ("admin", "coach"):
        return err("Only coaches/admins can access billing portal.", 403, code="forbidden")
    
    # Get team record
    team = get_item(TABLE_TEAMS, {"team_id": team_id})
    if not team:
        return err("Team not found.", 404, code="not_found")
    
    # Create portal session
    try:
        session = create_portal_session(team)
        write_audit(team_id, "billing_portal_created", user_id=user_id)
        return ok({"url": session.get("url")})
    except ValueError as e:
        return err(str(e), 400, code="validation_error")
    except Exception as e:
        print(f"[billing_portal] Error: {e}")
        return err("Failed to create portal session.", 500, code="server_error")
