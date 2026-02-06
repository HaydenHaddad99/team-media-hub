from urllib.parse import parse_qs
import hashlib

from common.responses import ok, err
from common.auth import require_invite
from common.config import TABLE_MEDIA, MEDIA_BUCKET
from common.db import query_media_by_id, delete_item
from common.s3 import delete_object
from common.audit import write_audit

def _token_hash(token: str) -> str:
    """Hash a token for storage"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def handle_media_delete(event):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    role = invite.get("role", "viewer")
    if role not in ("admin", "uploader"):
        print(f"[DELETE] Role check failed: role={role}")
        return err("Not authorized.", 403, code="forbidden")

    qs = parse_qs((event.get("rawQueryString") or ""))
    media_id = (qs.get("media_id", [None])[0] or "").strip()
    if not media_id:
        print(f"[DELETE] media_id missing")
        return err("media_id is required.", 400, code="bad_request")

    # Look up the media record using your existing GSI (media_id -> team_id/sk)
    item = query_media_by_id(TABLE_MEDIA, media_id=media_id)
    if not item:
        print(f"[DELETE] Media not found: media_id={media_id}")
        return err("Not found.", 404, code="not_found")

    team_id = item["team_id"]
    if team_id != invite["team_id"]:
        print(f"[DELETE] Team mismatch: item_team={team_id}, invite_team={invite['team_id']}")
        return err("Not authorized.", 403, code="forbidden")
    
    print(f"[DELETE] Starting delete check - role={role}, media_id={media_id}, team_id={team_id}")
    
    # Ownership check: admin can delete anything, uploader can only delete own uploads
    if role == "uploader":
        uploader_user_id = item.get("uploader_user_id")
        
        # Determine current user's identifier
        # Priority 1: Explicit user_id (from user-token or coach header)
        # Priority 2: Hash of current invite token (for parent sharing)
        current_user_id = invite.get("user_id")
        if not current_user_id:
            headers = event.get("headers") or {}
            current_user_id = headers.get("x-coach-user-id") or headers.get("X-Coach-User-Id")
        if not current_user_id:
            # Hash the current token
            raw_token = invite.get("_raw_token")
            if raw_token:
                current_user_id = _token_hash(raw_token)
                print(f"[DELETE] Computed user_id from token hash: {current_user_id[:16]}...")
            else:
                print(f"[DELETE] ERROR: No raw_token in invite!")
        
        print(f"[DELETE] Ownership check: uploader_id={uploader_user_id[:16] if uploader_user_id else None}..., current_id={current_user_id[:16] if current_user_id else None}...")
        
        # If this upload has an owner and it's not the current user, deny
        if uploader_user_id and uploader_user_id != current_user_id:
            print(f"[DELETE] DENIED: uploader_id {uploader_user_id[:16]}... != current_id {current_user_id[:16] if current_user_id else None}...")
            return err("You can only delete your own uploads.", 403, code="forbidden")
        
        # If upload has no owner (old uploads before accounts), only admin can delete
        if not uploader_user_id:
            print(f"[DELETE] DENIED: no uploader_user_id (legacy upload)")
            return err("Only admins can delete legacy uploads.", 403, code="forbidden")
    
    print(f"[DELETE] Authorization passed, proceeding to delete S3 objects")

    object_key = item.get("object_key")
    thumb_key = item.get("thumb_key")
    preview_key = item.get("preview_key")

    # Delete S3 objects first (best effort)
    if object_key:
        delete_object(MEDIA_BUCKET, object_key)
        print(f"[DELETE] Deleted S3 object: {object_key}")
    if thumb_key:
        delete_object(MEDIA_BUCKET, thumb_key)
        print(f"[DELETE] Deleted thumbnail: {thumb_key}")
    if preview_key:
        delete_object(MEDIA_BUCKET, preview_key)
        print(f"[DELETE] Deleted preview: {preview_key}")

    # Delete DB record
    delete_item(TABLE_MEDIA, {"team_id": team_id, "sk": item["sk"]})
    print(f"[DELETE] Deleted DynamoDB record: team_id={team_id}, sk={item['sk']}")

    write_audit(team_id, "media_delete", invite_token=invite.get("_raw_token"), meta={"media_id": media_id})
    print(f"[DELETE] SUCCESS: media_id={media_id}")

    return ok({"deleted": True, "media_id": media_id})
