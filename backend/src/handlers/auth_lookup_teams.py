"""
GET /auth/lookup-teams?email=...

Returns teams the email address is already a member of, so returning
users don't need to re-enter the team code on sign-in.
"""
from urllib.parse import parse_qs
from common.responses import ok, err
from common.rate_limiter import check_ip_rate_limit
from common.db import query_items, get_item
from common.config import TABLE_USERS, TABLE_TEAM_MEMBERS, TABLE_TEAMS
from common.user_auth import get_user_teams


def handle_auth_lookup_teams(event, body=None):
    qs = parse_qs(event.get("rawQueryString") or "")
    email = (qs.get("email", [""])[0]).strip().lower()

    if not email or "@" not in email:
        return err("Invalid email address", status_code=400)

    ip_allowed, ip_error = check_ip_rate_limit(event)
    if not ip_allowed:
        return err(ip_error, status_code=429, code="rate_limited")

    # Look up user by email
    users, _ = query_items(
        TABLE_USERS,
        key_condition="email = :email",
        expression_values={":email": email},
        index_name="email-index",
        limit=1,
    )

    if not users:
        return ok({"teams": []})

    user_id = users[0]["user_id"]
    memberships = get_user_teams(user_id)

    teams = []
    for membership in memberships:
        team_id = membership.get("team_id")
        if not team_id:
            continue
        team = get_item(TABLE_TEAMS, {"team_id": team_id})
        if team and team.get("team_code"):
            teams.append({
                "team_id": team_id,
                "team_name": team.get("team_name", ""),
                "team_code": team["team_code"],
            })

    return ok({"teams": teams})
