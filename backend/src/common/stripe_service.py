from typing import Dict, Optional, Tuple

import stripe

from common.config import (
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_50GB,
    STRIPE_PRICE_200GB,
    APP_BASE_URL,
    STRIPE_SUCCESS_URL,
    STRIPE_CANCEL_URL,
    TABLE_TEAMS,
    TABLE_WEBHOOK_EVENTS,
    DYNAMODB,
)
from common.db import update_item, get_item, put_item

GB_BYTES = 1024 * 1024 * 1024


def _ensure_stripe():
    if not STRIPE_SECRET_KEY:
        raise ValueError("Missing STRIPE_SECRET_KEY")
    stripe.api_key = STRIPE_SECRET_KEY


def _success_url() -> str:
    if STRIPE_SUCCESS_URL:
        return STRIPE_SUCCESS_URL
    if APP_BASE_URL:
        return f"{APP_BASE_URL}/billing/success"
    raise ValueError("Missing STRIPE_SUCCESS_URL or APP_BASE_URL")


def _cancel_url() -> str:
    if STRIPE_CANCEL_URL:
        return STRIPE_CANCEL_URL
    if APP_BASE_URL:
        return f"{APP_BASE_URL}/billing/cancel"
    raise ValueError("Missing STRIPE_CANCEL_URL or APP_BASE_URL")


def get_tier_config(tier: str) -> Tuple[str, int, str]:
    if tier == "plus":
        if not STRIPE_PRICE_50GB:
            raise ValueError("Missing STRIPE_PRICE_50GB")
        return STRIPE_PRICE_50GB, 50 * GB_BYTES, "plus"
    if tier == "pro":
        if not STRIPE_PRICE_200GB:
            raise ValueError("Missing STRIPE_PRICE_200GB")
        return STRIPE_PRICE_200GB, 200 * GB_BYTES, "pro"
    raise ValueError("Invalid tier")


def map_price_to_plan(price_id: str) -> Tuple[str, int]:
    if price_id == STRIPE_PRICE_50GB:
        return "plus", 50 * GB_BYTES
    if price_id == STRIPE_PRICE_200GB:
        return "pro", 200 * GB_BYTES
    return "free", 10 * GB_BYTES


def create_checkout_session(team: Dict, tier: str) -> Dict:
    _ensure_stripe()
    price_id, _, _ = get_tier_config(tier)

    params = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": _success_url(),
        "cancel_url": _cancel_url(),
        "metadata": {
            "team_id": team.get("team_id"),
            "tier": tier,
        },
        "subscription_data": {
            "metadata": {
                "team_id": team.get("team_id"),
                "tier": tier,
            }
        },
    }

    if team.get("stripe_customer_id"):
        params["customer"] = team.get("stripe_customer_id")

    return stripe.checkout.Session.create(**params)


def upgrade_subscription(team: Dict, new_tier: str) -> Dict:
    _ensure_stripe()

    subscription_id = team.get("stripe_subscription_id")
    if not subscription_id:
        raise ValueError("No active subscription for team")

    price_id, _, _ = get_tier_config(new_tier)

    subscription = stripe.Subscription.retrieve(
        subscription_id, expand=["items.data.price"]
    )
    items = subscription.get("items", {}).get("data", [])
    if not items:
        raise ValueError("Subscription has no items")

    item_id = items[0].get("id")
    if not item_id:
        raise ValueError("Subscription item missing id")

    return stripe.Subscription.modify(
        subscription_id,
        items=[{"id": item_id, "price": price_id}],
        proration_behavior="create_prorations",
    )


def parse_and_apply_webhook(raw_body: bytes, signature: str) -> Dict:
    _ensure_stripe()

    if not STRIPE_WEBHOOK_SECRET:
        raise ValueError("Missing STRIPE_WEBHOOK_SECRET")

    event = stripe.Webhook.construct_event(
        payload=raw_body,
        sig_header=signature,
        secret=STRIPE_WEBHOOK_SECRET,
    )

    event_id = event.get("id")
    event_type = event.get("type")
    data = event.get("data", {}).get("object", {})

    # **Idempotency Check**: Skip if we've already processed this event
    if _is_webhook_event_processed(event_id):
        return {"handled": False, "reason": "duplicate_event"}

    # Mark this event as processed BEFORE handling it
    _mark_webhook_event_processed(event_id)

    if event_type == "checkout.session.completed":
        if data.get("mode") != "subscription":
            return {"handled": False}
        subscription_id = data.get("subscription")
        if subscription_id:
            subscription = stripe.Subscription.retrieve(
                subscription_id, expand=["items.data.price"]
            )
            _apply_subscription_update(subscription)
            return {"handled": True}

    if event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        _apply_subscription_update(data)
        return {"handled": True}

    if event_type == "invoice.payment_failed":
        subscription_id = data.get("subscription")
        if subscription_id:
            subscription = stripe.Subscription.retrieve(
                subscription_id, expand=["items.data.price"]
            )
            _apply_subscription_update(subscription, status_override="past_due")
        return {"handled": True}

    if event_type == "invoice.paid":
        subscription_id = data.get("subscription")
        if subscription_id:
            subscription = stripe.Subscription.retrieve(
                subscription_id, expand=["items.data.price"]
            )
            _apply_subscription_update(subscription, status_override="active")
        return {"handled": True}

    return {"handled": False}


