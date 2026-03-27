"""Tests for common/auth.py – token hashing, require_invite, require_role."""
import json
import time
import hashlib
from conftest import make_invite_token, make_event

from common.auth import token_hash, require_invite, require_role


class TestTokenHash:
    def test_deterministic(self):
        assert token_hash("abc") == token_hash("abc")

    def test_sha256(self):
        expected = hashlib.sha256(b"hello").hexdigest()
        assert token_hash("hello") == expected

    def test_different_inputs_differ(self):
        assert token_hash("a") != token_hash("b")


class TestRequireInvite:
    def test_missing_token_returns_401(self, aws):
        event = make_event(headers={})
        invite, error = require_invite(event)
        assert invite is None
        assert error["statusCode"] == 401

    def test_invalid_token_returns_401(self, aws):
        event = make_event(headers={"x-invite-token": "nonexistent-token"})
        invite, error = require_invite(event)
        assert invite is None
        assert error["statusCode"] == 401

    def test_valid_token_returns_invite(self, aws):
        token, h, record = make_invite_token("team-1", role="admin")
        aws["invites_table"].put_item(Item=record)

        event = make_event(headers={"x-invite-token": token})
        invite, error = require_invite(event)
        assert error is None
        assert invite["team_id"] == "team-1"
        assert invite["role"] == "admin"
        assert invite["_raw_token"] == token

    def test_revoked_token_returns_401(self, aws):
        token, h, record = make_invite_token("team-1")
        record["revoked_at"] = int(time.time()) - 60
        aws["invites_table"].put_item(Item=record)

        event = make_event(headers={"x-invite-token": token})
        invite, error = require_invite(event)
        assert invite is None
        assert error["statusCode"] == 401

    def test_expired_token_returns_401(self, aws):
        token, h, record = make_invite_token("team-1")
        record["expires_at"] = int(time.time()) - 3600  # expired 1 hour ago
        aws["invites_table"].put_item(Item=record)

        event = make_event(headers={"x-invite-token": token})
        invite, error = require_invite(event)
        assert invite is None
        assert error["statusCode"] == 401

    def test_required_role_mismatch_returns_403(self, aws):
        token, h, record = make_invite_token("team-1", role="viewer")
        aws["invites_table"].put_item(Item=record)

        event = make_event(headers={"x-invite-token": token})
        invite, error = require_invite(event, required_role="admin")
        assert invite is None
        assert error["statusCode"] == 403

    def test_required_role_match_succeeds(self, aws):
        token, h, record = make_invite_token("team-1", role="admin")
        aws["invites_table"].put_item(Item=record)

        event = make_event(headers={"x-invite-token": token})
        invite, error = require_invite(event, required_role="admin")
        assert error is None
        assert invite["role"] == "admin"


class TestRequireRole:
    def test_role_allowed(self):
        invite = {"role": "admin"}
        result = require_role(invite, {"admin", "uploader"})
        assert result is None

    def test_role_denied(self):
        invite = {"role": "viewer"}
        result = require_role(invite, {"admin", "uploader"})
        assert result is not None
        assert result["statusCode"] == 403
