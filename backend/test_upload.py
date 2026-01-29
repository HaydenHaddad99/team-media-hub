import os
import json
import requests

BASE_URL = "https://5gt1117eh5.execute-api.us-east-1.amazonaws.com"
ADMIN_TOKEN = "KrbW8fKmkS7e7f3euyOS_DFtWc_h2i9uYcmYUuxP1Kk"

def pretty(label, resp):
    print(f"\n=== {label} ===")
    print(f"Status: {resp.status_code}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text)

def main():
    headers = {"x-invite-token": ADMIN_TOKEN}
    
    # Get upload URL
    print("📤 Requesting presigned upload URL...")
    file_size = os.path.getsize("test.jpg")
    upload_req = requests.post(
        f"{BASE_URL}/media/upload-url",
        json={
            "filename": "test.jpg",
            "content_type": "image/jpeg",
            "size_bytes": file_size
        },
        headers=headers
    )
    pretty("Get Upload URL", upload_req)
    
    if upload_req.status_code != 200:
        print("❌ Failed to get upload URL!")
        return
    
    upload_data = upload_req.json()
    upload_url = upload_data.get("upload_url")
    media_id = upload_data.get("media_id")
    object_key = upload_data.get("object_key")
    
    print(f"✅ Got upload URL")
    print(f"   Media ID: {media_id}")
    print(f"   Object Key: {object_key}")
    
    # Upload to S3
    print("\n📁 Uploading to S3...")
    with open("test.jpg", "rb") as f:
        file_data = f.read()
    
    s3_upload = requests.put(upload_url, data=file_data, headers={"content-type": "image/jpeg"})
    print(f"S3 Upload Status: {s3_upload.status_code}")
    
    if s3_upload.status_code not in [200, 204]:
        print(f"❌ S3 upload failed: {s3_upload.text}")
        return
    
    print("✅ S3 upload successful!")
    
    # Complete upload
    print("\n✔️ Completing upload in backend...")
    complete_req = requests.post(
        f"{BASE_URL}/media/complete",
        json={
            "media_id": media_id,
            "object_key": object_key,
            "filename": "test.jpg",
            "content_type": "image/jpeg",
            "size_bytes": len(file_data)
        },
        headers=headers
    )
    pretty("Complete Upload", complete_req)
    
    if complete_req.status_code in [200, 201]:
        print("\n✅ Upload completed successfully!")
        
        # List media to verify
        print("\n📋 Listing media to verify...")
        list_req = requests.get(f"{BASE_URL}/media?limit=30", headers=headers)
        pretty("List Media", list_req)
    else:
        print("\n❌ Failed to complete upload!")

if __name__ == "__main__":
    main()
