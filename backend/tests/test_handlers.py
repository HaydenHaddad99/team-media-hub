"""Tests for API handlers – health, me, media CRUD, routing."""
import json
import time
from unittest.mock import patch, MagicMock
from conftest import make_invite_token, make_event

from common.responses import ok
from handlers.health import handle_health
from handlers.me import handle_me
from handlers.media_list import handle_media_list
from handlers.media_delete import handle_media_delete
from main import handler, _route, _json_body


# ---------------------------------------------------------------------------
# Router / main.handler
# ---------------------------------------------------------------------------
class TestRouter:
    def test_route_extraction(self):
        event = make_event(method="POST", path="/teams")
        method, path = _route(event)
        assert method == "POST"
        assert path == "/teams"

    def test_json_body_valid(self):
        event = {"body": '{"key":"val"}', "isBase64Encoded": False}
        body = _json_body(event)
        assert body == {"key": "val"}

    def test_json_body_none(self):
        event = {"body": None, "isBase64Encoded": False}
        assert _json_body(event) == {}

    def test_json_body_invalid(self):
        event = {"body": "not-json", "isBase64Encoded": False}
        assert _json_body(event) == {}

    def test_options_returns_ok(self, aws):
        event = make_event(method="OPTIONS", path="/anything")
        resp = handler(event, None)
        assert resp["statusCode"] == 200

    def test_not_found_route(self, aws):
        event = make_event(method="GET", path="/nonexistent")
        resp = handler(event, None)
        assert resp["statusCode"] == 404


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class TestHealthHandler:
    def test_returns_ok(self):
        resp = handle_health({})
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["status"] == "ok"


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------
class TestMeHandler:
    def test_no_token_returns_401(self, aws):
        event = make_event(headers={})
        resp = handle_me(event)
        assert resp["statusCode"] == 401

    def test_valid_invite_returns_team_info(self, aws):
        token, h, record = make_invite_token("team-me", role="admin")
        aws["invites_table"].put_item(Item=record)
        aws["teams_table"].put_item(Item={
            "team_id": "team-me",
            "team_name": "My Team",
            "team_code": "MY-TEAM-CODE",
            "plan": "free",
            "storage_limit_gb": 10,
            "storage_limit_bytes": 10 * 1024 * 1024 * 1024,
            "used_bytes": 500,
        })

        event = make_event(headers={"x-invite-token": token})
        resp = handle_me(event)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["team"]["team_id"] == "team-me"
        assert body["team"]["team_name"] == "My Team"
        assert body["invite"]["role"] == "admin"


# ---------------------------------------------------------------------------
# /media  (list)
# ---------------------------------------------------------------------------
class TestMediaListHandler:
    def _seed(self, aws, team_id="team-ml", count=3, with_thumbs=False):
        token, h, record = make_invite_token(team_id, role="viewer", token="list-tok")
        aws["invites_table"].put_item(Item=record)
        for i in range(count):
            item = {
                "team_id": team_id,
                "sk": f"{1000 + i}#ml-{i}",
                "media_id": f"ml-{i}",
                "gsi1pk": f"ml-{i}",
                "filename": f"photo-{i}.jpg",
                "content_type": "image/jpeg",
                "object_key": f"media/{team_id}/ml-{i}/photo-{i}.jpg",
            }
            if with_thumbs:
                item["thumb_key"] = f"thumbnails/{team_id}/ml-{i}/thumb.jpg"
                item["preview_key"] = f"previews/{team_id}/ml-{i}/preview.jpg"
            aws["media_table"].put_item(Item=item)
        return "list-tok"

    def test_lists_media(self, aws):
        token = self._seed(aws)
        event = make_event(method="GET", path="/media", headers={"x-invite-token": token})
        resp = handle_media_list(event)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert len(body["items"]) == 3

    def test_list_requires_auth(self, aws):
        event = make_event(method="GET", path="/media")
        resp = handle_media_list(event)
        assert resp["statusCode"] == 401

    @patch("handlers.media_list.create_signed_url", return_value="https://dtest.cloudfront.net/signed-thumb")
    def test_thumb_url_is_cloudfront_signed(self, mock_sign, aws):
        """Thumbnails must be served via CloudFront signed URL (not Lambda proxy)."""
        token = self._seed(aws, team_id="team-cf", with_thumbs=True)
        event = make_event(method="GET", path="/media", headers={"x-invite-token": token})
        resp = handle_media_list(event)
        body = json.loads(resp["body"])
        for item in body["items"]:
            assert item["thumb_url"] == "https://dtest.cloudfront.net/signed-thumb"
            assert "/media/thumbnail" not in item["thumb_url"]

    @patch("handlers.media_list.create_signed_url", return_value="https://dtest.cloudfront.net/signed")
    def test_no_thumb_url_when_no_thumb_key(self, mock_sign, aws):
        """Items without thumb_key should have thumb_url=None."""
        token = self._seed(aws, team_id="team-no-thumb", with_thumbs=False)
        event = make_event(method="GET", path="/media", headers={"x-invite-token": token})
        resp = handle_media_list(event)
        body = json.loads(resp["body"])
        for item in body["items"]:
            assert item["thumb_url"] is None

    @patch("handlers.media_list.create_signed_url", return_value="https://dtest.cloudfront.net/signed")
    def test_preview_url_is_cloudfront_signed(self, mock_sign, aws):
        """Preview images must also be CloudFront signed URLs."""
        token = self._seed(aws, team_id="team-prev", with_thumbs=True)
        event = make_event(method="GET", path="/media", headers={"x-invite-token": token})
        resp = handle_media_list(event)
        body = json.loads(resp["body"])
        for item in body["items"]:
            assert item["preview_url"] is not None
            assert item["preview_url"].startswith("https://dtest.cloudfront.net/")


