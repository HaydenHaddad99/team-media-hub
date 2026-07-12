"""
Push notification sender — triggered by EventBridge every 5 minutes.

For each team with notif_pending_since older than NOTIFICATION_COOLDOWN_SECONDS,
sends a Web Push notification (VAPID, for browsers/PWA) and a native push
(APNs/FCM via SNS, for the Capacitor mobile app) to all subscribers, then
clears the flag.
"""
import json
import os
import time

import boto3
from boto3.dynamodb.conditions import Key

TABLE_TEAMS = os.environ.get("TABLE_TEAMS", "")
TABLE_PUSH_SUBSCRIPTIONS = os.environ.get("TABLE_PUSH_SUBSCRIPTIONS", "")
TABLE_DEVICE_TOKENS = os.environ.get("TABLE_DEVICE_TOKENS", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_CONTACT = os.environ.get("VAPID_CONTACT", "mailto:support@teammediahub.co")
NOTIFICATION_COOLDOWN = int(os.environ.get("NOTIFICATION_COOLDOWN_SECONDS", "3600"))
NOTIFICATION_BODY = "New photos were added to your team album! 📸"

_dynamodb = boto3.resource("dynamodb")
_sns = boto3.client("sns")


def _teams_table():
    return _dynamodb.Table(TABLE_TEAMS)


def _subs_table():
    return _dynamodb.Table(TABLE_PUSH_SUBSCRIPTIONS)


def _devices_table():
    return _dynamodb.Table(TABLE_DEVICE_TOKENS)


def handler(event, context):
    now = int(time.time())
    cutoff = now - NOTIFICATION_COOLDOWN

    # Scan teams for those with notif_pending_since set and old enough
    resp = _teams_table().scan(
        FilterExpression="attribute_exists(notif_pending_since)",
        ProjectionExpression="team_id, team_name, notif_pending_since",
    )
    candidates = resp.get("Items", [])
    ready = [t for t in candidates if int(t.get("notif_pending_since", now)) <= cutoff]

    print(f"[NOTIF] {len(candidates)} teams pending, {len(ready)} ready to notify")

    notified = 0
    for team in ready:
        try:
            _notify_team(team, now)
            notified += 1
        except Exception as exc:
            print(f"[NOTIF] Error notifying team {team.get('team_id')}: {exc}")

    return {"ok": True, "notified": notified}


def _notify_team(team: dict, now: int):
    team_id = team["team_id"]
    team_name = team.get("team_name") or "Your team"

    _send_web_push(team_id, team_name)
    _send_native_push(team_id, team_name)
    _clear_flag(team_id)


def _send_web_push(team_id: str, team_name: str):
    if not VAPID_PRIVATE_KEY:
        return

    resp = _subs_table().query(KeyConditionExpression=Key("team_id").eq(team_id))
    subs = resp.get("Items", [])
    if not subs:
        return

    payload = json.dumps({"title": team_name, "body": NOTIFICATION_BODY, "url": "/"})

    from pywebpush import webpush

    sent = 0
    for sub in subs:
        endpoint = sub.get("endpoint")
        p256dh = sub.get("keys_p256dh")
        auth = sub.get("keys_auth")
        endpoint_hash = sub.get("endpoint_hash")
        if not endpoint or not p256dh or not auth:
            continue
        try:
            webpush(
                subscription_info={
                    "endpoint": endpoint,
                    "keys": {"p256dh": p256dh, "auth": auth},
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CONTACT},
            )
            sent += 1
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            if status in (404, 410):
                # Subscription expired — remove it
                if endpoint_hash:
                    _subs_table().delete_item(
                        Key={"team_id": team_id, "endpoint_hash": endpoint_hash}
                    )
            else:
                print(f"[NOTIF] Web push error for {endpoint[:50]}: {exc}")

    print(f"[NOTIF] Team {team_id}: web push sent={sent}/{len(subs)}")


def _send_native_push(team_id: str, team_name: str):
    if not TABLE_DEVICE_TOKENS:
        return

    resp = _devices_table().query(KeyConditionExpression=Key("team_id").eq(team_id))
    devices = [d for d in resp.get("Items", []) if d.get("endpoint_arn")]
    if not devices:
        return

    apns_payload = json.dumps({
        "aps": {"alert": {"title": team_name, "body": NOTIFICATION_BODY}, "sound": "default"},
    })
    gcm_payload = json.dumps({
        "notification": {"title": team_name, "body": NOTIFICATION_BODY},
        "data": {"url": "/"},
    })

    sent = 0
    for device in devices:
        endpoint_arn = device["endpoint_arn"]
        platform = device.get("platform")
        message = json.dumps({
            "default": NOTIFICATION_BODY,
            "APNS": apns_payload,
            "APNS_SANDBOX": apns_payload,
        } if platform == "ios" else {
            "default": NOTIFICATION_BODY,
            "GCM": gcm_payload,
        })
        try:
            _sns.publish(TargetArn=endpoint_arn, Message=message, MessageStructure="json")
            sent += 1
        except _sns.exceptions.EndpointDisabledException:
            _devices_table().delete_item(
                Key={"team_id": team_id, "device_token_hash": device["device_token_hash"]}
            )
        except Exception as exc:
            print(f"[NOTIF] Native push error for {endpoint_arn}: {exc}")

    print(f"[NOTIF] Team {team_id}: native push sent={sent}/{len(devices)}")


def _clear_flag(team_id: str):
    _teams_table().update_item(
        Key={"team_id": team_id},
        UpdateExpression="REMOVE notif_pending_since",
    )
