#!/usr/bin/env python3
"""
Backfill missing thumbnails and previews for media items.

Reads images from S3, generates thumb (512px) + preview (1600px),
uploads them back to S3, and updates DynamoDB records.

Supports HEIC via pillow-heif (install: pip3 install pillow-heif).

Usage:
  python3 scripts/backfill_thumbnails.py prod     # production
  python3 scripts/backfill_thumbnails.py staging   # staging
  python3 scripts/backfill_thumbnails.py prod --dry-run
"""
import io
import os
import sys
import boto3
from PIL import Image

# Register HEIC support if available
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    HEIC_SUPPORT = True
except ImportError:
    HEIC_SUPPORT = False

MAX_THUMB = 512
JPEG_QUALITY_THUMB = 78
MAX_PREVIEW = 1600
JPEG_QUALITY_PREVIEW = 82

ENVS = {
    "prod": {
        "TABLE": "TeamMediaHubStack-MediaTableCFC93525-8YTEVX5PQ0Z9",
        "BUCKET": "teammediahubstack-mediabucketbcbb02ba-yya0tjoyk8dm",
    },
    "staging": {
        "TABLE": "TeamMediaHubStack-Staging-MediaTableCFC93525-1WCAV0MVU03C7",
        "BUCKET": "teammediahubstack-staging-mediabucketbcbb02ba-c1zsibc2uhk6",
    },
}


def _fix_orientation(im):
    try:
        exif = im.getexif()
        orientation = exif.get(274)
        if orientation == 3:
            im = im.rotate(180, expand=True)
        elif orientation == 6:
            im = im.rotate(270, expand=True)
        elif orientation == 8:
            im = im.rotate(90, expand=True)
    except Exception:
        pass
    return im


def _to_rgb(im):
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
        return bg
    elif im.mode != "RGB":
        return im.convert("RGB")
    return im


def make_thumb(image_bytes):
    im = Image.open(io.BytesIO(image_bytes))
    im = _fix_orientation(im)
    im.thumbnail((MAX_THUMB, MAX_THUMB))
    im = _to_rgb(im)
    out = io.BytesIO()
    im.save(out, format="JPEG", quality=JPEG_QUALITY_THUMB, optimize=True)
    return out.getvalue()


def make_preview(image_bytes):
    im = Image.open(io.BytesIO(image_bytes))
    im = _fix_orientation(im)
    im.thumbnail((MAX_PREVIEW, MAX_PREVIEW))
    im = _to_rgb(im)
    out = io.BytesIO()
    im.save(out, format="JPEG", quality=JPEG_QUALITY_PREVIEW, optimize=True)
    return out.getvalue()


def main():
    env = sys.argv[1] if len(sys.argv) > 1 else "prod"
    dry_run = "--dry-run" in sys.argv

    if env not in ENVS:
        print(f"Unknown env: {env}. Use 'prod' or 'staging'.")
        sys.exit(1)

    cfg = ENVS[env]
    TABLE = cfg["TABLE"]
    BUCKET = cfg["BUCKET"]

    print(f"Environment: {env} {'(DRY RUN)' if dry_run else ''}")
    print(f"HEIC support: {HEIC_SUPPORT}")
    print()

    ddb = boto3.client("dynamodb", region_name="us-east-1")
    s3 = boto3.client("s3", region_name="us-east-1")

    # Scan for items missing thumb_key
    items = []
    kwargs = {"TableName": TABLE, "FilterExpression": "attribute_not_exists(thumb_key)"}
    while True:
        resp = ddb.scan(**kwargs)
        items.extend(resp.get("Items", []))
        lek = resp.get("LastEvaluatedKey")
        if not lek:
            break
        kwargs["ExclusiveStartKey"] = lek

    # Filter to images only
    image_items = [
        i for i in items
        if i.get("content_type", {}).get("S", "").startswith("image/")
    ]

    print(f"Found {len(items)} items missing thumb_key ({len(image_items)} images, {len(items) - len(image_items)} videos/other)")
    print()

    success = 0
    failed = 0
    skipped = 0

    for item in image_items:
        media_id = item.get("gsi1pk", {}).get("S", "?")
        content_type = item.get("content_type", {}).get("S", "?")
        object_key = item.get("object_key", {}).get("S", "")
        filename = item.get("filename", {}).get("S", "?")
        team_id = item.get("team_id", {}).get("S", "")
        sk = item.get("sk", {}).get("S", "")

        is_heic = content_type.lower() in ("image/heic", "image/heif")
        if is_heic and not HEIC_SUPPORT:
            print(f"  SKIP (no HEIC support): {filename}")
            skipped += 1
            continue

        if dry_run:
            print(f"  DRY RUN: Would process {filename} ({content_type})")
            continue

        try:
            # Download source image
            raw = s3.get_object(Bucket=BUCKET, Key=object_key)["Body"].read()
            print(f"  Downloaded {filename} ({len(raw)} bytes)")

            # Generate thumbnail + preview
            thumb_bytes = make_thumb(raw)
            preview_bytes = make_preview(raw)
            print(f"    Thumb: {len(thumb_bytes)} bytes, Preview: {len(preview_bytes)} bytes")

            # Determine keys
            thumb_key = f"thumbnails/{team_id}/{media_id}/thumb.jpg"
            preview_key = f"previews/{team_id}/{media_id}/preview.jpg"

            # Upload to S3
            s3.put_object(
                Bucket=BUCKET, Key=thumb_key, Body=thumb_bytes,
                ContentType="image/jpeg", CacheControl="private, max-age=86400",
            )
            s3.put_object(
                Bucket=BUCKET, Key=preview_key, Body=preview_bytes,
                ContentType="image/jpeg", CacheControl="private, max-age=86400",
            )
            print(f"    Uploaded: {thumb_key}")
            print(f"    Uploaded: {preview_key}")

            # Update DynamoDB
            ddb.update_item(
                TableName=TABLE,
                Key={"team_id": {"S": team_id}, "sk": {"S": sk}},
                UpdateExpression="SET thumb_key = :t, preview_key = :p",
                ExpressionAttributeValues={
                    ":t": {"S": thumb_key},
                    ":p": {"S": preview_key},
                },
            )
            print(f"    Updated DynamoDB record")
            success += 1

        except Exception as e:
            print(f"  FAILED {filename}: {e}")
            failed += 1

    print(f"\n--- Results ---")
    print(f"Success: {success}")
    print(f"Failed:  {failed}")
    print(f"Skipped: {skipped}")


if __name__ == "__main__":
    main()
