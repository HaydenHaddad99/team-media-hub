"""
Coach verify: Coach enters email + code → system creates/finds user → returns user_token
"""
import hashlib
import json
from datetime import datetime
import os
from common.responses import ok, err
from common.db import get_item, put_item
from common.config import DYNAMODB

dynamodb = DYNAMODB

def handle_verify_coach(event, body=None):
    """
    POST /auth/verify-coach
    Body: { email: "coach@example.com", code: "123456" }
    """
    if not body:
        body = json.loads(event.get("body", "{}"))
    
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    
    if not email or not code:
        return err("Email and code required", status_code=400)
    
    try:
        # Verify auth code
        auth_codes_table = dynamodb.Table(os.getenv("TABLE_AUTH_CODES", "AuthCodesTable"))
        
        # Hash the code for lookup
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        
        response = auth_codes_table.get_item(Key={
            "code_hash": code_hash,
        })
        
        auth_code = response.get("Item")
        if not auth_code:
            return err("Invalid code", status_code=400)
        
        # Verify email matches
        if auth_code.get("email") != email:
            return err("Email mismatch", status_code=400)
        
        # Check expiration
        expires_at = datetime.fromisoformat(auth_code.get("expires_at", ""))
        if datetime.utcnow() > expires_at:
            return err("Code expired", status_code=400)
        
        # Check already used
        if auth_code.get("used"):
            return err("Code already used", status_code=400)
        
        # Mark code as used
        auth_codes_table.update_item(
            Key={"code_hash": code_hash},
            UpdateExpression="SET #used = :val",
            ExpressionAttributeNames={"#used": "used"},
            ExpressionAttributeValues={":val": True},
        )
        
        # Find or create user
        users_table = dynamodb.Table(os.getenv("TABLE_USERS", "UsersTable"))
        
        # Query by email GSI
        user = None
        try:
            print(f"Attempting to query email-index for {email}")
            response = users_table.query(
                IndexName="email-index",
                KeyConditionExpression="email = :email",
                ExpressionAttributeValues={":email": email},
            )
            items = response.get("Items", [])
            print(f"Query returned {len(items)} items")
            user = items[0] if items else None
            if user:
                print(f"✓ Found existing user for {email}: {user.get('user_id')}")
            else:
                print(f"✗ No user found in query for email {email}")
        except Exception as e:
            print(f"✗ Email index query failed: {type(e).__name__}: {e}")
            # Fallback: scan entire table for this email
            print(f"Attempting fallback scan for email {email}")
            try:
                response = users_table.scan(
                    FilterExpression="email = :email",
                    ExpressionAttributeValues={":email": email},
                )
                items = response.get("Items", [])
                user = items[0] if items else None
                if user:
                    print(f"✓ Found user via scan for {email}: {user.get('user_id')}")
                else:
                    print(f"✗ Scan also returned no results for {email}")
            except Exception as scan_e:
                print(f"✗ Scan also failed: {type(scan_e).__name__}: {scan_e}")
                user = None
        
        if not user:
            # Create new user
            import uuid
            user_id = str(uuid.uuid4())
            user = {
                "user_id": user_id,
                "email": email,
                "created_at": datetime.utcnow().isoformat(),
                "role": "coach",  # coaches always created as coaches
            }
            users_table.put_item(Item=user)
            print(f"➕ Created new user {user_id} for email {email}")
        else:
            user_id = user.get("user_id")
        
        # Generate user token (SHA256 of user_id + random)
        import secrets
        random_suffix = secrets.token_hex(16)
        token_plain = f"{user_id}#{random_suffix}"
        user_token = hashlib.sha256(token_plain.encode()).hexdigest()
        
        # Store token mapping for future lookups
        tokens_table = dynamodb.Table(os.getenv("TABLE_USER_TOKENS", "UserTokensTable"))
        tokens_table.put_item(Item={
            "token_hash": user_token,
            "user_id": user_id,
            "email": email,
            "created_at": datetime.utcnow().isoformat(),
        })
        
        return ok({
            "user_id": user_id,
            "user_token": user_token,
            "email": email,
        })
    
    except Exception as e:
        print(f"Coach verify error: {e}")
        return err("Verification failed", status_code=500)
