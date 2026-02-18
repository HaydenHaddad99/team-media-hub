import time
import boto3
import hashlib
from common.config import TABLE_MEDIA, MEDIA_BUCKET
from common.db import put_item
from common.responses import ok, err
from common.auth import require_invite, require_role
from common.audit import write_audit

s3 = boto3.client("s3")

def _token_hash(token: str) -> str:
    """Hash a token for storage"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

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
    
    # Store uploader_user_id for ownership tracking:
    # Priority 1: User auth (user_id from authenticated users via email/verify flow)
    # Priority 2: Coach user_id passed in header when coach opens team
    # Priority 3: Invite token hash (for backwards compatibility with legacy invite-only auth)
    user_id = invite.get("user_id")
    
    if not user_id:
        # Check for coach user_id passed in header when coach opens team with invite token
        headers = event.get("headers") or {}
        user_id = headers.get("x-coach-user-id") or headers.get("X-Coach-User-Id")
    
    if not user_id:
        # For legacy invite-only users, hash the token to create a stable identifier
        # NOTE: New users created via email/verify flow will have a proper user_id
        raw_token = invite.get("_raw_token")
        if raw_token:
            user_id = _token_hash(raw_token)
            print(f"[UPLOAD] Legacy invite token hashed: {user_id[:16]}...")
        else:
            print(f"[UPLOAD] ERROR: No _raw_token in invite!")
    else:
        print(f"[UPLOAD] Using explicit user_id: {user_id[:16] if len(str(user_id)) > 16 else user_id}")
    
    if user_id:
        item["uploader_user_id"] = user_id
        print(f"[UPLOAD] Set uploader_user_id: {user_id[:16]}...")
        # Only add email if available
        email = invite.get("email")
        if email:
            item["uploader_email"] = email
    else:
        print(f"[UPLOAD] WARNING: No uploader_user_id set for media_id={media_id}")
    
    put_item(TABLE_MEDIA, item)
    print(f"[UPLOAD] Saved media record: media_id={media_id}, team_id={team_id}, uploader_user_id={item.get('uploader_user_id', 'NONE')[:16] if item.get('uploader_user_id') else 'NONE'}...")

    write_audit(team_id, "media_complete", invite_token=invite.get("_raw_token"), meta={"media_id": media_id, "album_name": album_name})

    return ok({"ok": True, "media_id": media_id}, 201)