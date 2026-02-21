import base64

import stripe

from common.responses import ok, err
from common.stripe_service import parse_and_apply_webhook


def handle_billing_webhook(event):
    headers = event.get("headers") or {}
    signature = headers.get("stripe-signature") or headers.get("Stripe-Signature")
    if not signature:
        return err("Missing Stripe signature.", 400, code="validation_error")

    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        try:
            raw_body = base64.b64decode(body)
        except Exception:
            return err("Invalid base64 body.", 400, code="validation_error")
    else:
        raw_body = body.encode("utf-8")

    try:
        result = parse_and_apply_webhook(raw_body, signature)
        return ok({"received": True, "handled": result.get("handled", False)})
    except ValueError as e:
        return err(str(e), 400, code="validation_error")
    except Exception as e:
        print(f"[billing_webhook] Error: {e}")
        return err("Webhook processing failed.", 500, code="server_error")
