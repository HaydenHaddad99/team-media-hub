#!/usr/bin/env python3
"""Check which media items are missing thumbnails and whether source S3 objects exist."""
import boto3
import sys

def main():
    env = sys.argv[1] if len(sys.argv) > 1 else "prod"
    
    if env == "prod":
        TABLE = "TeamMediaHubStack-MediaTableCFC93525-8YTEVX5PQ0Z9"
        BUCKET = "teammediahubstack-mediabucketbcbb02ba-yya0tjoyk8dm"
    else:
        TABLE = "TeamMediaHubStack-Staging-MediaTableCFC93525-1WCAV0MVU03C7"
        BUCKET = "teammediahubstack-staging-mediabucketbcbb02ba-c1zsibc2uhk6"

    ddb = boto3.client("dynamodb", region_name="us-east-1")
    s3 = boto3.client("s3", region_name="us-east-1")

    # Get all media items missing thumb_key
    items = []
    kwargs = {"TableName": TABLE, "FilterExpression": "attribute_not_exists(thumb_key)"}
    while True:
        resp = ddb.scan(**kwargs)
        items.extend(resp.get("Items", []))
        lek = resp.get("LastEvaluatedKey")
        if not lek:
            break
        kwargs["ExclusiveStartKey"] = lek

    print(f"Found {len(items)} items missing thumb_key in {env}")
    print()

    images_to_backfill = []
    for item in items:
        media_id = item.get("gsi1pk", {}).get("S", "?")
        content_type = item.get("content_type", {}).get("S", "?")
        object_key = item.get("object_key", {}).get("S", "")
        filename = item.get("filename", {}).get("S", "?")
        team_id = item.get("team_id", {}).get("S", "?")
        sk = item.get("sk", {}).get("S", "?")

        # Check if source file exists in S3
        exists = False
        size = 0
        if object_key:
            try:
                head = s3.head_object(Bucket=BUCKET, Key=object_key)
                exists = True
                size = head.get("ContentLength", 0)
            except Exception:
                exists = False

        is_image = content_type.startswith("image/")
        status = "BACKFILL" if (exists and is_image) else ("VIDEO" if not is_image else "MISSING_S3")
        
        print(f"[{status}] media_id={media_id[:16]}  type={content_type:<20}  s3={exists}  size={size:>10}  file={filename}")

        if exists and is_image:
            images_to_backfill.append({
                "media_id": media_id,
                "team_id": team_id,
                "sk": sk,
                "object_key": object_key,
                "content_type": content_type,
                "filename": filename,
            })

    print(f"\n--- Summary ---")
    print(f"Total missing thumbs: {len(items)}")
    print(f"Images to backfill: {len(images_to_backfill)}")
    print(f"Videos (expected): {sum(1 for i in items if not i.get('content_type', {}).get('S', '').startswith('image/'))}")
    print(f"Missing from S3: {sum(1 for i in items if i.get('content_type', {}).get('S', '').startswith('image/')) - len(images_to_backfill)}")

if __name__ == "__main__":
    main()