def _apply_subscription_update(subscription: Dict, status_override: Optional[str] = None) -> None:
    team_id = _team_id_from_subscription(subscription)
    if not team_id:
        return

    status = status_override or subscription.get("status")
    price_id = _price_id_from_subscription(subscription)
    cancel_at_period_end = subscription.get("cancel_at_period_end", False)
    current_period_end = subscription.get("current_period_end")  # Unix timestamp
    cancel_at = subscription.get("cancel_at")  # Unix timestamp when canceled

    # Default to current plan from price
    plan, limit_bytes = map_price_to_plan(price_id) if price_id else ("free", 10 * GB_BYTES)
    
    # **Handle graceful cancellation**: If cancel_at_period_end=true, subscription is still
    # active/trialing with paid storage until period ends.
    # **Handle past_due**: Keep storage for 7 days grace period before downgrading.
    
    # Revert to free plan if:
    # 1) Status is "canceled" or "incomplete_expired" (subscription ended), OR
    # 2) Status is "unpaid" (failed after grace period)
    if status in ("canceled", "incomplete_expired", "unpaid"):
        plan = "free"
        limit_bytes = 10 * GB_BYTES
    elif status in ("active", "trialing") and cancel_at_period_end:
        # Subscription scheduled to cancel at period end - keep current plan until then
        # The paid plan remains active until current_period_end
        pass
    elif status == "past_due":
        # Track when we first entered past_due for grace period enforcement
        # Keep current plan but track past_due_since for upload blocking
        pass

    limit_gb = int(limit_bytes / GB_BYTES)

    # Determine past_due_since timestamp
    from common.db import get_item
    team = get_item(TABLE_TEAMS, {"team_id": team_id}) or {}
    past_due_since = team.get("past_due_since")
    
    if status == "past_due" and not past_due_since:
        # First time entering past_due - record timestamp
        past_due_since = int(__import__('time').time())
    elif status not in ("past_due",):
        # No longer past_due - clear the timestamp
        past_due_since = None

    update_fields = {
        "plan": plan,
        "storage_limit_bytes": limit_bytes,
        "storage_limit_gb": limit_gb,
        "stripe_customer_id": subscription.get("customer"),
        "stripe_subscription_id": subscription.get("id"),
        "stripe_price_id": price_id,
        "subscription_status": status,
        "cancel_at_period_end": cancel_at_period_end,
        "current_period_end": current_period_end,
        "cancel_at": cancel_at,
        "past_due_since": past_due_since,
    }

    _update_team(team_id, update_fields)


def _price_id_from_subscription(subscription: Dict) -> Optional[str]:
    items = subscription.get("items", {}).get("data", [])
    if not items:
        return None
    price = items[0].get("price", {})
    return price.get("id")


def _team_id_from_subscription(subscription: Dict) -> Optional[str]:
    metadata = subscription.get("metadata") or {}
    team_id = metadata.get("team_id")
    if team_id:
        return team_id

    subscription_id = subscription.get("id")
    if subscription_id:
        team = _find_team_by_subscription_id(subscription_id)
        if team:
            return team.get("team_id")
    return None


def _find_team_by_subscription_id(subscription_id: str) -> Optional[Dict]:
    teams_table = DYNAMODB.Table(TABLE_TEAMS)
    from boto3.dynamodb.conditions import Attr
    resp = teams_table.scan(
        FilterExpression=Attr("stripe_subscription_id").eq(subscription_id),
        Limit=1,
    )
    items = resp.get("Items", [])
    return items[0] if items else None


def _is_webhook_event_processed(event_id: str) -> bool:
    """Check if we've already processed this webhook event (for idempotency)."""
    try:
        item = get_item(TABLE_WEBHOOK_EVENTS, {"event_id": event_id})
        return item is not None
    except Exception:
        # If table doesn't exist or query fails, allow processing (fault-tolerant)
        return False


def _mark_webhook_event_processed(event_id: str) -> None:
    """Mark a webhook event as processed (for idempotency)."""
    try:
        put_item(TABLE_WEBHOOK_EVENTS, {
            "event_id": event_id,
            "processed_at": int(__import__('time').time()),
        })
    except Exception as e:
        # Log but don't fail the webhook if we can't mark it processed
        print(f"[stripe_service] Warning: Could not mark webhook {event_id} as processed: {e}")


def create_portal_session(team: Dict) -> Dict:
    """Create a Stripe Customer Portal session for managing subscription."""
    _ensure_stripe()
    
    customer_id = team.get("stripe_customer_id")
    if not customer_id:
        raise ValueError("No Stripe customer ID found for team")
    
    return_url = STRIPE_SUCCESS_URL or f"{APP_BASE_URL}/feed"
    
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    
    return session


def _update_team(team_id: str, fields: Dict) -> None:
    expression = []
    values = {}
    remove_fields = []
    
    for key, value in fields.items():
        if value is None:
            # Use REMOVE for null values to clean up fields
            remove_fields.append(key)
        else:
            expression.append(f"{key} = :{key}")
            values[f":{key}"] = value

    if not expression and not remove_fields:
        return

    update_expr = ""
    if expression:
        update_expr += "SET " + ", ".join(expression)
    if remove_fields:
        if update_expr:
            update_expr += " "
        update_expr += "REMOVE " + ", ".join(remove_fields)

    update_item(
        TABLE_TEAMS,
        {"team_id": team_id},
        update_expr,
        values,
    )
