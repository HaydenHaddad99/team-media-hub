from urllib.parse import parse_qs

from common.responses import ok
from common.auth import require_invite
from common.config import TABLE_MEDIA, MEDIA_BUCKET, CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_PAIR_ID, CLOUDFRONT_PRIVATE_KEY
from common.db import query_media_items
from common.audit import write_audit
from common.cloudfront_signer import create_signed_url

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
    # Add preview URLs - CloudFront signed URLs for fast modal viewing
    for it in items:
        media_id = it.get("media_id")
        if it.get("thumb_key") and media_id:
            it["thumb_url"] = f"/media/thumbnail?media_id={media_id}"
        else:
            it["thumb_url"] = None
        
        # Generate CloudFront signed URL for preview images (not videos)
        preview_key = it.get("preview_key") or it.get("object_key")
        content_type = it.get("content_type", "")
        if preview_key and content_type.startswith("image/"):
            try:
                it["preview_url"] = create_signed_url(
                    domain_name=CLOUDFRONT_DOMAIN,
                    object_key=preview_key,
                    key_pair_id=CLOUDFRONT_KEY_PAIR_ID,
                    private_key_pem=CLOUDFRONT_PRIVATE_KEY,
                    expires_in_seconds=3600,
                )
            except Exception as e:
                print(f"Failed to create CloudFront signed URL for preview: {e}")
                it["preview_url"] = None
        else:
            it["preview_url"] = None

    write_audit(team_id, "media_list", invite_token=invite.get("_raw_token"), meta={"limit": limit})
    return ok({"items": items, "next_cursor": next_cursor})
