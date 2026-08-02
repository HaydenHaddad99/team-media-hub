import hashlib
import os
import time

from common.auth import require_invite
from common.config import DYNAMODB
from common.responses import ok, err

TABLE_PUSH_SUBSCRIPTIONS = os.environ.get("TABLE_PUSH_SUBSCRIPTIONS", "")


def _subs_table():
    return DYNAMODB.Table(TABLE_PUSH_SUBSCRIPTIONS)


def _endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode()).hexdigest()[:32]


def handle_push_subscribe(event, body):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    team_id = invite["team_id"]
    endpoint = (body or {}).get("endpoint", "").strip()
    keys = (body or {}).get("keys") or {}
    p256dh = keys.get("p256dh", "").strip()
    auth_key = keys.get("auth", "").strip()

    if not endpoint or not p256dh or not auth_key:
        return err("endpoint, keys.p256dh and keys.auth are required.", 400, code="validation_error")

    h = _endpoint_hash(endpoint)
    item = {
        "team_id": team_id,
        "endpoint_hash": h,
        "endpoint": endpoint,
        "keys_p256dh": p256dh,
        "keys_auth": auth_key,
        "user_id": invite.get("user_id") or "",
        "created_at": int(time.time()),
    }
    _subs_table().put_item(Item=item)
    return ok({"ok": True})


def handle_push_unsubscribe(event, body):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    team_id = invite["team_id"]
    endpoint = (body or {}).get("endpoint", "").strip()
    if not endpoint:
        return err("endpoint is required.", 400, code="validation_error")

    h = _endpoint_hash(endpoint)
    _subs_table().delete_item(Key={"team_id": team_id, "endpoint_hash": h})
    return ok({"ok": True})
