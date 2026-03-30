import io
import os
import re
import time
import subprocess
import tempfile
import boto3
import logging
from botocore.exceptions import ClientError
from urllib.parse import unquote_plus
from PIL import Image

# Register HEIC/HEIF support if pillow-heif is available in the layer
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DDB_TABLE = os.environ["TABLE_MEDIA"]
BUCKET = os.environ["MEDIA_BUCKET"]
GSI_NAME = os.environ.get("MEDIA_GSI_NAME", "gsi1")

s3 = boto3.client("s3")
ddb = boto3.client("dynamodb")

# media/{team_id}/{media_id}/{filename}
KEY_RE = re.compile(r"^media/([^/]+)/([^/]+)/(.+)$")

MAX_SIZE = 300
JPEG_QUALITY = 78

# ffmpeg binary: provided by Lambda layer at /opt/bin/ffmpeg, fallback to PATH for local dev
FFMPEG_BIN = "/opt/bin/ffmpeg" if os.path.exists("/opt/bin/ffmpeg") else "ffmpeg"

PREVIEW_MAX = 1600
JPEG_QUALITY_PREVIEW = 82

def _parse_key(key: str):
    m = KEY_RE.match(key)
    if not m:
        return None
    return {"team_id": m.group(1), "media_id": m.group(2), "filename": m.group(3)}

def _is_image(content_type: str) -> bool:
    return content_type.startswith("image/")

def _is_video(content_type: str) -> bool:
    return content_type.startswith("video/")

def _make_video_thumb(video_bytes: bytes) -> bytes:
    """Extract a frame from a video using ffmpeg and return it as a JPEG thumbnail."""
    with tempfile.TemporaryDirectory() as tmp:
        in_path = os.path.join(tmp, "input.mp4")
        out_path = os.path.join(tmp, "thumb.jpg")

        with open(in_path, "wb") as f:
            f.write(video_bytes)

        # Seek to 1s in, grab 1 frame, scale to fit within MAX_SIZE
        subprocess.run(
            [
                FFMPEG_BIN,
                "-y",
                "-ss", "00:00:01",
                "-i", in_path,
                "-vframes", "1",
                "-vf", f"scale='if(gt(iw,ih),{MAX_SIZE},-2)':'if(gt(iw,ih),-2,{MAX_SIZE})'",
                "-q:v", "3",
                out_path,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=60,
        )

        with open(out_path, "rb") as f:
            return f.read()

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

def _make_preview(image_bytes: bytes) -> bytes:
    """Generate a larger preview image (1600px max) for modal viewing"""
    im = Image.open(io.BytesIO(image_bytes))

    # Best-effort orientation fix
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

    im.thumbnail((PREVIEW_MAX, PREVIEW_MAX))

    # Convert to RGB for JPEG
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
        im = bg
    elif im.mode != "RGB":
        im = im.convert("RGB")

    out = io.BytesIO()
    im.save(out, format="JPEG", quality=JPEG_QUALITY_PREVIEW, optimize=True)
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

def _update_thumb_and_preview_keys(team_id: str, sk: str, thumb_key: str, preview_key: str):
    ddb.update_item(
        TableName=DDB_TABLE,
        Key={"team_id": {"S": team_id}, "sk": {"S": sk}},
        UpdateExpression="SET thumb_key = :t, preview_key = :p",
        ExpressionAttributeValues={
            ":t": {"S": thumb_key},
            ":p": {"S": preview_key}
        },
    )

def handler(event, context):
    for rec in event.get("Records", []):
        s3info = rec.get("s3", {})
        bucket = s3info.get("bucket", {}).get("name")
        key = s3info.get("object", {}).get("key")
        if not bucket or not key:
            continue

        # S3 event keys are URL-encoded (spaces, commas, etc.)
        # Decode before parsing/reading from S3
        key = unquote_plus(key)

        parsed = _parse_key(key)
        if not parsed:
            continue

        # Retry head_object with backoff — S3 notifications can arrive
        # before the object is fully visible (eventual consistency edge case)
        head = None
        for attempt in range(4):
            try:
                head = s3.head_object(Bucket=bucket, Key=key)
                break
            except ClientError as e:
                if e.response["Error"]["Code"] in ("404", "NoSuchKey"):
                    if attempt < 3:
                        wait = 2 ** attempt  # 1s, 2s, 4s
                        logger.info(f"head_object 404 for {key}, retry {attempt + 1}/3 in {wait}s")
                        time.sleep(wait)
                    else:
                        logger.error(f"head_object 404 after 4 attempts for {key}, skipping")
                else:
                    logger.error(f"head_object error for {key}: {e}")
                    break

        if not head:
            continue
        content_type = head.get("ContentType", "") or ""

        if _is_image(content_type):
            # NOTE: HEIC often can't be decoded by Pillow on Lambda without libheif.
            # We'll try; if it fails, we skip thumbnail generation.
            try:
                raw = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
                thumb_bytes = _make_thumb(raw)
                preview_bytes = _make_preview(raw)
            except Exception as e:
                logger.warning(f"Failed to generate image thumbnail for {key}: {str(e)}")
                continue

            thumb_key = f"thumbnails/{parsed['team_id']}/{parsed['media_id']}/thumb.jpg"
            preview_key = f"previews/{parsed['team_id']}/{parsed['media_id']}/preview.jpg"

            s3.put_object(
                Bucket=bucket, Key=thumb_key, Body=thumb_bytes,
                ContentType="image/jpeg", CacheControl="private, max-age=86400",
            )
            s3.put_object(
                Bucket=bucket, Key=preview_key, Body=preview_bytes,
                ContentType="image/jpeg", CacheControl="private, max-age=86400",
            )

            item = _query_item_by_media_id(parsed["media_id"])
            if item:
                _update_thumb_and_preview_keys(
                    item["team_id"]["S"], item["sk"]["S"], thumb_key, preview_key
                )

        elif _is_video(content_type):
            try:
                raw = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
                thumb_bytes = _make_video_thumb(raw)
            except Exception as e:
                logger.warning(f"Failed to generate video thumbnail for {key}: {str(e)}")
                continue

            thumb_key = f"thumbnails/{parsed['team_id']}/{parsed['media_id']}/thumb.jpg"

            s3.put_object(
                Bucket=bucket, Key=thumb_key, Body=thumb_bytes,
                ContentType="image/jpeg", CacheControl="private, max-age=86400",
            )

            item = _query_item_by_media_id(parsed["media_id"])
            if item:
                _update_thumb_key(item["team_id"]["S"], item["sk"]["S"], thumb_key)

        else:
            logger.info(f"Skipping unsupported content_type {content_type} for {key}")

    return {"ok": True}
