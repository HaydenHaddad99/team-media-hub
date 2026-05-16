"""Tests for handlers/auth_lookup_teams.py"""
import os
import time

os.environ.setdefault("TABLE_USERS", "Users")
os.environ.setdefault("TABLE_TEAM_MEMBERS", "TeamMembers")
os.environ.setdefault("TABLE_TEAMS", "Teams")

from handlers.auth_lookup_teams import handle_auth_lookup_teams
from tests.conftest import make_event


def _event(email: str = ""):
    return make_event(method="GET", path="/auth/lookup-teams", query=f"email={email}")


class TestAuthLookupTeams:
    def test_missing_email_returns_400(self, aws):
        res = handle_auth_lookup_teams(_event(""))
        assert res["statusCode"] == 400

    def test_invalid_email_returns_400(self, aws):
        res = handle_auth_lookup_teams(_event("notanemail"))
        assert res["statusCode"] == 400

    def test_unknown_email_returns_empty_list(self, aws):
        res = handle_auth_lookup_teams(_event("nobody@example.com"))
        import json
        body = json.loads(res["body"])
        assert body["teams"] == []

    def test_known_user_with_one_team(self, aws):
        import json
        aws["dynamodb"].Table("Teams").put_item(Item={
            "team_id": "team-abc",
            "team_name": "Stage Inc.",
            "team_code": "STAGE-INC",
        })
        aws["dynamodb"].Table("Users").put_item(Item={
            "user_id": "usr_abc",
            "email": "parent@example.com",
        })
        aws["dynamodb"].Table("TeamMembers").put_item(Item={
            "user_id": "usr_abc",
            "team_id": "team-abc",
            "role": "uploader",
            "joined_at": int(time.time()),
        })

        res = handle_auth_lookup_teams(_event("parent@example.com"))
        assert res["statusCode"] == 200
        body = json.loads(res["body"])
        assert len(body["teams"]) == 1
        assert body["teams"][0]["team_code"] == "STAGE-INC"
        assert body["teams"][0]["team_name"] == "Stage Inc."

    def test_known_user_with_multiple_teams(self, aws):
        import json
        for i in range(2):
            aws["dynamodb"].Table("Teams").put_item(Item={
                "team_id": f"team-{i}",
                "team_name": f"Team {i}",
                "team_code": f"TEAM-{i}",
            })
            aws["dynamodb"].Table("TeamMembers").put_item(Item={
                "user_id": "usr_multi",
                "team_id": f"team-{i}",
                "role": "uploader",
                "joined_at": int(time.time()),
            })
        aws["dynamodb"].Table("Users").put_item(Item={
            "user_id": "usr_multi",
            "email": "multi@example.com",
        })

        res = handle_auth_lookup_teams(_event("multi@example.com"))
        assert res["statusCode"] == 200
        body = json.loads(res["body"])
        assert len(body["teams"]) == 2

    def test_team_without_code_is_excluded(self, aws):
        import json
        aws["dynamodb"].Table("Teams").put_item(Item={
            "team_id": "team-nocode",
            "team_name": "No Code Team",
            # no team_code field
        })
        aws["dynamodb"].Table("Users").put_item(Item={
            "user_id": "usr_nocode",
            "email": "nocode@example.com",
        })
        aws["dynamodb"].Table("TeamMembers").put_item(Item={
            "user_id": "usr_nocode",
            "team_id": "team-nocode",
            "role": "uploader",
            "joined_at": int(time.time()),
        })

        res = handle_auth_lookup_teams(_event("nocode@example.com"))
        body = json.loads(res["body"])
        assert body["teams"] == []
