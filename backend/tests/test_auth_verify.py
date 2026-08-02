"""Tests for handlers/auth_verify.py session TTL by client type."""
import time
from common.user_auth import hash_code
from handlers.auth_verify import handle_auth_verify

CODE = "123456"


def _seed_team_and_code(aws, team_code="DALLAS-11B", email="parent@example.com"):
    aws["teams_table"].put_item(Item={
        "team_id": "team-1",
        "team_name": "Dallas 11B",
        "team_code": team_code,
    })
    aws["dynamodb"].Table("AuthCodes").put_item(Item={
        "code_hash": hash_code(CODE),
        "email": email,
        "created_at": int(time.time()),
        "expires_at": int(time.time()) + 600,
    })


class TestSessionTtlByClient:
    def test_web_default_gets_365_day_session(self, aws):
        _seed_team_and_code(aws)
        before = int(time.time())
        resp = handle_auth_verify({}, {"email": "parent@example.com", "code": CODE, "team_code": "DALLAS-11B"})
        assert resp["statusCode"] == 200

        invites = aws["dynamodb"].Table("Invites").scan()["Items"]
        assert len(invites) == 1
        ttl = invites[0]["expires_at"] - before
        assert 365 * 86400 - 5 <= ttl <= 365 * 86400 + 5

    def test_mobile_client_gets_90_day_session(self, aws):
        _seed_team_and_code(aws)
        before = int(time.time())
        resp = handle_auth_verify({}, {
            "email": "parent@example.com", "code": CODE, "team_code": "DALLAS-11B", "client": "mobile",
        })
        assert resp["statusCode"] == 200

        invites = aws["dynamodb"].Table("Invites").scan()["Items"]
        assert len(invites) == 1
        ttl = invites[0]["expires_at"] - before
        assert 90 * 86400 - 5 <= ttl <= 90 * 86400 + 5

    def test_unrecognized_client_falls_back_to_web_default(self, aws):
        _seed_team_and_code(aws)
        before = int(time.time())
        resp = handle_auth_verify({}, {
            "email": "parent@example.com", "code": CODE, "team_code": "DALLAS-11B", "client": "bogus",
        })
        assert resp["statusCode"] == 200

        invites = aws["dynamodb"].Table("Invites").scan()["Items"]
        ttl = invites[0]["expires_at"] - before
        assert 365 * 86400 - 5 <= ttl <= 365 * 86400 + 5
