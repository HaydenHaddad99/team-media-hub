"""Tests for handlers/push_subscribe.py"""
import json
import hashlib
from conftest import make_invite_token, make_event
from handlers.push_subscribe import handle_push_subscribe, handle_push_unsubscribe


def _endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode()).hexdigest()[:32]


FAKE_ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-endpoint-abc"
FAKE_P256DH = "BGFakeP256DHPublicKey1234567890abcdefghijklmnopqrstuv"
FAKE_AUTH = "FakeAuthSecret12345"


class TestHandlePushSubscribe:
    def test_saves_subscription_to_dynamodb(self, aws):
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        event = make_event(
            method="POST",
            path="/push/subscribe",
            body={"endpoint": FAKE_ENDPOINT, "keys": {"p256dh": FAKE_P256DH, "auth": FAKE_AUTH}},
            headers={"x-invite-token": token},
        )
        resp = handle_push_subscribe(event, event["body"] and json.loads(event["body"]) or {})
        assert resp["statusCode"] == 200

        subs_table = aws["push_subscriptions_table"]
        item = subs_table.get_item(
            Key={"team_id": "team-1", "endpoint_hash": _endpoint_hash(FAKE_ENDPOINT)}
        ).get("Item")
        assert item is not None
        assert item["endpoint"] == FAKE_ENDPOINT
        assert item["keys_p256dh"] == FAKE_P256DH
        assert item["keys_auth"] == FAKE_AUTH

    def test_missing_endpoint_returns_400(self, aws):
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        event = make_event(
            method="POST",
            path="/push/subscribe",
            body={"keys": {"p256dh": FAKE_P256DH, "auth": FAKE_AUTH}},
            headers={"x-invite-token": token},
        )
        resp = handle_push_subscribe(event, json.loads(event["body"]))
        assert resp["statusCode"] == 400

    def test_missing_keys_returns_400(self, aws):
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        event = make_event(
            method="POST",
            path="/push/subscribe",
            body={"endpoint": FAKE_ENDPOINT},
            headers={"x-invite-token": token},
        )
        resp = handle_push_subscribe(event, json.loads(event["body"]))
        assert resp["statusCode"] == 400

    def test_no_auth_token_returns_401(self, aws):
        event = make_event(
            method="POST",
            path="/push/subscribe",
            body={"endpoint": FAKE_ENDPOINT, "keys": {"p256dh": FAKE_P256DH, "auth": FAKE_AUTH}},
        )
        resp = handle_push_subscribe(event, json.loads(event["body"]))
        assert resp["statusCode"] == 401


class TestHandlePushUnsubscribe:
    def test_removes_subscription_from_dynamodb(self, aws):
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        # Pre-seed a subscription
        h = _endpoint_hash(FAKE_ENDPOINT)
        aws["push_subscriptions_table"].put_item(Item={
            "team_id": "team-1",
            "endpoint_hash": h,
            "endpoint": FAKE_ENDPOINT,
        })

        event = make_event(
            method="DELETE",
            path="/push/subscribe",
            body={"endpoint": FAKE_ENDPOINT},
            headers={"x-invite-token": token},
        )
        resp = handle_push_unsubscribe(event, json.loads(event["body"]))
        assert resp["statusCode"] == 200

        item = aws["push_subscriptions_table"].get_item(
            Key={"team_id": "team-1", "endpoint_hash": h}
        ).get("Item")
        assert item is None

    def test_missing_endpoint_returns_400(self, aws):
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        event = make_event(
            method="DELETE",
            path="/push/subscribe",
            body={},
            headers={"x-invite-token": token},
        )
        resp = handle_push_unsubscribe(event, {})
        assert resp["statusCode"] == 400

    def test_no_auth_returns_401(self, aws):
        event = make_event(method="DELETE", path="/push/subscribe", body={"endpoint": FAKE_ENDPOINT})
        resp = handle_push_unsubscribe(event, json.loads(event["body"]))
        assert resp["statusCode"] == 401
