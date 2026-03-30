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

    # Add CloudFront signed URLs for thumbnails and previews
    for it in items:
        content_type = it.get("content_type", "")

        # Thumbnail URL via CloudFront signed URL (direct CDN, works in all browsers)
        thumb_key = it.get("thumb_key")
        if thumb_key:
            try:
                it["thumb_url"] = create_signed_url(
                    domain_name=CLOUDFRONT_DOMAIN,
                    object_key=thumb_key,
                    key_pair_id=CLOUDFRONT_KEY_PAIR_ID,
                    private_key_pem=CLOUDFRONT_PRIVATE_KEY,
                    expires_in_seconds=3600,
                )
            except Exception as e:
                print(f"Failed to create CloudFront signed URL for thumbnail: {e}")
                it["thumb_url"] = None
        else:
            it["thumb_url"] = None

        # Preview URL: CloudFront signed URL for images; direct signed URL for videos
        if content_type.startswith("image/"):
            preview_key = it.get("preview_key") or it.get("object_key")
            if preview_key:
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
        elif content_type.startswith("video/"):
            video_key = it.get("object_key")
            if video_key:
                try:
                    it["preview_url"] = create_signed_url(
                        domain_name=CLOUDFRONT_DOMAIN,
                        object_key=video_key,
                        key_pair_id=CLOUDFRONT_KEY_PAIR_ID,
                        private_key_pem=CLOUDFRONT_PRIVATE_KEY,
                        expires_in_seconds=3600,
                    )
                except Exception as e:
                    print(f"Failed to create CloudFront signed URL for video: {e}")
                    it["preview_url"] = None
            else:
                it["preview_url"] = None
        else:
            it["preview_url"] = None

    write_audit(team_id, "media_list", invite_token=invite.get("_raw_token"), meta={"limit": limit})
    return ok({"items": items, "next_cursor": next_cursor})
