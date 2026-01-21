
from common.responses import ok
from common.auth import require_invite

def handle_me(event):
    invite, auth_err = require_invite(event)
    if auth_err:
        return auth_err

    return ok({
        "team_id": invite["team_id"],
        "role": invite["role"],
    })
