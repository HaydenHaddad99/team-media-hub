
import boto3
from boto3.dynamodb.conditions import Key

from common.config import TABLE_MEDIA, CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_PAIR_ID, CLOUDFRONT_PRIVATE_KEY, SIGNED_URL_TTL_SECONDS
from common.db import query_gsi
from common.responses import ok, err
from common.auth import require_invite
from common.audit import write_audit
from common.cloudfront_signer import create_signed_url

def handle_media_presign_download(event):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    qs = event.get("queryStringParameters") or {}
    media_id = (qs.get("media_id") or "").strip()
    if not media_id:
        return err("media_id is required.", 400, code="validation_error")

    team_id = invite["team_id"]

    # Lookup by media_id via GSI; then enforce team match.
    item = query_gsi(TABLE_MEDIA, "gsi1", Key("gsi1pk").eq(media_id), limit=1)
    if not item or item.get("team_id") != team_id:
        return err("Media not found.", 404, code="not_found")

    object_key = item["object_key"]

    # Check if CloudFront signing is configured
    if not CLOUDFRONT_KEY_PAIR_ID or not CLOUDFRONT_PRIVATE_KEY:
        return err("CloudFront signing is not configured.", 500, code="config_error")

    try:
        # Generate CloudFront signed URL instead of S3 presigned URL
        download_url = create_signed_url(
            domain_name=CLOUDFRONT_DOMAIN,
            object_key=object_key,
            key_pair_id=CLOUDFRONT_KEY_PAIR_ID,
            private_key_pem=CLOUDFRONT_PRIVATE_KEY,
            expires_in_seconds=SIGNED_URL_TTL_SECONDS,
        )
    except Exception as e:
        return err(f"Failed to generate download URL: {str(e)}", 500, code="signing_error")

    write_audit(team_id, "media_presign_download", invite_token=invite.get("_raw_token"), meta={"media_id": media_id})

    return ok({"download_url": download_url, "expires_in": SIGNED_URL_TTL_SECONDS})