# ---------------------------------------------------------------------------
# /media (delete)
# ---------------------------------------------------------------------------
class TestMediaDeleteHandler:
    def test_delete_requires_auth(self, aws):
        event = make_event(method="DELETE", path="/media", query="media_id=m1")
        resp = handle_media_delete(event)
        assert resp["statusCode"] == 401

    def test_viewer_cannot_delete(self, aws):
        token, h, record = make_invite_token("team-del", role="viewer", token="del-viewer-tok")
        aws["invites_table"].put_item(Item=record)
        event = make_event(method="DELETE", path="/media",
                          headers={"x-invite-token": "del-viewer-tok"},
                          query="media_id=m1")
        resp = handle_media_delete(event)
        assert resp["statusCode"] == 403

    def test_delete_nonexistent_media(self, aws):
        token, h, record = make_invite_token("team-del", role="admin", token="del-admin-tok")
        aws["invites_table"].put_item(Item=record)
        event = make_event(method="DELETE", path="/media",
                          headers={"x-invite-token": "del-admin-tok"},
                          query="media_id=nonexistent")
        resp = handle_media_delete(event)
        assert resp["statusCode"] == 404

    def test_delete_missing_media_id(self, aws):
        token, h, record = make_invite_token("team-del", role="admin", token="del-admin-tok2")
        aws["invites_table"].put_item(Item=record)
        event = make_event(method="DELETE", path="/media",
                          headers={"x-invite-token": "del-admin-tok2"},
                          query="")
        resp = handle_media_delete(event)
        assert resp["statusCode"] == 400


# ---------------------------------------------------------------------------
# /media/upload-url (presign upload)
# ---------------------------------------------------------------------------
class TestMediaPresignUpload:
    def test_requires_auth(self, aws):
        from handlers.media_presign_upload import handle_media_presign_upload
        event = make_event(method="POST", path="/media/upload-url")
        resp = handle_media_presign_upload(event, {})
        assert resp["statusCode"] == 401

    def test_viewer_cannot_upload(self, aws):
        from handlers.media_presign_upload import handle_media_presign_upload
        token, h, record = make_invite_token("t-up", role="viewer", token="up-viewer")
        aws["invites_table"].put_item(Item=record)
        aws["teams_table"].put_item(Item={"team_id": "t-up", "storage_limit_bytes": 10**10, "used_bytes": 0})
        event = make_event(headers={"x-invite-token": "up-viewer"})
        resp = handle_media_presign_upload(event, {
            "filename": "test.jpg", "content_type": "image/jpeg", "size_bytes": 1024
        })
        assert resp["statusCode"] == 403

    def test_missing_fields_returns_400(self, aws):
        from handlers.media_presign_upload import handle_media_presign_upload
        token, h, record = make_invite_token("t-up2", role="uploader", token="up-ok")
        aws["invites_table"].put_item(Item=record)
        aws["teams_table"].put_item(Item={"team_id": "t-up2", "storage_limit_bytes": 10**10, "used_bytes": 0})
        event = make_event(headers={"x-invite-token": "up-ok"})
        resp = handle_media_presign_upload(event, {"filename": ""})
        assert resp["statusCode"] == 400

    def test_unsupported_content_type(self, aws):
        from handlers.media_presign_upload import handle_media_presign_upload
        token, h, record = make_invite_token("t-up3", role="uploader", token="up-ct")
        aws["invites_table"].put_item(Item=record)
        aws["teams_table"].put_item(Item={"team_id": "t-up3", "storage_limit_bytes": 10**10, "used_bytes": 0})
        event = make_event(headers={"x-invite-token": "up-ct"})
        resp = handle_media_presign_upload(event, {
            "filename": "malware.exe", "content_type": "application/x-msdownload", "size_bytes": 100
        })
        assert resp["statusCode"] == 400


