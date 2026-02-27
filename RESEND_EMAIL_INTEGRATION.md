# Resend Email Integration

## Overview
Team Media Hub now uses **Resend** for transactional email delivery (OTP codes, team invites). SES support remains for backward compatibility.

## Configuration

### Environment Variables
- `EMAIL_PROVIDER`: `"resend"` (production) or `"ses"` (legacy)
- `RESEND_API_KEY`: Resend API key (from Resend dashboard)
- `EMAIL_FROM`: `"noreply@verify.teammediahub.co"` (verified sender)

### CDK Parameters
- `EmailProvider`: CloudFormation parameter (default: "resend")
- `EmailFrom`: CloudFormation parameter (default: "noreply@verify.teammediahub.co")

### GitHub Secrets
Add to repository secrets:
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
```

## Architecture

### Email Service Abstraction (`common/email_service.py`)
- **`send_verification_code()`**: Parent team join OTP
- **`send_coach_signin_code()`**: Coach authentication OTP
- **`_send_email()`**: Router (Resend or SES based on `EMAIL_PROVIDER`)
- **`_send_via_resend()`**: Resend API integration
- **`_send_via_ses()`**: AWS SES integration (legacy)

### Updated Files
- `backend/src/common/email_service.py` - New abstraction layer
- `backend/src/handlers/auth_coach_signin.py` - Uses `send_coach_signin_code()`
- `backend/src/common/user_auth.py` - Uses `send_verification_code()`
- `infra/stacks/team_media_hub_stack.py` - New CDK parameters
- `.github/workflows/deploy.yml` - Pass `RESEND_API_KEY` from secrets

## Resend API Integration

### Endpoint
```
POST https://api.resend.com/emails
```

### Headers
```
Authorization: Bearer ${RESEND_API_KEY}
Content-Type: application/json
```

### Request Body
```json
{
  "from": "noreply@verify.teammediahub.co",
  "to": ["user@example.com"],
  "subject": "Your Team Media Hub code",
  "text": "Your verification code is: 123456...",
  "html": "<html>...</html>"
}
```

### Response (Success)
```json
{
  "id": "message-id-from-resend"
}
```

### Error Handling
- **Missing API key**: Logs error, returns `{"success": false, "error": "..."}`
- **HTTP errors**: Logs full response body, returns error code
- **Network errors**: Logs exception, returns error message

## Testing

### Local Test
```bash
cd /Users/haydensmac/team-media-hub
export EMAIL_PROVIDER=resend
export RESEND_API_KEY=re_xxxxx
export EMAIL_FROM=noreply@verify.teammediahub.co
python3 test_resend_email.py
```

### Domain Verification
Verify `verify.teammediahub.co` in Resend dashboard:
1. Go to Resend → Domains
2. Add domain: `verify.teammediahub.co`
3. Add DNS records (SPF, DKIM, DMARC)
4. Wait for verification

### Test API Key
Verify the key works with a simple test:
```bash
curl -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer re_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "noreply@verify.teammediahub.co",
    "to": ["your-test-email@example.com"],
    "subject": "Test",
    "text": "Test email"
  }'
```

## Deployment

1. **Add GitHub Secret**:
   - Go to GitHub repo → Settings → Secrets
   - Add `RESEND_API_KEY`

2. **Deploy Infrastructure**:
   ```bash
   cd infra
   cdk deploy \
     --parameters EmailProvider=resend \
     --parameters EmailFrom=noreply@verify.teammediahub.co
   ```

3. **Verify Email Sending**:
   - Sign up as new parent → should receive OTP via Resend
   - Coach sign-in → should receive code via Resend
   - Check Resend dashboard for delivery logs

## Error Code Reference

### Resend API Errors
- `403 1010`: Cloudflare access denied (check API key, verify domain)
- `401`: Invalid API key
- `422`: Validation error (check email format, from address)
- `429`: Rate limit exceeded

### SES Errors (Legacy)
- `MessageRejected`: Email not verified in SES
- `ConfigurationSetDoesNotExist`: Invalid configuration set

## Fallback Behavior
- **Email send fails**: Error logged, operation continues (doesn't fail request)
- **Provider unrecognized**: Logs error, operation continues
- **Missing configuration**: Logs code to console (dev mode)

## Benefits Over SES
- ✅ **No sandbox restrictions**: Send to any email immediately
- ✅ **No domain verification delays**: Pre-verified domain
- ✅ **Better deliverability**: Resend handles DKIM/SPF automatically
- ✅ **Simpler API**: No AWS SDK dependency for email
- ✅ **Better dashboard**: Real-time delivery tracking

## Migration Path
To switch back to SES (if needed):
```bash
cdk deploy --parameters EmailProvider=ses
```

No code changes required - abstraction layer handles routing.
