"""
Coach sign-in: Coach enters email → system creates auth code → sends via SES
"""
import hashlib
import json
from datetime import datetime, timedelta
import os
from common.responses import ok, err
from common.db import get_item, put_item, query_items
from common.config import DYNAMODB, SES_FROM_EMAIL
import boto3

dynamodb = DYNAMODB
ses = boto3.client("ses", region_name="us-east-1")

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

    try:
        # Generate 6-digit code
        import random
        code = "".join(str(random.randint(0, 9)) for _ in range(6))
        
        # Store auth code in DynamoDB
        auth_codes_table = dynamodb.Table(os.getenv("TABLE_AUTH_CODES", "AuthCodesTable"))
        
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        
        auth_codes_table.put_item(Item={
            "email": email,
            "code": code,
            "code_type": "coach_signin",
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": expires_at.isoformat(),
            "used": False,
        })
        
        # Send email if SES is configured
        if SES_FROM_EMAIL:
            try:
                ses.send_email(
                    Source=SES_FROM_EMAIL,
                    Destination={"ToAddresses": [email]},
                    Message={
                        "Subject": {"Data": "Your Team Media Hub Sign-In Code"},
                        "Body": {
                            "Html": {
                                "Data": f"""
                                <html>
                                <body style="font-family: Arial, sans-serif; color: #333;">
                                    <h2 style="color: #00aeff;">Sign In to Team Media Hub</h2>
                                    <p>Your 6-digit code:</p>
                                    <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                                        <h1 style="color: #00aeff; letter-spacing: 4px; margin: 0;">{code}</h1>
                                    </div>
                                    <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
                                    <p style="color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
                                </body>
                                </html>
                                """
                            }
                        },
                    },
                )
            except Exception as e:
                print(f"SES error: {e}")
                # Don't fail if email fails to send - still return code
        else:
            print(f"[COACH_SIGNIN] Code for {email}: {code}")
        
        return ok({"message": "Code sent to email"})
    
    except Exception as e:
        print(f"Coach signin error: {e}")
        return err("Failed to create sign-in code", status_code=500)
