"""Tests for common/responses.py – ok() and err() helpers."""
import json
from common.responses import ok, err, _headers


class TestOk:
    def test_ok_default_status(self):
        resp = ok({"hello": "world"})
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body == {"hello": "world"}

    def test_ok_custom_status(self):
        resp = ok({"created": True}, status_code=201)
        assert resp["statusCode"] == 201

    def test_ok_extra_headers(self):
        resp = ok({}, extra_headers={"x-custom": "value"})
        assert resp["headers"]["x-custom"] == "value"
        # Default headers still present
        assert resp["headers"]["content-type"] == "application/json"

    def test_ok_cors_headers(self):
        resp = ok({})
        h = resp["headers"]
        assert h["access-control-allow-origin"] == "*"
        assert "x-invite-token" in h["access-control-allow-headers"]


class TestErr:
    def test_err_default_code(self):
        resp = err("Something went wrong")
        assert resp["statusCode"] == 400
        body = json.loads(resp["body"])
        assert body["error"]["message"] == "Something went wrong"
        assert body["error"]["code"] == "bad_request"

    def test_err_custom_status_and_code(self):
        resp = err("Not found", 404, code="not_found")
        assert resp["statusCode"] == 404
        body = json.loads(resp["body"])
        assert body["error"]["code"] == "not_found"

    def test_err_401(self):
        resp = err("Unauthorized", 401, code="unauthorized")
        assert resp["statusCode"] == 401

    def test_err_body_is_valid_json(self):
        resp = err("test")
        # Should not raise
        json.loads(resp["body"])
