from urllib.parse import parse_qs

from common.responses import ok
from common.auth import require_invite
from common.config import TABLE_MEDIA, MEDIA_BUCKET
from common.db import query_media_items
from common.audit import write_audit
from common.s3 import presign_get_url

def handle_media_list(event):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    team_id = invite["team_id"]

    qs = parse_qs((event.get("rawQueryString") or ""))
    limit = int(qs.get("limit", ["30"])[0])
    limit = max(1, min(limit, 50))
    cursor = qs.get("cursor", [None])[0]

    items, next_cursor = query_media_items(TABLE_MEDIA, team_id=team_id, limit=limit, cursor=cursor)

    # Add thumbnail URLs - frontend will fetch via /media/thumbnail endpoint
    # Add preview URLs - presigned for fast modal viewing
    for it in items:
        media_id = it.get("media_id")
        if it.get("thumb_key") and media_id:
            it["thumb_url"] = f"/media/thumbnail?media_id={media_id}"
        else:
            it["thumb_url"] = None
        
        # Generate presigned preview URL for images (not videos)
        preview_key = it.get("preview_key")
        content_type = it.get("content_type", "")
        if preview_key and content_type.startswith("image/"):
            it["preview_url"] = presign_get_url(MEDIA_BUCKET, preview_key, expires_in=3600)
        else:
            it["preview_url"] = None

    write_audit(team_id, "media_list", invite_token=invite.get("_raw_token"), meta={"limit": limit})
    return ok({"items": items, "next_cursor": next_cursor})
