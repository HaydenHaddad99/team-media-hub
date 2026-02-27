"""
Test Resend email integration locally.

NOTE: This test requires a valid RESEND_API_KEY.
The key provided in the user's request may need validation in Resend dashboard.

To test with your own key:
    export RESEND_API_KEY=your_valid_key
    python3 test_resend_email.py
"""
import os
import sys

# Add backend/src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend", "src"))

# Set test environment (use env var if provided, otherwise use placeholder)
os.environ["EMAIL_PROVIDER"] = "resend"
os.environ["RESEND_API_KEY"] = os.getenv("RESEND_API_KEY", "re_9b9dgvqL_KytCcXYYteRD2X2SQ7gqhmoN")
os.environ["EMAIL_FROM"] = "noreply@verify.teammediahub.co"

from common.email_service import send_verification_code, send_coach_signin_code


def test_send_verification_code():
    """Test sending verification code email."""
    print("\n" + "="*60)
    print("TEST: Send Verification Code")
    print("="*60)
    
    # Use a safe test email or the one provided
    test_email = os.getenv("TEST_EMAIL", "hayden@thedev.us")
    
    result = send_verification_code(
        to_email=test_email,
        code="123456",
        team_name="Lincoln Lions Soccer",
        join_url="https://app.teammediahub.co/join"
    )
    
    print(f"Success: {result['success']}")
    if result['success']:
        print(f"Message ID: {result.get('message_id')}")
    else:
        print(f"Error: {result.get('error')}")
    
    return result['success']


def test_send_coach_signin_code():
    """Test sending coach signin code email."""
    print("\n" + "="*60)
    print("TEST: Send Coach Sign-In Code")
    print("="*60)
    
    test_email = os.getenv("TEST_EMAIL", "hayden@thedev.us")
    
    result = send_coach_signin_code(
        to_email=test_email,
        code="654321"
    )
    
    print(f"Success: {result['success']}")
    if result['success']:
        print(f"Message ID: {result.get('message_id')}")
    else:
        print(f"Error: {result.get('error')}")
    
    return result['success']


if __name__ == "__main__":
    print("\nTesting Resend Email Integration")
    print("="*60)
    print(f"API Key: {os.environ['RESEND_API_KEY'][:10]}...")
    print(f"From: {os.environ['EMAIL_FROM']}")
    print(f"To: {os.getenv('TEST_EMAIL', 'hayden@thedev.us')}")
    
    test1_passed = test_send_verification_code()
    test2_passed = test_send_coach_signin_code()
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Verification Code Email: {'✓ PASS' if test1_passed else '✗ FAIL'}")
    print(f"Coach Signin Code Email: {'✓ PASS' if test2_passed else '✗ FAIL'}")
    print()
    
    if test1_passed and test2_passed:
        print(f"✓ All tests passed! Check inbox at {os.getenv('TEST_EMAIL', 'hayden@thedev.us')}")
        sys.exit(0)
    else:
        print("✗ Some tests failed")
        print("\nTroubleshooting:")
        print("1. Verify RESEND_API_KEY is valid in Resend dashboard")
        print("2. Check domain 'verify.teammediahub.co' is verified")
        print("3. Ensure API key has send permissions")
        print("4. Try testing with curl:")
        print(f"   curl -X POST https://api.resend.com/emails \\")
        print(f"     -H 'Authorization: Bearer $RESEND_API_KEY' \\")
        print(f"     -H 'Content-Type: application/json' \\")
        print(f"     -d '{{\"from\":\"noreply@verify.teammediahub.co\",\"to\":[\"test@example.com\"],\"subject\":\"Test\",\"text\":\"Test\"}}'")
        sys.exit(1)
