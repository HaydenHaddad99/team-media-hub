import os
import time
import uuid
import boto3

from common.config import MEDIA_BUCKET, SIGNED_URL_TTL_SECONDS, MAX_UPLOAD_BYTES, ALLOWED_CONTENT_TYPES, TABLE_TEAMS
from common.responses import ok, err
from common.auth import require_invite, require_role
from common.audit import write_audit
from common.db import get_item

s3 = boto3.client("s3")

def handle_media_presign_upload(event, body):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    role_err = require_role(invite, {"uploader", "admin"})
    if role_err:
        return role_err

    filename = (body or {}).get("filename", "").strip()
    content_type = (body or {}).get("content_type", "").strip().lower()
    size_bytes = int((body or {}).get("size_bytes", 0))

    if not filename or not content_type or size_bytes <= 0:
        return err("filename, content_type, size_bytes are required.", 400, code="validation_error")

    if content_type not in ALLOWED_CONTENT_TYPES:
        return err("Unsupported content_type.", 400, code="validation_error")

    if size_bytes > MAX_UPLOAD_BYTES:
        return err("File too large for MVP limit.", 413, code="payload_too_large")

    team_id = invite["team_id"]
    
    # Check storage limit before allowing upload initiation
    team = get_item(TABLE_TEAMS, {"team_id": team_id}) or {}
    storage_limit_gb = team.get("storage_limit_gb", 10)
    used_bytes = team.get("used_bytes", 0)
    limit_bytes = storage_limit_gb * (1024 ** 3)
    
    if used_bytes + size_bytes > limit_bytes:
        return err(
            f"Team storage limit exceeded. Current: {used_bytes / (1024**3):.2f}GB / {storage_limit_gb}GB. "
            f"Upload would exceed limit.",
            403,
            code="STORAGE_LIMIT_EXCEEDED"
        )
    media_id = str(uuid.uuid4())
    safe_name = filename.replace("/", "_")
    object_key = f"media/{team_id}/{media_id}/{safe_name}"

    # Presigned PUT; we include ContentType and SSE so the client must match these params.
    params = {
        "Bucket": MEDIA_BUCKET,
        "Key": object_key,
        "ContentType": content_type,
        "ServerSideEncryption": "AES256",
    }

    upload_url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params=params,
        ExpiresIn=SIGNED_URL_TTL_SECONDS,
        HttpMethod="PUT",
    )

    write_audit(team_id, "media_presign_upload", invite_token=invite.get("_raw_token"), meta={"content_type": content_type, "size_bytes": size_bytes})

    return ok({
        "media_id": media_id,
        "object_key": object_key,
        "upload_url": upload_url,
        "expires_in": SIGNED_URL_TTL_SECONDS,
        "required_headers": {
            "content-type": content_type
        }
    })
