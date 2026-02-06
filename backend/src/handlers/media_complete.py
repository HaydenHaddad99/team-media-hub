import time
import boto3
from common.config import TABLE_MEDIA, MEDIA_BUCKET
from common.db import put_item
from common.responses import ok, err
from common.auth import require_invite, require_role
from common.audit import write_audit

s3 = boto3.client("s3")

def handle_media_complete(event, body):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    role_err = require_role(invite, {"uploader", "admin"})
    if role_err:
        return role_err

    team_id = invite["team_id"]

    media_id = (body or {}).get("media_id", "").strip()
    object_key = (body or {}).get("object_key", "").strip()
    filename = (body or {}).get("filename", "").strip()
    content_type = (body or {}).get("content_type", "").strip().lower()
    size_bytes = int((body or {}).get("size_bytes", 0))
    album_name = (body or {}).get("album_name", "").strip() or "All uploads"

    if not media_id or not object_key or not filename or not content_type or size_bytes <= 0:
        return err("media_id, object_key, filename, content_type, size_bytes are required.", 400, code="validation_error")

    # Optional safety: confirm object exists (prevents phantom records).
    # This requires s3:HeadObject permission (we include it).
    try:
        s3.head_object(Bucket=MEDIA_BUCKET, Key=object_key)
    except Exception:
        return err("Uploaded object not found yet.", 409, code="conflict")

    ts = int(time.time())
    item = {
        "team_id": team_id,
        "sk": f"{ts}#{media_id}",
        "media_id": media_id,
        "object_key": object_key,
        "filename": filename,
        "content_type": content_type,
        "size_bytes": size_bytes,
        "created_at": ts,
        "album_name": album_name,
        # GSI for lookup by media_id
        "gsi1pk": media_id,
        "gsi1sk": f"{ts}",
    }
    
    # Store uploader_user_id if available:
    # 1. From user-token auth (coaches with direct user_id in invite)
    # 2. From x-coach-user-id header (coaches accessing via invite token but preserving their identity)
    user_id = invite.get("user_id")
    if not user_id:
        # Check for coach user_id passed in header when coach opens team with invite token
        headers = event.get("headers") or {}
        user_id = headers.get("x-coach-user-id") or headers.get("X-Coach-User-Id")
    
    if user_id:
        item["uploader_user_id"] = user_id
        item["uploader_email"] = invite.get("email")
    
    put_item(TABLE_MEDIA, item)

    write_audit(team_id, "media_complete", invite_token=invite.get("_raw_token"), meta={"media_id": media_id, "album_name": album_name})

    return ok({"ok": True, "media_id": media_id}, 201)