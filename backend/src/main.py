import json
from typing import Any, Dict, Tuple

from common.responses import ok, err
from handlers.health import handle_health
from handlers.me import handle_me
from handlers.demo import handle_demo
from handlers.teams_create import handle_teams_create
from handlers.invites_create import handle_invites_create
from handlers.media_list import handle_media_list
from handlers.media_presign_upload import handle_media_presign_upload
from handlers.media_complete import handle_media_complete
from handlers.media_presign_download import handle_media_presign_download
from handlers.media_thumbnail import handle_media_thumbnail
from handlers.media_delete import handle_media_delete
from handlers.auth_join_team import handle_auth_join_team
from handlers.auth_verify import handle_auth_verify
from handlers.auth_coach_signin import handle_coach_signin
from handlers.auth_verify_coach import handle_verify_coach
from handlers.coach_teams import handle_get_coach_teams

def _route(event: Dict) -> Tuple[str, str]:
    rc = (event.get("requestContext") or {})
    http = (rc.get("http") or {})
    method = http.get("method", "GET")
    path = event.get("rawPath") or "/"
    return method.upper(), path

def _json_body(event: Dict) -> Dict:
    body = event.get("body")
    if not body:
        return {}
    if event.get("isBase64Encoded"):
        return {}
    try:
        return json.loads(body)
    except Exception:
        return {}

def handler(event: Dict, context: Any) -> Dict:
    method, path = _route(event)

    if method == "OPTIONS":
        return ok({"ok": True})

    try:
        if method == "GET" and path == "/health":
            return handle_health(event)

        if method == "GET" and path == "/me":
            return handle_me(event)

        if method == "GET" and path == "/demo":
            return handle_demo(event)

        if method == "POST" and path == "/teams":
            body = _json_body(event)
            # Check if this is a coach creating a team (has x-user-token)
            user_id = None
            user_token = event.get("headers", {}).get("x-user-token", "").strip()
            if user_token:
                try:
                    from common.config import DYNAMODB
                    import os
                    tokens_table = DYNAMODB.Table(os.getenv("TABLE_USER_TOKENS", "UserTokensTable"))
                    response = tokens_table.get_item(Key={"token_hash": user_token})
                    token_record = response.get("Item")
                    if token_record:
                        user_id = token_record.get("user_id")
                except Exception as e:
                    print(f"Warning: Failed to extract user_id from token: {e}")
            return handle_teams_create(event, body, user_id=user_id)

        if method == "POST" and path == "/invites":
            body = _json_body(event)
            return handle_invites_create(event, body)
        
        if method == "POST" and path == "/auth/join-team":
            body = _json_body(event)
            return handle_auth_join_team(event, body)
        
        if method == "POST" and path == "/auth/verify":
            body = _json_body(event)
            return handle_auth_verify(event, body)

        if method == "POST" and path == "/auth/coach-signin":
            body = _json_body(event)
            return handle_coach_signin(event, body)
        
        if method == "POST" and path == "/auth/verify-coach":
            body = _json_body(event)
            return handle_verify_coach(event, body)

        if method == "GET" and path == "/coach/teams":
            return handle_get_coach_teams(event)

        if method == "GET" and path == "/media/thumbnail":
            return handle_media_thumbnail(event)

        if method == "GET" and path == "/media":
            return handle_media_list(event)

        if method == "DELETE" and path == "/media":
            return handle_media_delete(event)

        if method == "POST" and path == "/media/upload-url":
            body = _json_body(event)
            return handle_media_presign_upload(event, body)

        if method == "POST" and path == "/media/complete":
            body = _json_body(event)
            return handle_media_complete(event, body)

        if method == "GET" and path == "/media/download-url":
            return handle_media_presign_download(event)

        return err("Not found.", 404, code="not_found")

    except Exception:
        return err("Server error.", 500, code="server_error")
