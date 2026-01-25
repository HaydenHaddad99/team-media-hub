from urllib.parse import parse_qs

from common.responses import ok, err
from common.auth import require_invite
from common.config import TABLE_MEDIA, MEDIA_BUCKET
from common.db import query_media_by_id, delete_item
from common.s3 import delete_object
from common.audit import write_audit

def handle_media_delete(event):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    role = invite.get("role", "viewer")
    if role not in ("admin", "uploader"):
        return err("Not authorized.", 403, code="forbidden")

    qs = parse_qs((event.get("rawQueryString") or ""))
    media_id = (qs.get("media_id", [None])[0] or "").strip()
    if not media_id:
        return err("media_id is required.", 400, code="bad_request")

    # Look up the media record using your existing GSI (media_id -> team_id/sk)
    item = query_media_by_id(TABLE_MEDIA, media_id=media_id)
    if not item:
        return err("Not found.", 404, code="not_found")

    team_id = item["team_id"]
    if team_id != invite["team_id"]:
        return err("Not authorized.", 403, code="forbidden")

    object_key = item.get("object_key")
    thumb_key = item.get("thumb_key")

    # Delete S3 objects first (best effort)
    if object_key:
        delete_object(MEDIA_BUCKET, object_key)
    if thumb_key:
        delete_object(MEDIA_BUCKET, thumb_key)

    # Delete DB record
    delete_item(TABLE_MEDIA, {"team_id": team_id, "sk": item["sk"]})

    write_audit(team_id, "media_delete", invite_token=invite.get("_raw_token"), meta={"media_id": media_id})

    return ok({"deleted": True, "media_id": media_id})
