#!/usr/bin/env python3
"""
Direct test for /coach/teams endpoint
Tests against the live deployed API
"""
import os
import sys
import boto3
import requests
import hashlib
from datetime import datetime, timedelta

# Configuration
DYNAMODB_REGION = "us-east-1"
API_BASE = os.getenv("API_BASE_URL", "https://5gt1117eh5.execute-api.us-east-1.amazonaws.com")
TEST_EMAIL = "hayden.haddad@gmail.com"

# Initialize DynamoDB
dynamodb = boto3.resource("dynamodb", region_name=DYNAMODB_REGION)
tokens_table = dynamodb.Table(os.getenv("TABLE_USER_TOKENS", "TeamMediaHubStack-UserTokensTableDF29304D-1FBRIKAHW0E5N"))
auth_codes_table = dynamodb.Table(os.getenv("TABLE_AUTH_CODES", "TeamMediaHubStack-AuthCodesTableA2697F2B-JM39DUSQK5YC"))

def test_coach_teams_endpoint():
    print("\n" + "="*60)
    print("Testing /coach/teams endpoint")
    print("="*60)
    
    # Step 1: Find existing token for the test email
    print(f"\n[Step 1] Looking for existing user token for {TEST_EMAIL}...")
    try:
        response = tokens_table.query(
            IndexName="user-id-index" if "user-id-index" in dir(tokens_table) else None,
            FilterExpression="email = :email",
            ExpressionAttributeValues={":email": TEST_EMAIL},
        ) if "user-id-index" in dir(tokens_table) else tokens_table.scan(
            FilterExpression="email = :email",
            ExpressionAttributeValues={":email": TEST_EMAIL},
        )
        
        items = response.get("Items", [])
        if not items:
            print(f"✗ No token found for {TEST_EMAIL}")
            print("Step 2: Creating test token via auth_verify_coach endpoint...")
            
            # Generate a test auth code
            import random
            test_code = "".join(str(random.randint(0, 9)) for _ in range(6))
            
            # First, send signin request (this would normally happen via UI)
            signin_resp = requests.post(
                f"{API_BASE}/auth/coach-signin",
                json={"email": TEST_EMAIL},
            )
            print(f"  /auth/coach-signin: {signin_resp.status_code}")
            
            if signin_resp.status_code == 200:
                # For demo purposes, we'd need the actual code from email
                print(f"  Note: Check email for code, or use test code from logs")
                print(f"  (In local dev environment, codes are logged)")
                return
            else:
                print(f"  Error: {signin_resp.text}")
                return
        else:
            token_item = items[0]
            user_token = token_item.get("token_hash")
            user_id = token_item.get("user_id")
            coach_verified = token_item.get("coach_verified", False)
            
            print(f"✓ Found token for {TEST_EMAIL}")
            print(f"  user_id: {user_id}")
            print(f"  token_hash: {user_token[:40]}...")
            print(f"  coach_verified: {coach_verified}")
            
            # Step 2: Call /coach/teams with the token
            print(f"\n[Step 2] Calling /coach/teams with x-user-token header...")
            teams_resp = requests.get(
                f"{API_BASE}/coach/teams",
                headers={"x-user-token": user_token},
            )
            
            print(f"Status: {teams_resp.status_code}")
            if teams_resp.status_code == 200:
                data = teams_resp.json()
                teams = data.get("teams", [])
                print(f"✓ Response received")
                print(f"  Teams count: {len(teams)}")
                if teams:
                    for i, team in enumerate(teams):
                        print(f"  [{i}] {team.get('team_name')} ({team.get('team_id')})")
                        print(f"      role: {team.get('role')}")
                        print(f"      invite_token: {team.get('invite_token', 'N/A')[:40] if team.get('invite_token') else 'None'}...")
                else:
                    print(f"✗ No teams returned!")
            else:
                print(f"✗ Error: {teams_resp.status_code}")
                print(f"  Response: {teams_resp.text}")
    
    except Exception as e:
        print(f"✗ Exception: {e}")
        import traceback
        traceback.print_exc()

def list_tokens_for_coach():
    """List all coach tokens in the table for debugging"""
    print("\n" + "="*60)
    print("Listing all coach tokens in UserTokensTable")
    print("="*60)
    
    try:
        response = tokens_table.scan()
        items = response.get("Items", [])
        
        print(f"Total items in UserTokensTable: {len(items)}")
        print("\nCoach tokens (with email):")
        
        for item in items:
            email = item.get("email", "N/A")
            token_hash = item.get("token_hash", "N/A")
            user_id = item.get("user_id", "N/A")
            coach_verified = item.get("coach_verified", False)
            
            if email and "@" in email:
                print(f"  {email}")
                print(f"    user_id: {user_id}")
                print(f"    token_hash: {token_hash[:40]}...")
                print(f"    coach_verified: {coach_verified}\n")
    
    except Exception as e:
        print(f"✗ Exception: {e}")

if __name__ == "__main__":
    print("Coach Teams Endpoint Test")
    print(f"Test email: {TEST_EMAIL}")
    print(f"API base: {API_BASE}")
    
    # First list all tokens
    list_tokens_for_coach()
    
    # Then test the endpoint
    test_coach_teams_endpoint()
