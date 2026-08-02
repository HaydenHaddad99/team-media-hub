import hashlib
import time

import boto3

from common.auth import require_invite
from common.config import DYNAMODB, TABLE_DEVICE_TOKENS, SNS_PLATFORM_APP_ARN_IOS, SNS_PLATFORM_APP_ARN_ANDROID
from common.responses import ok, err

_sns = boto3.client("sns")

_PLATFORM_ARNS = {
    "ios": SNS_PLATFORM_APP_ARN_IOS,
    "android": SNS_PLATFORM_APP_ARN_ANDROID,
}


def _tokens_table():
    return DYNAMODB.Table(TABLE_DEVICE_TOKENS)


def _token_hash(device_token: str) -> str:
    return hashlib.sha256(device_token.encode()).hexdigest()[:32]


def _create_sns_endpoint(platform: str, device_token: str):
    """Register the device token as an SNS platform endpoint. Returns the
    endpoint ARN, or None if the platform application isn't configured yet
    (e.g. no Apple Developer / Firebase account set up)."""
    platform_arn = _PLATFORM_ARNS.get(platform)
    if not platform_arn:
        return None
    try:
        resp = _sns.create_platform_endpoint(PlatformApplicationArn=platform_arn, Token=device_token)
        return resp.get("EndpointArn")
    except Exception as exc:
        print(f"[DEVICE] Failed to create SNS endpoint for {platform}: {exc}")
        return None


def handle_device_register(event, body):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    team_id = invite["team_id"]
    device_token = (body or {}).get("device_token", "").strip()
    platform = (body or {}).get("platform", "").strip().lower()

    if not device_token or platform not in ("ios", "android"):
        return err("device_token and platform ('ios' or 'android') are required.", 400, code="validation_error")

    h = _token_hash(device_token)
    endpoint_arn = _create_sns_endpoint(platform, device_token)

    item = {
        "team_id": team_id,
        "device_token_hash": h,
        "device_token": device_token,
        "platform": platform,
        "user_id": invite.get("user_id") or "",
        "endpoint_arn": endpoint_arn or "",
        "created_at": int(time.time()),
    }
    _tokens_table().put_item(Item=item)
    return ok({"ok": True, "registered_for_push": bool(endpoint_arn)})


def handle_device_unregister(event, body):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    team_id = invite["team_id"]
    device_token = (body or {}).get("device_token", "").strip()
    if not device_token:
        return err("device_token is required.", 400, code="validation_error")

    h = _token_hash(device_token)
    existing = _tokens_table().get_item(Key={"team_id": team_id, "device_token_hash": h}).get("Item")
    if existing and existing.get("endpoint_arn"):
        try:
            _sns.delete_endpoint(EndpointArn=existing["endpoint_arn"])
        except Exception as exc:
            print(f"[DEVICE] Failed to delete SNS endpoint: {exc}")

    _tokens_table().delete_item(Key={"team_id": team_id, "device_token_hash": h})
    return ok({"ok": True})
