"""Tests for handlers/device_register.py (native mobile push registration)."""
import hashlib
from unittest.mock import MagicMock
from conftest import make_invite_token, make_event
from handlers.device_register import handle_device_register, handle_device_unregister

FAKE_TOKEN = "fake-apns-or-fcm-device-token-1234567890"


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:32]


class TestHandleDeviceRegister:
    def test_saves_device_without_sns_configured(self, aws):
        """When no SNS platform application ARN is configured yet (no Apple/Firebase
        account), registration still succeeds and just stores the raw token."""
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        event = make_event(
            method="POST",
            path="/devices/register",
            body={"device_token": FAKE_TOKEN, "platform": "ios"},
            headers={"x-invite-token": token},
        )
        resp = handle_device_register(event, {"device_token": FAKE_TOKEN, "platform": "ios"})
        assert resp["statusCode"] == 200

        item = aws["device_tokens_table"].get_item(
            Key={"team_id": "team-1", "device_token_hash": _token_hash(FAKE_TOKEN)}
        ).get("Item")
        assert item is not None
        assert item["device_token"] == FAKE_TOKEN
        assert item["platform"] == "ios"
        assert item["endpoint_arn"] == ""

    def test_creates_sns_endpoint_when_platform_arn_configured(self, aws, monkeypatch):
        mock_sns = MagicMock()
        mock_sns.create_platform_endpoint.return_value = {"EndpointArn": "arn:aws:sns:us-east-1:123:endpoint/APNS/app/abc"}
        monkeypatch.setattr("handlers.device_register._sns", mock_sns)
        monkeypatch.setattr("handlers.device_register.SNS_PLATFORM_APP_ARN_IOS", "arn:aws:sns:us-east-1:123:app/APNS/app")
        monkeypatch.setattr("handlers.device_register._PLATFORM_ARNS", {"ios": "arn:aws:sns:us-east-1:123:app/APNS/app", "android": ""})

        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        event = make_event(
            method="POST",
            path="/devices/register",
            body={"device_token": FAKE_TOKEN, "platform": "ios"},
            headers={"x-invite-token": token},
        )
        resp = handle_device_register(event, {"device_token": FAKE_TOKEN, "platform": "ios"})
        assert resp["statusCode"] == 200

        item = aws["device_tokens_table"].get_item(
            Key={"team_id": "team-1", "device_token_hash": _token_hash(FAKE_TOKEN)}
        ).get("Item")
        assert item["endpoint_arn"] == "arn:aws:sns:us-east-1:123:endpoint/APNS/app/abc"

    def test_invalid_platform_returns_400(self, aws):
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        event = make_event(
            method="POST",
            path="/devices/register",
            body={"device_token": FAKE_TOKEN, "platform": "windows"},
            headers={"x-invite-token": token},
        )
        resp = handle_device_register(event, {"device_token": FAKE_TOKEN, "platform": "windows"})
        assert resp["statusCode"] == 400

    def test_missing_device_token_returns_400(self, aws):
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        event = make_event(
            method="POST",
            path="/devices/register",
            body={"platform": "ios"},
            headers={"x-invite-token": token},
        )
        resp = handle_device_register(event, {"platform": "ios"})
        assert resp["statusCode"] == 400

    def test_no_auth_token_returns_401(self, aws):
        event = make_event(
            method="POST",
            path="/devices/register",
            body={"device_token": FAKE_TOKEN, "platform": "ios"},
        )
        resp = handle_device_register(event, {"device_token": FAKE_TOKEN, "platform": "ios"})
        assert resp["statusCode"] == 401


class TestHandleDeviceUnregister:
    def test_removes_device_from_dynamodb(self, aws):
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        h = _token_hash(FAKE_TOKEN)
        aws["device_tokens_table"].put_item(Item={
            "team_id": "team-1",
            "device_token_hash": h,
            "device_token": FAKE_TOKEN,
            "platform": "ios",
            "endpoint_arn": "",
        })

        event = make_event(
            method="DELETE",
            path="/devices/register",
            body={"device_token": FAKE_TOKEN},
            headers={"x-invite-token": token},
        )
        resp = handle_device_unregister(event, {"device_token": FAKE_TOKEN})
        assert resp["statusCode"] == 200

        item = aws["device_tokens_table"].get_item(
            Key={"team_id": "team-1", "device_token_hash": h}
        ).get("Item")
        assert item is None

    def test_missing_device_token_returns_400(self, aws):
        token, _, record = make_invite_token("team-1", role="uploader")
        aws["invites_table"].put_item(Item=record)

        event = make_event(method="DELETE", path="/devices/register", body={}, headers={"x-invite-token": token})
        resp = handle_device_unregister(event, {})
        assert resp["statusCode"] == 400

    def test_no_auth_returns_401(self, aws):
        event = make_event(method="DELETE", path="/devices/register", body={"device_token": FAKE_TOKEN})
        resp = handle_device_unregister(event, {"device_token": FAKE_TOKEN})
        assert resp["statusCode"] == 401
