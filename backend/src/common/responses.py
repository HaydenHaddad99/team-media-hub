import json
from typing import Any, Dict, Optional

def _headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    base = {
        "content-type": "application/json",
        "cache-control": "no-store",
        # CORS is handled entirely here, not via API Gateway's declarative CORS
        # config: HttpApi's CORS validation rejects non-http(s) origins (e.g.
        # capacitor://localhost, used by the iOS app's WKWebView), and even
        # when an origin is allowed there, API Gateway overrides whatever
        # Lambda returns. "*" is safe since this API never uses cookies/
        # credentialed requests — auth is via custom headers (x-invite-token
        # etc.), not cookies.
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type,x-invite-token,x-setup-key,x-user-token,x-coach-user-id,stripe-signature",
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    }
    if extra:
        base.update(extra)
    return base

def revealing_code_default() -> str:
    # Keep error codes generic to avoid leaking internals.
    return "bad_request"

def ok(body: Any, status_code: int = 200, extra_headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": _headers(extra_headers),
        "body": json.dumps(body),
    }

def err(message: str, status_code: int = 400, code: str = None) -> Dict[str, Any]:
    if code is None:
        code = revealing_code_default()
    return ok({"error": {"message": message, "code": code}}, status_code=status_code)