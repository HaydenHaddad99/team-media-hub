"""Tests for common/db.py – DynamoDB helper functions."""
import json
from decimal import Decimal
from common.db import get_item, put_item, delete_item, update_item, query_media_items, query_media_by_id, query_items, _normalize


class TestNormalize:
    def test_decimal_integer(self):
        assert _normalize(Decimal("42")) == 42
        assert isinstance(_normalize(Decimal("42")), int)

    def test_decimal_float(self):
        result = _normalize(Decimal("3.14"))
        assert abs(result - 3.14) < 0.001
        assert isinstance(result, float)

    def test_nested_dict(self):
        data = {"a": Decimal("1"), "b": {"c": Decimal("2.5")}}
        result = _normalize(data)
        assert result == {"a": 1, "b": {"c": 2.5}}

    def test_list(self):
        assert _normalize([Decimal("1"), Decimal("2")]) == [1, 2]

    def test_string_passthrough(self):
        assert _normalize("hello") == "hello"


class TestGetItem:
    def test_item_found(self, aws):
        aws["teams_table"].put_item(Item={"team_id": "t1", "team_name": "Test"})
        item = get_item("Teams", {"team_id": "t1"})
        assert item["team_name"] == "Test"

    def test_item_not_found(self, aws):
        item = get_item("Teams", {"team_id": "nonexistent"})
        assert item is None


class TestPutAndDelete:
    def test_put_and_get(self, aws):
        put_item("Teams", {"team_id": "t2", "team_name": "Second"})
        item = get_item("Teams", {"team_id": "t2"})
        assert item["team_name"] == "Second"

    def test_delete(self, aws):
        put_item("Teams", {"team_id": "t3", "team_name": "Third"})
        delete_item("Teams", {"team_id": "t3"})
        assert get_item("Teams", {"team_id": "t3"}) is None


class TestUpdateItem:
    def test_update_expression(self, aws):
        put_item("Teams", {"team_id": "t4", "used_bytes": 0})
        update_item(
            "Teams",
            {"team_id": "t4"},
            "SET used_bytes = used_bytes + :size",
            expression_values={":size": 1024},
        )
        item = get_item("Teams", {"team_id": "t4"})
        assert item["used_bytes"] == 1024

    def test_update_with_expression_names(self, aws):
        put_item("Teams", {"team_id": "t5", "plan": "free"})
        update_item(
            "Teams",
            {"team_id": "t5"},
            "SET #p = :val",
            expression_values={":val": "plus"},
            expression_names={"#p": "plan"},
        )
        item = get_item("Teams", {"team_id": "t5"})
        assert item["plan"] == "plus"


class TestQueryMediaItems:
    def test_returns_items_newest_first(self, aws):
        for i in range(3):
            aws["media_table"].put_item(Item={
                "team_id": "t1",
                "sk": f"{1000 + i}#media-{i}",
                "media_id": f"media-{i}",
                "gsi1pk": f"media-{i}",
                "filename": f"file-{i}.jpg",
            })
        items, cursor = query_media_items("Media", team_id="t1", limit=10)
        assert len(items) == 3
        # Newest first (ScanIndexForward=False → descending sk)
        assert items[0]["media_id"] == "media-2"

    def test_empty_team(self, aws):
        items, cursor = query_media_items("Media", team_id="empty-team")
        assert items == []
        assert cursor is None

    def test_pagination(self, aws):
        for i in range(5):
            aws["media_table"].put_item(Item={
                "team_id": "t2",
                "sk": f"{2000 + i}#m-{i}",
                "media_id": f"m-{i}",
                "gsi1pk": f"m-{i}",
            })
        items, cursor = query_media_items("Media", team_id="t2", limit=2)
        assert len(items) == 2
        assert cursor is not None

        items2, cursor2 = query_media_items("Media", team_id="t2", limit=10, cursor=cursor)
        assert len(items2) == 3


class TestQueryMediaById:
    def test_found(self, aws):
        aws["media_table"].put_item(Item={
            "team_id": "t1",
            "sk": "1000#m1",
            "media_id": "m1",
            "gsi1pk": "m1",
            "object_key": "media/t1/m1/photo.jpg",
        })
        item = query_media_by_id("Media", media_id="m1")
        assert item is not None
        assert item["object_key"] == "media/t1/m1/photo.jpg"

    def test_not_found(self, aws):
        item = query_media_by_id("Media", media_id="nonexistent")
        assert item is None


class TestQueryItems:
    def test_string_condition(self, aws):
        aws["dynamodb"].Table("Users").put_item(Item={
            "user_id": "u1",
            "email": "test@example.com",
        })
        items, _ = query_items(
            "Users",
            key_condition="email = :email",
            expression_values={":email": "test@example.com"},
            index_name="email-index",
        )
        assert len(items) == 1
        assert items[0]["email"] == "test@example.com"

    def test_boto3_key_condition(self, aws):
        from boto3.dynamodb.conditions import Key
        aws["dynamodb"].Table("TeamMembers").put_item(Item={
            "user_id": "u1",
            "team_id": "t1",
            "role": "admin",
        })
        items, _ = query_items(
            "TeamMembers",
            key_condition=Key("user_id").eq("u1") & Key("team_id").eq("t1"),
        )
        assert len(items) == 1
        assert items[0]["role"] == "admin"
