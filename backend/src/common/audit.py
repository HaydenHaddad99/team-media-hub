import hashlib
import time
import uuid
from typing import Dict, Optional

from .config import TABLE_AUDIT
from .db import put_item

def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def write_audit(team_id: str, action: str, invite_token: Optional[str], meta: Optional[Dict] = None, ip: Optional[str] = None, ua: Optional[str] = None):
    if not TABLE_AUDIT:
        return

    ts = int(time.time())
    event_id = str(uuid.uuid4())
    item = {
        "team_id": team_id,
        "sk": f"{ts}#{event_id}",
        "ts": ts,
        "event_id": event_id,
        "action": action,
    }

    # Privacy-first: store hashes instead of raw IP/UA/token.
    if invite_token:
        item["invite_token_hash"] = _sha256(invite_token)
    if ip:
        item["ip_hash"] = _sha256(ip)
    if ua:
        item["ua_hash"] = _sha256(ua)
    if meta:
        item["meta"] = meta

    put_item(TABLE_AUDIT, item)
