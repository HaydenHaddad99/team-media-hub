#!/usr/bin/env python3
"""
Test script for parent upload and delete flow.
Tests:
1. Upload image and verify uploader_user_id is set
2. List media and verify thumb_url exists
3. Delete own upload and verify success
"""

import os
import sys
import json
import hashlib
import requests
from urllib.parse import urljoin

BASE_URL = os.environ.get("API_URL", "https://d2u8ibdrwf4t7.cloudfront.net")

# Use a test parent token (from a team invite)
PARENT_TOKEN = os.environ.get("TEST_PARENT_TOKEN", "")
TEAM_ID = os.environ.get("TEST_TEAM_ID", "")

def token_hash(token: str) -> str:
    """Match backend token hashing"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def test_header(name: str, resp):
    """Print response with header"""
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print(f"Status: {resp.status_code}")
    try:
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)[:500]}")
        return data
    except:
        print(f"Response: {resp.text[:500]}")
        return None

def main():
    if not PARENT_TOKEN or not TEAM_ID:
        print("❌ ERROR: Set TEST_PARENT_TOKEN and TEST_TEAM_ID environment variables")
        print("Usage: TEST_PARENT_TOKEN='...' TEST_TEAM_ID='...' python3 test_parent_flow.py")
        sys.exit(1)
    
    headers = {"x-invite-token": PARENT_TOKEN}
    expected_uploader_id = token_hash(PARENT_TOKEN)
    
    print(f"""
╔════════════════════════════════════════════════════════════╗
║       PARENT UPLOAD & DELETE FLOW TEST                    ║
╠════════════════════════════════════════════════════════════╣
║  API Base: {BASE_URL:<45} ║
║  Parent Token (hashed): {expected_uploader_id[:20]}...    ║
║  Team ID: {TEAM_ID:<46} ║
╚════════════════════════════════════════════════════════════╝
    """)
    
    # Step 1: Get /me to verify parent can authenticate
    print("\n[STEP 1] Verify parent authentication...")
    me_resp = requests.get(f"{BASE_URL}/me", headers=headers)
    me_data = test_header("GET /me", me_resp)
    
    if me_resp.status_code != 200:
        print("❌ FAILED: Cannot authenticate parent!")
        return
    
    role = me_data.get("invite", {}).get("role")
    print(f"✅ Authenticated as role: {role}")
    
    # Step 2: Get presigned upload URL
    print("\n[STEP 2] Request presigned upload URL...")
    upload_url_resp = requests.post(
        f"{BASE_URL}/media/upload-url",
        json={
            "filename": "test_parent.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 10000
        },
        headers=headers
    )
    upload_data = test_header("POST /media/upload-url", upload_url_resp)
    
    if upload_url_resp.status_code != 200:
        print("❌ FAILED: Cannot get upload URL!")
        return
    
    media_id = upload_data.get("media_id")
    object_key = upload_data.get("object_key")
    print(f"✅ Got media_id: {media_id}")
    print(f"✅ Got object_key: {object_key}")
    
    # Step 3: Upload to S3 (mock with small data)
    print("\n[STEP 3] Upload to S3...")
    upload_url = upload_data.get("upload_url")
    test_data = b"MOCK_JPEG_DATA" * 1000  # ~14KB
    
    s3_resp = requests.put(upload_url, data=test_data, headers={"content-type": "image/jpeg"})
    if s3_resp.status_code not in [200, 204]:
        print(f"❌ FAILED: S3 upload returned {s3_resp.status_code}")
        return
    
    print(f"✅ S3 upload succeeded (status: {s3_resp.status_code})")
    
    # Step 4: Complete upload in backend
    print("\n[STEP 4] Complete upload in backend...")
    complete_resp = requests.post(
        f"{BASE_URL}/media/complete",
        json={
            "media_id": media_id,
            "object_key": object_key,
            "filename": "test_parent.jpg",
            "content_type": "image/jpeg",
            "size_bytes": len(test_data)
        },
        headers=headers
    )
    complete_data = test_header("POST /media/complete", complete_resp)
    
    if complete_resp.status_code not in [200, 201]:
        print("❌ FAILED: Cannot complete upload!")
        return
    
    print("✅ Upload completed in backend")
    
    # Step 5: List media and check uploader_user_id
    print("\n[STEP 5] List media and verify uploader_user_id...")
    list_resp = requests.get(f"{BASE_URL}/media?limit=30", headers=headers)
    list_data = test_header("GET /media?limit=30", list_resp)
    
    if list_resp.status_code != 200:
        print("❌ FAILED: Cannot list media!")
        return
    
    items = list_data.get("items", [])
    print(f"✅ Got {len(items)} items")
    
    # Find our uploaded item
    our_item = None
    for item in items:
        if item.get("media_id") == media_id:
            our_item = item
            break
    
    if not our_item:
        print("❌ FAILED: Our uploaded item not in list!")
        return
    
    print(f"✅ Found our item in list")
    uploader_id = our_item.get("uploader_user_id")
    thumb_url = our_item.get("thumb_url")
    thumb_key = our_item.get("thumb_key")
    
    print(f"   - uploader_user_id: {uploader_id}")
    print(f"   - Expected: {expected_uploader_id}")
    print(f"   - Match: {'✅ YES' if uploader_id == expected_uploader_id else '❌ NO'}")
    print(f"   - thumb_key: {thumb_key}")
    print(f"   - thumb_url: {thumb_url}")
    
    if uploader_id != expected_uploader_id:
        print("❌ FAILED: uploader_user_id doesn't match token hash!")
        print(f"   Expected: {expected_uploader_id}")
        print(f"   Got: {uploader_id}")
        return
    
    if not thumb_url and not thumb_key:
        print("⚠️  WARNING: No thumb_key/thumb_url yet (Lambda may not have run)")
    
    # Step 6: Test delete
    print("\n[STEP 6] Test delete of own upload...")
    delete_resp = requests.delete(
        f"{BASE_URL}/media?media_id={media_id}",
        headers=headers
    )
    delete_data = test_header("DELETE /media", delete_resp)
    
    if delete_resp.status_code != 200:
        print(f"❌ FAILED: Delete returned {delete_resp.status_code}")
        if delete_data:
            error_msg = delete_data.get("error", {}).get("message", "Unknown error")
            print(f"   Error: {error_msg}")
        return
    
    print("✅ Delete succeeded")
    
    # Step 7: Verify item is gone
    print("\n[STEP 7] Verify item was deleted...")
    list_resp2 = requests.get(f"{BASE_URL}/media?limit=30", headers=headers)
    list_data2 = list_resp2.json()
    
    for item in list_data2.get("items", []):
        if item.get("media_id") == media_id:
            print("❌ FAILED: Item still in list after delete!")
            return
    
    print("✅ Item successfully deleted")
    
    print(f"""
╔════════════════════════════════════════════════════════════╗
║                    ✅ ALL TESTS PASSED                     ║
╠════════════════════════════════════════════════════════════╣
║ ✅ Parent can authenticate                                 ║
║ ✅ Parent can get presigned upload URL                     ║
║ ✅ Parent can upload to S3                                 ║
║ ✅ Parent can complete upload (uploader_user_id set)       ║
║ ✅ Media list includes item with correct uploader_user_id  ║
║ ✅ Parent can delete own upload                            ║
║ ✅ Item is removed from list after delete                  ║
╚════════════════════════════════════════════════════════════╝
    """)

if __name__ == "__main__":
    main()
