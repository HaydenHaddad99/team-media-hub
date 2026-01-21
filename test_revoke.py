#!/usr/bin/env python3
import requests

API = "https://5gt1117eh5.execute-api.us-east-1.amazonaws.com"
ADMIN_TOKEN = "KrbW8fKmkS7e7f3euyOS_DFtWc_h2i9uYcmYUuxP1Kk"

# Step 1: Create a viewer invite
print("1. Creating viewer invite...")
resp = requests.post(
    f"{API}/invites",
    headers={"Content-Type": "application/json", "x-invite-token": ADMIN_TOKEN},
    json={"role": "viewer", "expires_in_days": 7}
)
print(f"   Status: {resp.status_code}")
print(f"   Response: {resp.text}")
invite_data = resp.json()
viewer_token = invite_data.get("invite_token")
print(f"   Viewer token: {viewer_token}\n")

# Step 2: Test viewer token works
print("2. Testing viewer token works (GET /media)...")
resp = requests.get(
    f"{API}/media",
    headers={"x-invite-token": viewer_token}
)
print(f"   Status: {resp.status_code}")
print(f"   Response: {resp.text[:150]}...\n")

# Step 3: Revoke the viewer token
print("3. Revoking viewer token...")
resp = requests.post(
    f"{API}/invites/revoke",
    headers={"Content-Type": "application/json", "x-invite-token": ADMIN_TOKEN},
    json={"invite_token": viewer_token}
)
print(f"   Status: {resp.status_code}")
print(f"   Response: {resp.text}\n")

# Step 4: Test revoked token returns 401
print("4. Testing revoked token returns 401...")
resp = requests.get(
    f"{API}/media",
    headers={"x-invite-token": viewer_token}
)
print(f"   Status: {resp.status_code}")
print(f"   Response: {resp.text}")

if resp.status_code == 401:
    print("\n✅ Token revocation working correctly!")
else:
    print(f"\n❌ Expected 401, got {resp.status_code}")
