"""
Email service abstraction layer.
Supports AWS SES and Resend providers via EMAIL_PROVIDER env var.
"""
import os
import json
from typing import Optional

# Import config values
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "ses").lower()
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", os.getenv("SES_FROM_EMAIL", ""))
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


def send_verification_code(
    to_email: str,
    code: str,
    team_name: str = "",
    join_url: str = ""
) -> dict:
    """
    Send verification code email for team join flow.
    
    Args:
        to_email: Recipient email address
        code: 6-digit verification code
        team_name: Optional team name for context
        join_url: Optional join URL
    
    Returns:
        dict with 'success' (bool), 'message_id' (str), 'error' (str)
    """
    subject_team = f" {team_name}" if team_name else ""
    subject = f"Your Team Media Hub code{subject_team}".strip()
    
    text_lines = [
        f"Your verification code is: {code}",
        "",
        "This code expires in 10 minutes.",
    ]
    if join_url:
        text_lines.extend(["", f"Join here: {join_url}"])
    
    text_body = "\n".join(text_lines)
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #00aeff;">Your Verification Code</h2>
        {f'<p>Join <strong>{team_name}</strong></p>' if team_name else ''}
        <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #00aeff; letter-spacing: 4px; margin: 0;">{code}</h1>
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
        {f'<p><a href="{join_url}" style="color: #00aeff;">Continue to Team Media Hub</a></p>' if join_url else ''}
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
            If you didn't request this, you can safely ignore this email.
        </p>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, text_body, html_body)


def send_coach_signin_code(to_email: str, code: str) -> dict:
    """
    Send coach sign-in code email.
    
    Args:
        to_email: Coach email address
        code: 6-digit verification code
    
    Returns:
        dict with 'success' (bool), 'message_id' (str), 'error' (str)
    """
    subject = "Your Team Media Hub Sign-In Code"
    
    text_body = f"""
Your sign-in code: {code}

This code expires in 10 minutes.

If you didn't request this, you can safely ignore this email.
    """.strip()
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #00aeff;">Sign In to Team Media Hub</h2>
        <p>Your 6-digit code:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #00aeff; letter-spacing: 4px; margin: 0;">{code}</h1>
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
            If you didn't request this, you can safely ignore this email.
        </p>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, text_body, html_body)


def _send_email(to_email: str, subject: str, text_body: str, html_body: str) -> dict:
    """
    Internal email sender - routes to provider based on EMAIL_PROVIDER.
    
    Returns:
        dict with 'success' (bool), 'message_id' (str), 'error' (str)
    """
    if EMAIL_PROVIDER == "resend":
        return _send_via_resend(to_email, subject, text_body, html_body)
    elif EMAIL_PROVIDER == "ses":
        return _send_via_ses(to_email, subject, text_body, html_body)
    else:
        print(f"[EMAIL] Unknown provider '{EMAIL_PROVIDER}'. Email not sent to {to_email}.")
        return {"success": False, "error": f"Unknown email provider: {EMAIL_PROVIDER}"}


def _send_via_resend(to_email: str, subject: str, text_body: str, html_body: str) -> dict:
    """
    Send email via Resend API.
    
    API docs: https://resend.com/docs/api-reference/emails/send-email
    """
    if not RESEND_API_KEY:
        print(f"[EMAIL] RESEND_API_KEY not configured. Email to {to_email}: {subject}")
        return {"success": False, "error": "RESEND_API_KEY not configured"}
    
    if not EMAIL_FROM:
        print(f"[EMAIL] EMAIL_FROM not configured. Email to {to_email}: {subject}")
        return {"success": False, "error": "EMAIL_FROM not configured"}
    
    try:
        import requests
        
        payload = {
            "from": EMAIL_FROM,
            "to": [to_email],
            "subject": subject,
            "text": text_body,
        }
        
        response = requests.post(
            "https://api.resend.com/emails",
            json=payload,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=10
        )
        
        if response.status_code == 200:
            response_data = response.json()
            message_id = response_data.get("id", "")
            print(f"[EMAIL/RESEND] ✓ Sent to {to_email} (ID: {message_id})")
            return {"success": True, "message_id": message_id}
        else:
            error_text = response.text
            print(f"[EMAIL/RESEND] ✗ Failed to send to {to_email}: HTTP {response.status_code}")
            print(f"[EMAIL/RESEND] Response: {error_text}")
            return {"success": False, "error": f"Resend API error: {response.status_code}"}
    
    except Exception as e:
        print(f"[EMAIL/RESEND] ✗ Failed to send to {to_email}: {e}")
        return {"success": False, "error": str(e)}


def _send_via_ses(to_email: str, subject: str, text_body: str, html_body: str) -> dict:
    """
    Send email via AWS SES (legacy).
    """
    if not EMAIL_FROM:
        print(f"[EMAIL] EMAIL_FROM not configured. Email to {to_email}: {subject}")
        return {"success": False, "error": "EMAIL_FROM not configured"}
    
    try:
        import boto3
        
        ses = boto3.client("ses", region_name=AWS_REGION)
        
        response = ses.send_email(
            Source=EMAIL_FROM,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject},
                "Body": {
                    "Text": {"Data": text_body},
                    "Html": {"Data": html_body},
                },
            },
        )
        
        message_id = response.get("MessageId", "")
        print(f"[EMAIL/SES] ✓ Sent to {to_email} (ID: {message_id})")
        return {"success": True, "message_id": message_id}
    
    except Exception as e:
        print(f"[EMAIL/SES] ✗ Failed to send to {to_email}: {e}")
        return {"success": False, "error": str(e)}
