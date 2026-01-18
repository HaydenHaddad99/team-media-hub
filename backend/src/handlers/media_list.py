
import json
from boto3.dynamodb.conditions import Key

from common.config import TABLE_MEDIA
from common.db import query
from common.responses import ok, err
from common.auth import require_invite
from common.audit import write_audit

def handle_media_list(event):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    qs = event.get("queryStringParameters") or {}
    limit = int(qs.get("limit", 30))
    limit = max(1, min(limit, 50))

    cursor = qs.get("cursor")
    eks = None
    if cursor:
        try:
            eks = json.loads(cursor)
        except Exception:
            eks = None

    team_id = invite["team_id"]
    items, lek = query(TABLE_MEDIA, Key("team_id").eq(team_id), limit=limit, exclusive_start_key=eks)

    # Don’t generate signed URLs here — list should be cheap.
    write_audit(team_id, "media_list", invite_token=invite.get("_raw_token"))

    return ok({
        "items": items,
        "next_cursor": json.dumps(lek) if lek else None,
    })
