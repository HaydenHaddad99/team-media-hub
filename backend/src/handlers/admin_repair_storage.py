"""
Admin endpoint to repair/recompute storage used_bytes for a team.
Called via POST /admin/repair-storage?team_id=xxx with setup key.
"""

from common.config import TABLE_TEAMS, TABLE_MEDIA, SETUP_KEY
from common.responses import ok, err
from common.db import get_item, update_item, query_media_items

def handle_admin_repair_storage(event):
    """Recompute used_bytes from actual media items"""
    
    # Check setup key
    headers = (event or {}).get("headers") or {}
    provided_key = headers.get("x-setup-key") or headers.get("X-Setup-Key") or ""
    if not SETUP_KEY or provided_key != SETUP_KEY:
        return err("Invalid or missing setup key.", 403, code="forbidden")
    
    # Get team_id from query string
    qs = event.get("rawQueryString") or ""
    team_id = None
    if "team_id=" in qs:
        team_id = qs.split("team_id=")[1].split("&")[0]
    
    if not team_id:
        return err("team_id query parameter is required.", 400, code="validation_error")
    
    # Verify team exists
    team = get_item(TABLE_TEAMS, {"team_id": team_id})
    if not team:
        return err(f"Team {team_id} not found.", 404, code="not_found")
    
    # Query all media items for this team and sum their sizes
    total_bytes = 0
    item_count = 0
    cursor = None
    
    while True:
        items, cursor = query_media_items(TABLE_MEDIA, team_id=team_id, limit=100, cursor=cursor)
        
        for item in items:
            size_bytes = item.get("size_bytes", 0)
            if size_bytes > 0:
                total_bytes += size_bytes
                item_count += 1
        
        # Stop if no more items
        if not cursor:
            break
    
    # Update team's used_bytes
    try:
        update_item(
            TABLE_TEAMS,
            {"team_id": team_id},
            "SET used_bytes = :total",
            {":total": total_bytes}
        )
        print(f"[REPAIR] Updated team {team_id}: used_bytes={total_bytes} (from {item_count} items)")
    except Exception as e:
        return err(f"Failed to update used_bytes: {e}", 500, code="server_error")
    
    return ok({
        "ok": True,
        "team_id": team_id,
        "item_count": item_count,
        "total_bytes": total_bytes,
        "total_gb": total_bytes / (1024 ** 3),
    })
