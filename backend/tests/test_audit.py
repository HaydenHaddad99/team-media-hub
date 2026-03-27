"""Tests for common/audit.py – audit logging with hashed PII."""
import json
import hashlib
from common.audit import write_audit, _sha256


class TestSha256:
    def test_deterministic(self):
        assert _sha256("test") == _sha256("test")

    def test_matches_hashlib(self):
        expected = hashlib.sha256(b"hello").hexdigest()
        assert _sha256("hello") == expected


class TestWriteAudit:
    def test_writes_record(self, aws):
        write_audit("team-audit", "test_action", invite_token="tok123")
        items = aws["audit_table"].scan()["Items"]
        assert len(items) == 1
        item = items[0]
        assert item["team_id"] == "team-audit"
        assert item["action"] == "test_action"
        assert "invite_token_hash" in item
        # Token is hashed, not stored raw
        assert item["invite_token_hash"] != "tok123"
        assert item["invite_token_hash"] == _sha256("tok123")

    def test_hashes_ip_and_ua(self, aws):
        write_audit("team-audit2", "login", invite_token="t",
                    ip="192.168.1.1", ua="Mozilla/5.0")
        items = aws["audit_table"].scan()["Items"]
        item = items[0]
        assert "ip_hash" in item
        assert "ua_hash" in item
        assert item["ip_hash"] != "192.168.1.1"
        assert item["ua_hash"] != "Mozilla/5.0"

    def test_stores_meta(self, aws):
        write_audit("team-audit3", "upload", invite_token="t",
                    meta={"size": 1024})
        items = aws["audit_table"].scan()["Items"]
        assert items[0]["meta"]["size"] == 1024

    def test_no_audit_table_skips(self, aws, monkeypatch):
        monkeypatch.setenv("TABLE_AUDIT", "")
        # Reload config to pick up empty TABLE_AUDIT
        import importlib
        import common.config
        importlib.reload(common.config)
        monkeypatch.setattr("common.audit.TABLE_AUDIT", "")
        # Should not raise
        write_audit("team-x", "test", invite_token="t")
