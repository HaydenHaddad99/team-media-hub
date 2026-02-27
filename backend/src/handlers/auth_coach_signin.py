"""
Coach sign-in: Coach enters email → system creates auth code → sends via email service
"""
import hashlib
import json
from datetime import datetime, timedelta
import os
from common.responses import ok, err
from common.db import get_item, put_item, query_items
from common.config import DYNAMODB
from common.email_service import send_coach_signin_code
from common.rate_limiter import check_ip_rate_limit, check_email_rate_limit

dynamodb = DYNAMODB

def handle_coach_signin(event, body=None):
    """
    POST /auth/coach-signin
    Body: { email: "coach@example.com" }
    """
    if not body:
        body = json.loads(event.get("body", "{}"))
    
    email = (body.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return err("Invalid email", status_code=400)

    # Check IP rate limit
    ip_allowed, ip_error = check_ip_rate_limit(event)
    if not ip_allowed:
        return err(ip_error, status_code=429, code="rate_limited")
    
    # Check email rate limit
    email_allowed, email_error = check_email_rate_limit(email)
    if not email_allowed:
        return err(email_error, status_code=429, code="rate_limited")

    try:
        # Generate 6-digit code
        import random
        code = "".join(str(random.randint(0, 9)) for _ in range(6))
        
        # Store auth code in DynamoDB
        auth_codes_table = dynamodb.Table(os.getenv("TABLE_AUTH_CODES", "AuthCodesTable"))
        
        # Hash the code for storage
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        
        auth_codes_table.put_item(Item={
            "code_hash": code_hash,  # Partition key
            "email": email,
            "code": code,
            "code_type": "coach_signin",
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": expires_at.isoformat(),
            "used": False,
        })
        
        # Send email via email service
        result = send_coach_signin_code(email, code)
        if not result["success"]:
            print(f"[COACH_SIGNIN] Email failed: {result.get('error')}. Code for {email}: {code}")
        
        return ok({"message": "Code sent to email"})
    
    except Exception as e:
        print(f"Coach signin error: {e}")
        return err("Failed to create sign-in code", status_code=500)
