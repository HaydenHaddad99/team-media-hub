#!/usr/bin/env python3
"""
Team Media Hub - Admin Dashboard Report
Queries all DynamoDB tables and joins data into a summary view.
Shows teams, admins, member counts, media counts, storage usage.
"""
import boto3
from datetime import datetime
from collections import defaultdict

REGION = "us-east-1"

# Production table names
TABLES = {
    "teams":        "TeamMediaHubStack-TeamsTableE80F987E-1THOJUJC7RNIZ",
    "invites":      "TeamMediaHubStack-InvitesTableE9630325-1P43ZIUHYTGNW",
    "media":        "TeamMediaHubStack-MediaTableCFC93525-8YTEVX5PQ0Z9",
    "users":        "TeamMediaHubStack-UsersTable9725E9C8-3IY64EFAG6RM",
    "team_members": "TeamMediaHubStack-TeamMembersTableCADD68CD-10GHX6G9FS2TM",
    "audit":        "TeamMediaHubStack-AuditTableB07F8EEB-UTXBXRWIM6DI",
}

ddb = boto3.client("dynamodb", region_name=REGION)


def scan_all(table_name):
    items = []
    kwargs = {"TableName": table_name}
    while True:
        resp = ddb.scan(**kwargs)
        items.extend(resp.get("Items", []))
        lek = resp.get("LastEvaluatedKey")
        if not lek:
            break
        kwargs["ExclusiveStartKey"] = lek
    return items


def val(item, key):
    """Extract a value from a DynamoDB item (handles S, N, BOOL types)."""
    v = item.get(key, {})
    if "S" in v: return v["S"]
    if "N" in v: return v["N"]
    if "BOOL" in v: return v["BOOL"]
    return None


def fmt_date(epoch):
    if not epoch:
        return "—"
    try:
        return datetime.fromtimestamp(float(epoch)).strftime("%Y-%m-%d %H:%M")
    except (ValueError, TypeError, OSError):
        return str(epoch)


def fmt_bytes(b):
    try:
        b = int(b)
    except (TypeError, ValueError):
        return "0 B"
    if b >= 1_073_741_824:
        return f"{b / 1_073_741_824:.2f} GB"
    if b >= 1_048_576:
        return f"{b / 1_048_576:.1f} MB"
    if b >= 1024:
        return f"{b / 1024:.0f} KB"
    return f"{b} B"


def main():
    print("Scanning tables...")
    teams_raw = scan_all(TABLES["teams"])
    invites_raw = scan_all(TABLES["invites"])
    media_raw = scan_all(TABLES["media"])
    users_raw = scan_all(TABLES["users"])
    members_raw = scan_all(TABLES["team_members"])

    # --- Build lookup maps ---

    # Invites by team_id
    invites_by_team = defaultdict(list)
    for inv in invites_raw:
        tid = val(inv, "team_id")
        if tid:
            invites_by_team[tid].append(inv)

    # Media counts & sizes by team_id
    media_by_team = defaultdict(lambda: {"images": 0, "videos": 0, "total_bytes": 0, "with_thumb": 0})
    for m in media_raw:
        tid = val(m, "team_id")
        ct = val(m, "content_type") or ""
        size = int(val(m, "size_bytes") or 0)
        media_by_team[tid]["total_bytes"] += size
        if ct.startswith("video/"):
            media_by_team[tid]["videos"] += 1
        else:
            media_by_team[tid]["images"] += 1
        if val(m, "thumb_key"):
            media_by_team[tid]["with_thumb"] += 1

    # Members by team_id
    members_by_team = defaultdict(list)
    for mem in members_raw:
        tid = val(mem, "team_id")
        if tid:
            members_by_team[tid].append(mem)

    # Users by user_id
    users_by_id = {}
    for u in users_raw:
        uid = val(u, "user_id")
        if uid:
            users_by_id[uid] = u

    # ============================
    # REPORT
    # ============================
    print(f"\n{'='*90}")
    print(f"  TEAM MEDIA HUB — ADMIN DASHBOARD REPORT")
    print(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*90}\n")

    print(f"  Total Teams: {len(teams_raw)}    Total Media: {len(media_raw)}    "
          f"Total Invites: {len(invites_raw)}    Total Users: {len(users_raw)}")
    print()

    for team in sorted(teams_raw, key=lambda t: float(val(t, "created_at") or 0)):
        tid = val(team, "team_id")
        tname = val(team, "team_name") or "—"
        tcode = val(team, "team_code") or "—"
        created = fmt_date(val(team, "created_at"))
        plan = val(team, "plan") or "free"
        limit_gb = val(team, "storage_limit_gb") or "?"
        used = int(val(team, "used_bytes") or 0)

        media = media_by_team.get(tid, {"images": 0, "videos": 0, "total_bytes": 0, "with_thumb": 0})
        total_media = media["images"] + media["videos"]

        # Find admin invites for this team
        team_invites = invites_by_team.get(tid, [])
        admins = [i for i in team_invites if val(i, "role") == "admin" and not val(i, "revoked_at")]
        uploaders = [i for i in team_invites if val(i, "role") == "uploader" and not val(i, "revoked_at")]
        viewers = [i for i in team_invites if val(i, "role") == "viewer" and not val(i, "revoked_at")]
        revoked = [i for i in team_invites if val(i, "revoked_at")]

        # Members
        team_members = members_by_team.get(tid, [])

        print(f"  ┌─ TEAM: {tname}")
        print(f"  │  ID: {tid}")
        print(f"  │  Code: {tcode}    Plan: {plan}    Created: {created}")
        print(f"  │  Storage: {fmt_bytes(used)} / {limit_gb} GB")
        print(f"  │")
        print(f"  │  Media: {total_media} total ({media['images']} images, {media['videos']} videos, {media['with_thumb']} with thumbnails)")
        print(f"  │  Actual S3 size: {fmt_bytes(media['total_bytes'])}")
        print(f"  │")
        print(f"  │  Invites: {len(admins)} admin, {len(uploaders)} uploader, {len(viewers)} viewer, {len(revoked)} revoked")

        for adm in admins:
            email = val(adm, "email") or val(adm, "label") or "—"
            exp = fmt_date(val(adm, "expires_at"))
            print(f"  │    👑 Admin: {email}  (expires: {exp})")

        for up in uploaders:
            email = val(up, "email") or val(up, "label") or "—"
            print(f"  │    📤 Uploader: {email}")

        for vw in viewers:
            email = val(vw, "email") or val(vw, "label") or "—"
            print(f"  │    👁  Viewer: {email}")

        if team_members:
            print(f"  │")
            print(f"  │  Members: {len(team_members)}")
            for mem in team_members:
                email = val(mem, "email") or "—"
                role = val(mem, "role") or "—"
                print(f"  │    • {email} ({role})")

        print(f"  └{'─'*60}")
        print()

    # Quick summary of users
    if users_raw:
        print(f"\n  {'─'*40}")
        print(f"  REGISTERED USERS ({len(users_raw)})")
        print(f"  {'─'*40}")
        for u in users_raw:
            email = val(u, "email") or "—"
            uid = val(u, "user_id") or "—"
            created = fmt_date(val(u, "created_at"))
            print(f"    {email}  (id: {uid[:16]}...)  joined: {created}")


if __name__ == "__main__":
    main()