# ---------------------------------------------------------------------------
# /media/complete
# ---------------------------------------------------------------------------
class TestMediaComplete:
    def test_requires_auth(self, aws):
        from handlers.media_complete import handle_media_complete
        event = make_event(method="POST", path="/media/complete")
        resp = handle_media_complete(event, {})
        assert resp["statusCode"] == 401

    def test_missing_fields_returns_400(self, aws):
        from handlers.media_complete import handle_media_complete
        token, h, record = make_invite_token("t-mc", role="uploader", token="mc-tok")
        aws["invites_table"].put_item(Item=record)
        aws["teams_table"].put_item(Item={"team_id": "t-mc", "storage_limit_bytes": 10**10, "used_bytes": 0})
        event = make_event(headers={"x-invite-token": "mc-tok"})
        resp = handle_media_complete(event, {"media_id": ""})
        assert resp["statusCode"] == 400

    def test_object_not_found_returns_409(self, aws):
        from handlers.media_complete import handle_media_complete
        token, h, record = make_invite_token("t-mc2", role="uploader", token="mc-tok2")
        aws["invites_table"].put_item(Item=record)
        aws["teams_table"].put_item(Item={"team_id": "t-mc2", "storage_limit_bytes": 10**10, "used_bytes": 0})
        event = make_event(headers={"x-invite-token": "mc-tok2"})
        resp = handle_media_complete(event, {
            "media_id": "m-new",
            "object_key": "media/t-mc2/m-new/photo.jpg",
            "filename": "photo.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 1024,
        })
        # S3 object doesn't exist → 409 conflict
        assert resp["statusCode"] == 409


# ---------------------------------------------------------------------------
# /billing/webhook
# ---------------------------------------------------------------------------
class TestBillingWebhook:
    def test_missing_signature_returns_400(self, aws):
        from handlers.billing_webhook import handle_billing_webhook
        event = make_event(method="POST", path="/billing/webhook", headers={})
        resp = handle_billing_webhook(event)
        assert resp["statusCode"] == 400
        body = json.loads(resp["body"])
        assert "signature" in body["error"]["message"].lower()


# ---------------------------------------------------------------------------
# End-to-end handler routing through main.handler
# ---------------------------------------------------------------------------
class TestEndToEndRouting:
    def test_health_via_router(self, aws):
        event = make_event(method="GET", path="/health")
        resp = handler(event, None)
        assert resp["statusCode"] == 200
        assert json.loads(resp["body"])["status"] == "ok"

    def test_me_via_router_no_token(self, aws):
        event = make_event(method="GET", path="/me")
        resp = handler(event, None)
        assert resp["statusCode"] == 401

    def test_media_list_via_router(self, aws):
        token, h, record = make_invite_token("team-r", role="viewer", token="route-tok")
        aws["invites_table"].put_item(Item=record)
        event = make_event(method="GET", path="/media", headers={"x-invite-token": "route-tok"})
        resp = handler(event, None)
        assert resp["statusCode"] == 200

    def test_unknown_route_404(self, aws):
        event = make_event(method="GET", path="/does-not-exist")
        resp = handler(event, None)
        assert resp["statusCode"] == 404
