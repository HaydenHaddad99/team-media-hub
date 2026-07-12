"""Tests for notifications/notification_sender.py"""
import os
import time
import json
from unittest.mock import patch, MagicMock

# Set env vars before module import
os.environ.setdefault("TABLE_TEAMS", "Teams")
os.environ.setdefault("TABLE_PUSH_SUBSCRIPTIONS", "PushSubscriptions")
os.environ.setdefault("VAPID_PRIVATE_KEY", "fake-vapid-private-key")
os.environ.setdefault("VAPID_PUBLIC_KEY", "fake-vapid-public-key")
os.environ.setdefault("NOTIFICATION_COOLDOWN_SECONDS", "3600")

from notifications.notification_sender import handler, _clear_flag, _notify_team


class TestNotificationSenderHandler:
    def test_skips_when_no_vapid_key(self, aws, monkeypatch):
        monkeypatch.setattr("notifications.notification_sender.VAPID_PRIVATE_KEY", "")
        result = handler({}, None)
        assert result["ok"] is True
        assert result.get("notified", 0) == 0

    def test_skips_teams_with_recent_pending_since(self, aws):
        """Teams with notif_pending_since set < 3600s ago should NOT be notified."""
        now = int(time.time())
        aws["teams_table"].put_item(Item={
            "team_id": "team-recent",
            "team_name": "Recent Team",
            "notif_pending_since": now - 30,  # 30 seconds ago < 3600
        })

        with patch("notifications.notification_sender.VAPID_PRIVATE_KEY", "fake-key"):
            result = handler({}, None)

        assert result["notified"] == 0
        # Flag should still be set
        item = aws["teams_table"].get_item(Key={"team_id": "team-recent"}).get("Item")
        assert "notif_pending_since" in item

    def test_notifies_teams_with_old_pending_since(self, aws):
        """Teams with notif_pending_since > 3600s ago should be notified."""
        now = int(time.time())
        aws["teams_table"].put_item(Item={
            "team_id": "team-old",
            "team_name": "Old Team",
            "notif_pending_since": now - 7200,  # 2 hours ago > 3600
        })
        # Add a subscription
        aws["push_subscriptions_table"].put_item(Item={
            "team_id": "team-old",
            "endpoint_hash": "abc123",
            "endpoint": "https://fcm.googleapis.com/test",
            "keys_p256dh": "Bfake_p256dh_key",
            "keys_auth": "fake_auth",
        })

        with patch("notifications.notification_sender.VAPID_PRIVATE_KEY", "fake-key"):
            with patch("pywebpush.webpush") as mock_wp:
                result = handler({}, None)

        assert result["notified"] == 1
        # Flag should be cleared
        item = aws["teams_table"].get_item(Key={"team_id": "team-old"}).get("Item")
        assert "notif_pending_since" not in item

    def test_clears_flag_when_no_subscriptions(self, aws):
        """Teams with old pending_since but no subscriptions should clear the flag."""
        now = int(time.time())
        aws["teams_table"].put_item(Item={
            "team_id": "team-nosubs",
            "team_name": "No Subs Team",
            "notif_pending_since": now - 7200,
        })

        with patch("notifications.notification_sender.VAPID_PRIVATE_KEY", "fake-key"):
            result = handler({}, None)

        assert result["notified"] == 1
        item = aws["teams_table"].get_item(Key={"team_id": "team-nosubs"}).get("Item")
        assert "notif_pending_since" not in item

    def test_deletes_expired_subscriptions(self, aws):
        """Subscriptions returning 410 should be removed from DynamoDB."""
        now = int(time.time())
        aws["teams_table"].put_item(Item={
            "team_id": "team-expired",
            "team_name": "Expired Team",
            "notif_pending_since": now - 7200,
        })
        aws["push_subscriptions_table"].put_item(Item={
            "team_id": "team-expired",
            "endpoint_hash": "deadbeef",
            "endpoint": "https://expired.example.com/push",
            "keys_p256dh": "Bfake",
            "keys_auth": "fakeauth",
        })

        exc = Exception("Push failed")
        exc.status_code = 410

        with patch("notifications.notification_sender.VAPID_PRIVATE_KEY", "fake-key"):
            with patch("pywebpush.webpush", side_effect=exc):
                result = handler({}, None)

        assert result["notified"] == 1
        # Expired sub should be deleted
        item = aws["push_subscriptions_table"].get_item(
            Key={"team_id": "team-expired", "endpoint_hash": "deadbeef"}
        ).get("Item")
        assert item is None


class TestClearFlag:
    def test_removes_notif_pending_since(self, aws):
        aws["teams_table"].put_item(Item={
            "team_id": "team-x",
            "notif_pending_since": 12345,
        })
        _clear_flag("team-x")
        item = aws["teams_table"].get_item(Key={"team_id": "team-x"}).get("Item")
        assert "notif_pending_since" not in item
