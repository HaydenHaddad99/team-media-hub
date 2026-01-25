import boto3
from boto3.dynamodb.conditions import Key

from common.responses import err
from common.auth import require_invite
from common.config import TABLE_MEDIA, MEDIA_BUCKET
from common.db import table, _normalize

s3 = boto3.client("s3")

def handle_media_thumbnail(event):
    """
    Fetch and return a thumbnail image directly.
    Returns binary image data with proper headers.
    Accepts token as query parameter (for <img src> tags) or header.
    """
    # Manually extract invite token
    qs = event.get("queryStringParameters") or {}
    token = qs.get("token")
    
    if not token:
        headers = event.get("headers") or {}
        token = headers.get("x-invite-token")
    
    if not token:
        return err("Missing invite token.", 401, code="unauthorized")
    
    # Validate token
    auth_event = {**event, "headers": {**(event.get("headers") or {}), "x-invite-token": token}}
    invite, auth_err = require_invite(auth_event)
    if auth_err:
        return auth_err

    team_id = invite["team_id"]
    
    media_id = (qs.get("media_id") or "").strip()
    if not media_id:
        return err("media_id is required.", 400, code="validation_error")

    try:
        # Query by GSI to find the media item
        resp = table(TABLE_MEDIA).query(
            IndexName="gsi1",
            KeyConditionExpression=Key("gsi1pk").eq(media_id),
            Limit=1,
        )
        items = resp.get("Items", [])
        if not items:
            return err("Media not found.", 404, code="not_found")
        
        item = _normalize(items[0])
        
        # Verify team access
        if item.get("team_id") != team_id:
            return err("Media not found.", 404, code="not_found")

        thumb_key = item.get("thumb_key")
        if not thumb_key:
            return err("Thumbnail not available.", 404, code="not_found")

        # Fetch thumbnail from S3
        obj = s3.get_object(Bucket=MEDIA_BUCKET, Key=thumb_key)
        image_data = obj["Body"].read()
        
        import base64
        b64_str = base64.b64encode(image_data).decode("utf-8")
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=86400",
                "Access-Control-Allow-Origin": "*",
            },
            "body": b64_str,
            "isBase64Encoded": True,
        }
    except Exception as e:
        import traceback
        return err(f"Failed to fetch thumbnail: {str(e)}", 500, code="server_error")

