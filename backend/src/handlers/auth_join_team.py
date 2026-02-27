"""
/auth/join-team endpoint

Parents join a team by providing:
1. Email
2. Team code
3. Receives verification code via email
"""
from common.responses import ok, err
from common.team_codes import get_team_by_code, validate_team_code_format
from common.user_auth import create_or_get_user, generate_verification_code, store_verification_code, send_magic_link_email
from common.rate_limiter import check_ip_rate_limit, check_email_rate_limit

def handle_auth_join_team(event, body=None):
    """
    POST /auth/join-team
    Body: {"email": "parent@example.com", "team_code": "DALLAS-11B"}
    
    Returns: {"ok": true, "message": "Verification code sent to email"}
    """
    if body is None:
        body = {}
    try:
        email = body.get("email", "").strip().lower()
        team_code = body.get("team_code", "").strip().upper()
        
        # Validate inputs
        if not email or "@" not in email:
            return err("Invalid email address", status_code=400)
        
        if not validate_team_code_format(team_code):
            return err("Invalid team code format", status_code=400)
        
        # Check IP rate limit
        ip_allowed, ip_error = check_ip_rate_limit(event)
        if not ip_allowed:
            return err(ip_error, status_code=429, code="rate_limited")
        
        # Check email rate limit
        email_allowed, email_error = check_email_rate_limit(email)
        if not email_allowed:
            return err(email_error, status_code=429, code="rate_limited")
        
        # Check if team exists
        team = get_team_by_code(team_code)
        if not team:
            return err("Team not found. Check your team code.", status_code=404)
        
        # Get or create user
        user = create_or_get_user(email)
        
        # Generate and store verification code
        code = generate_verification_code()
        store_verification_code(email, code, ttl_seconds=600)  # 10 minutes
        
        # Send email (in production, would use SES)
        team_name = team.get("team_name", "Team")
        send_magic_link_email(email, code, team_name)
        
        return ok({
            "message": "Verification code sent to your email",
            "email": email,
            "team_name": team_name,
        })
    except Exception as e:
        import traceback
        error_detail = str(e)
        print(f"[ERROR] /auth/join-team: {error_detail}")
        traceback.print_exc()
        # Return more detailed error for debugging (remove in production)
        return err(f"Server error: {error_detail}", status_code=500)
