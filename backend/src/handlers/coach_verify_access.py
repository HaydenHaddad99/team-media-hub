"""
POST /coach/verify-access
Verify coach access with setup key (one-time verification)
"""
import os
from common.responses import ok, err
from common.config import DYNAMODB, SETUP_KEY
from common.audit import write_audit


def handle_coach_verify_access(event, body):
    """
    Verify setup key and mark coach as verified.
    Headers: x-user-token
    Body: { setup_key: "..." }
    Returns: { verified: true }
    """
    user_token = event.get("headers", {}).get("x-user-token", "").strip()
    if not user_token:
        return err("User token required", status_code=401)
    
    setup_key = (body or {}).get("setup_key", "").strip()
    if not setup_key:
        return err("Setup key is required", status_code=400)
    
    # Validate setup key
    if SETUP_KEY and setup_key != SETUP_KEY:
        return err("Invalid setup key", status_code=403, code="forbidden")
    
    try:
        # Look up user by token
        tokens_table = DYNAMODB.Table(os.getenv("TABLE_USER_TOKENS", "UserTokensTable"))
        response = tokens_table.get_item(Key={"token_hash": user_token})
        token_record = response.get("Item")
        
        if not token_record:
            return err("Invalid token", status_code=401)
        
        user_id = token_record.get("user_id")
        
        # Mark coach as verified
        tokens_table.update_item(
            Key={"token_hash": user_token},
            UpdateExpression="SET coach_verified = :verified",
            ExpressionAttributeValues={":verified": True}
        )
        
        # Audit log (non-blocking)
        try:
            write_audit(
                team_id="system",
                event="coach_verified",
                invite_token=None,
                meta={"user_id": user_id}
            )
        except Exception as audit_error:
            print(f"Warning: Audit logging failed: {audit_error}")
        
        return ok({"verified": True}, 200)
    
    except Exception as e:
        print(f"Coach verify access error: {e}")
        return err("Failed to verify access", status_code=500)
