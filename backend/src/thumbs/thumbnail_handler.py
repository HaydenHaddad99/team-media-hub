import io
import os
import re
import boto3
import logging
from PIL import Image

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DDB_TABLE = os.environ["TABLE_MEDIA"]
BUCKET = os.environ["MEDIA_BUCKET"]
GSI_NAME = os.environ.get("MEDIA_GSI_NAME", "gsi1")

s3 = boto3.client("s3")
ddb = boto3.client("dynamodb")

# media/{team_id}/{media_id}/{filename}
KEY_RE = re.compile(r"^media/([^/]+)/([^/]+)/(.+)$")

MAX_SIZE = 512
JPEG_QUALITY = 78

def _parse_key(key: str):
    m = KEY_RE.match(key)
    if not m:
        return None
    return {"team_id": m.group(1), "media_id": m.group(2), "filename": m.group(3)}

def _is_image(content_type: str) -> bool:
    return content_type.startswith("image/")

def _make_thumb(image_bytes: bytes) -> bytes:
    im = Image.open(io.BytesIO(image_bytes))

    # Best-effort orientation fix (some images)
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

    im.thumbnail((MAX_SIZE, MAX_SIZE))

    # Convert to RGB for JPEG
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
        im = bg
    elif im.mode != "RGB":
        im = im.convert("RGB")

    out = io.BytesIO()
    im.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()

def _query_item_by_media_id(media_id: str):
    resp = ddb.query(
        TableName=DDB_TABLE,
        IndexName=GSI_NAME,
        KeyConditionExpression="gsi1pk = :pk",
        ExpressionAttributeValues={":pk": {"S": media_id}},
        Limit=1,
    )
    items = resp.get("Items", [])
    return items[0] if items else None

def _update_thumb_key(team_id: str, sk: str, thumb_key: str):
    ddb.update_item(
        TableName=DDB_TABLE,
        Key={"team_id": {"S": team_id}, "sk": {"S": sk}},
        UpdateExpression="SET thumb_key = :t",
        ExpressionAttributeValues={":t": {"S": thumb_key}},
    )

def handler(event, context):
    for rec in event.get("Records", []):
        s3info = rec.get("s3", {})
        bucket = s3info.get("bucket", {}).get("name")
        key = s3info.get("object", {}).get("key")
        if not bucket or not key:
            continue

        parsed = _parse_key(key)
        if not parsed:
            continue

        head = s3.head_object(Bucket=bucket, Key=key)
        content_type = head.get("ContentType", "") or ""
        if not _is_image(content_type):
            continue

        # NOTE: HEIC often can't be decoded by Pillow on Lambda without libheif.
        # We'll try; if it fails, we skip thumbnail generation.
        try:
            raw = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
            thumb_bytes = _make_thumb(raw)
        except Exception as e:
            # Skip thumbnail creation for unsupported formats (e.g., HEIC without libheif)
            logger.warning(f"Failed to generate thumbnail for {key}: {str(e)}")
            continue

        thumb_key = f"thumbnails/{parsed['team_id']}/{parsed['media_id']}/thumb.jpg"

        s3.put_object(
            Bucket=bucket,
            Key=thumb_key,
            Body=thumb_bytes,
            ContentType="image/jpeg",
            CacheControl="private, max-age=86400",
        )

        item = _query_item_by_media_id(parsed["media_id"])
        if item:
            team_id = item["team_id"]["S"]
            sk = item["sk"]["S"]
            _update_thumb_key(team_id, sk, thumb_key)

    return {"ok": True}
