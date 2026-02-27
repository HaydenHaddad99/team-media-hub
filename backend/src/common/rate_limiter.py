"""
Rate limiting utility for authentication endpoints.

Tracks attempts by IP and email using DynamoDB with TTL auto-cleanup.
"""
import os
import time
import hashlib
from common.config import DYNAMODB

# Rate limit configuration
IP_LIMIT_COUNT = 5          # Max attempts per IP
IP_LIMIT_WINDOW = 600       # 10 minutes in seconds

EMAIL_LIMIT_COUNT = 3       # Max code requests per email
EMAIL_LIMIT_WINDOW = 600    # 10 minutes in seconds


def get_client_ip(event: dict) -> str:
    """
    Extract client IP from Lambda event.
    Handles both direct requests and CloudFront/API Gateway proxying.
    """
    # Try CloudFront header first (most reliable)
    headers = event.get("headers", {})
    
    if "cloudfront-viewer-address" in headers:
        return headers["cloudfront-viewer-address"]
    
    # Try X-Forwarded-For (API Gateway, proxies)
    if "x-forwarded-for" in headers:
        return headers["x-forwarded-for"].split(",")[0].strip()
    
    # Direct connection (rare in Lambda)
    if "sourceIp" in event.get("requestContext", {}):
        return event["requestContext"]["sourceIp"]
    
    # Fallback
    return "unknown"


def check_ip_rate_limit(event: dict) -> tuple[bool, str]:
    """
    Check if IP has exceeded rate limit.
    
    Returns: (allowed: bool, error_message: str)
        (True, "") if allowed
        (False, "message") if rate limited
    """
    ip = get_client_ip(event)
    if ip == "unknown":
        # Don't block unknown IPs, but log it
        print(f"[RATE_LIMIT] Unknown IP (likely local test)")
        return True, ""
    
    table = DYNAMODB.Table(os.getenv("TABLE_AUTH_CODES", "AuthCodesTable"))
    
    # Key: "ip_limit#{ip}"
    key = {"code_hash": f"ip_limit#{ip}", "email": ""}
    window_start = int(time.time()) - IP_LIMIT_WINDOW
    
    try:
        # Get current record
        response = table.get_item(Key=key)
        item = response.get("Item")
        
        if item:
            last_attempt = item.get("last_attempt", 0)
            attempt_count = item.get("attempt_count", 0)
            
            # If within window, check count
            if last_attempt > window_start:
                if attempt_count >= IP_LIMIT_COUNT:
                    return False, f"Too many sign-in attempts. Try again in {IP_LIMIT_WINDOW // 60} minutes."
                
                # Increment counter
                table.update_item(
                    Key=key,
                    UpdateExpression="SET attempt_count = :count, last_attempt = :now, expires_at = :exp",
                    ExpressionAttributeValues={
                        ":count": attempt_count + 1,
                        ":now": int(time.time()),
                        ":exp": int(time.time()) + IP_LIMIT_WINDOW + 60,
                    }
                )
                return True, ""
            else:
                # Window expired, reset counter
                table.update_item(
                    Key=key,
                    UpdateExpression="SET attempt_count = :count, last_attempt = :now, expires_at = :exp",
                    ExpressionAttributeValues={
                        ":count": 1,
                        ":now": int(time.time()),
                        ":exp": int(time.time()) + IP_LIMIT_WINDOW + 60,
                    }
                )
                return True, ""
        else:
            # First attempt from this IP
            table.put_item(Item={
                "code_hash": key["code_hash"],
                "email": key["email"],
                "attempt_count": 1,
                "last_attempt": int(time.time()),
                "expires_at": int(time.time()) + IP_LIMIT_WINDOW + 60,
            })
            return True, ""
    
    except Exception as e:
        # Fail open: log error but allow request
        print(f"[RATE_LIMIT] IP check error: {e}")
        return True, ""


def check_email_rate_limit(email: str) -> tuple[bool, str]:
    """
    Check if email has exceeded code request limit.
    
    Returns: (allowed: bool, error_message: str)
        (True, "") if allowed
        (False, "message") if rate limited
    """
    email = email.lower().strip()
    table = DYNAMODB.Table(os.getenv("TABLE_AUTH_CODES", "AuthCodesTable"))
    
    # Key: "email_limit#{email}"
    key = {"code_hash": f"email_limit#{email}", "email": email}
    window_start = int(time.time()) - EMAIL_LIMIT_WINDOW
    
    try:
        # Get current record
        response = table.get_item(Key=key)
        item = response.get("Item")
        
        if item:
            last_request = item.get("last_request", 0)
            request_count = item.get("request_count", 0)
            
            # If within window, check count
            if last_request > window_start:
                if request_count >= EMAIL_LIMIT_COUNT:
                    return False, f"Too many verification codes requested. Try again in {EMAIL_LIMIT_WINDOW // 60} minutes."
                
                # Increment counter
                table.update_item(
                    Key=key,
                    UpdateExpression="SET request_count = :count, last_request = :now, expires_at = :exp",
                    ExpressionAttributeValues={
                        ":count": request_count + 1,
                        ":now": int(time.time()),
                        ":exp": int(time.time()) + EMAIL_LIMIT_WINDOW + 60,
                    }
                )
                return True, ""
            else:
                # Window expired, reset counter
                table.update_item(
                    Key=key,
                    UpdateExpression="SET request_count = :count, last_request = :now, expires_at = :exp",
                    ExpressionAttributeValues={
                        ":count": 1,
                        ":now": int(time.time()),
                        ":exp": int(time.time()) + EMAIL_LIMIT_WINDOW + 60,
                    }
                )
                return True, ""
        else:
            # First request from this email
            table.put_item(Item={
                "code_hash": key["code_hash"],
                "email": email,
                "request_count": 1,
                "last_request": int(time.time()),
                "expires_at": int(time.time()) + EMAIL_LIMIT_WINDOW + 60,
            })
            return True, ""
    
    except Exception as e:
        # Fail open: log error but allow request
        print(f"[RATE_LIMIT] Email check error: {e}")
        return True, ""
