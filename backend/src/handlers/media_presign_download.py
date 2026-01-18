
import boto3
from boto3.dynamodb.conditions import Key

from common.config import TABLE_MEDIA, MEDIA_BUCKET, SIGNED_URL_TTL_SECONDS
from common.db import query_gsi
from common.responses import ok, err
from common.auth import require_invite
from common.audit import write_audit

s3 = boto3.client("s3")

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

    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": MEDIA_BUCKET, "Key": object_key},
        ExpiresIn=SIGNED_URL_TTL_SECONDS,
        HttpMethod="GET",
    )

    write_audit(team_id, "media_presign_download", invite_token=invite.get("_raw_token"), meta={"media_id": media_id})

    return ok({"download_url": url, "expires_in": SIGNED_URL_TTL_SECONDS})
