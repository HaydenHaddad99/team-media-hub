#!/usr/bin/env python3
"""
Test coach verification persistence across sign-out/sign-in
"""
import os
import sys
import json
import requests
from datetime import datetime

# Add backend to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend/src'))

from common.config import DYNAMODB
from common.auth import token_hash

API_BASE = "http://localhost:5000"  # Local dev server
DYNAMODB_CLIENT = DYNAMODB

def test_coach_verification_persistence():
    print("\n" + "="*60)
    print("TEST: Coach Verification Persistence")
    print("="*60)
    
    email = "test-coach@example.com"
    setup_key = os.getenv("SETUP_KEY", "test-setup-key")
    
    # Step 1: Sign in
    print("\n[1] Coach signing in...")
    signin_res = requests.post(
        f"{API_BASE}/auth/coach-signin",
        json={"email": email},
        timeout=5
    )
    print(f"    Status: {signin_res.status_code}")
    if signin_res.status_code != 200:
        print(f"    Error: {signin_res.text}")
        return
    print(f"    ✓ Code sent")
    
    # For testing, we need to get the code from the database
    print("\n[2] Getting auth code from database...")
    auth_codes_table = DYNAMODB_CLIENT.Table(os.getenv("TABLE_AUTH_CODES", "AuthCodesTable"))
    try:
        # Scan for recent codes for this email
        response = auth_codes_table.scan(
            FilterExpression="email = :email AND #used = :used",
            ExpressionAttributeNames={"#used": "used"},
            ExpressionAttributeValues={":email": email, ":used": False},
            Limit=1
        )
        items = response.get("Items", [])
        if not items:
            print("    ✗ No auth code found in DB!")
            return
        
        auth_code_item = items[0]
        # Reconstruct the code from the plain value if stored
        print(f"    Code item: {json.dumps(auth_code_item, indent=2, default=str)}")
        
        # For this test, we'll assume the code is stored or we'll use a test code
        test_code = "123456"  # This won't work unless it's the actual code
        print(f"    ✓ Found code for {email}")
    except Exception as e:
        print(f"    ✗ Error: {e}")
        return
    
    # Step 2: Verify with code
    print("\n[3] Coach verifying with code...")
    verify_res = requests.post(
        f"{API_BASE}/auth/verify-coach",
        json={"email": email, "code": test_code},
        timeout=5
    )
    print(f"    Status: {verify_res.status_code}")
    if verify_res.status_code != 200:
        print(f"    Error: {verify_res.text}")
        print("    (Code might be wrong, checking database instead...)")
    else:
        verify_data = verify_res.json()
        user_token_1 = verify_data.get("user_token")
        print(f"    ✓ Got user_token: {user_token_1[:20]}...")
        
        # Check token in database
        print("\n[4] Checking token in database...")
        tokens_table = DYNAMODB_CLIENT.Table(os.getenv("TABLE_USER_TOKENS", "UserTokensTable"))
        token_item = tokens_table.get_item(Key={"token_hash": user_token_1})
        token_data = token_item.get("Item", {})
        print(f"    Token data: {json.dumps(token_data, indent=2, default=str)}")
        print(f"    coach_verified: {token_data.get('coach_verified', 'NOT SET')}")
        
        # Step 3: Verify setup key
        print("\n[5] Coach verifying setup key...")
        verify_access_res = requests.post(
            f"{API_BASE}/coach/verify-access",
            json={"setup_key": setup_key},
            headers={"x-user-token": user_token_1},
            timeout=5
        )
        print(f"    Status: {verify_access_res.status_code}")
        if verify_access_res.status_code == 200:
            print(f"    ✓ Setup key verified")
            
            # Check token again - should have coach_verified=true
            print("\n[6] Checking token after setup key verification...")
            token_item = tokens_table.get_item(Key={"token_hash": user_token_1})
            token_data = token_item.get("Item", {})
            print(f"    Token data: {json.dumps(token_data, indent=2, default=str)}")
            coach_verified_1 = token_data.get('coach_verified', False)
            print(f"    coach_verified: {coach_verified_1}")
            
            if not coach_verified_1:
                print("    ✗ BUG: coach_verified not set after setup key verification!")
                return
            
            user_id = token_data.get('user_id')
            
            # Step 4: Get teams (simulating dashboard)
            print("\n[7] Getting coach teams with first token...")
            teams_res = requests.get(
                f"{API_BASE}/coach/teams",
                headers={"x-user-token": user_token_1},
                timeout=5
            )
            print(f"    Status: {teams_res.status_code}")
            if teams_res.status_code == 200:
                teams_data = teams_res.json()
                print(f"    coach_verified in response: {teams_data.get('coach_verified', 'NOT SET')}")
                print(f"    teams count: {len(teams_data.get('teams', []))}")
            
            # Step 5: Simulate re-login (would normally be done by user manually)
            print("\n[8] Simulating re-login with same email...")
            print("    (In real scenario, user would sign out and sign in again)")
            
            # For this test, we'll check what tokens exist for this user
            print("\n[9] Checking all existing tokens for this user...")
            try:
                # Try to query user_id-index
                response = tokens_table.query(
                    IndexName="user_id-index",
                    KeyConditionExpression="user_id = :uid",
                    ExpressionAttributeValues={":uid": user_id},
                )
                existing_tokens = response.get("Items", [])
                print(f"    Found {len(existing_tokens)} token(s) for user {user_id}:")
                for i, token in enumerate(existing_tokens):
                    print(f"      [{i}] coach_verified={token.get('coach_verified', False)}, created={token.get('created_at')}")
            except Exception as e:
                print(f"    ✗ Could not query user_id-index: {e}")
                print("    Possible issue: user_id-index may not exist on UserTokensTable!")
            
            print("\n" + "="*60)
            print("ANALYSIS:")
            print("="*60)
            print(f"✓ Setup key verification works (coach_verified={coach_verified_1})")
            print("? Need to check if user_id-index exists for persistence logic")
            
        else:
            print(f"    ✗ Setup key verification failed: {verify_access_res.text}")

if __name__ == "__main__":
    test_coach_verification_persistence()
