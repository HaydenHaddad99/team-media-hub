from common.responses import ok

def handle_health(event):
    return ok({"status": "ok"})