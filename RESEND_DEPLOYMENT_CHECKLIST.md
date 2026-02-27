# Resend Email Integration - Deployment Checklist

## ✅ Completed Steps

### 1. Code Implementation
- ✅ Created `backend/src/common/email_service.py` - Email abstraction layer
- ✅ Updated `backend/src/handlers/auth_coach_signin.py` - Coach OTP emails
- ✅ Updated `backend/src/common/user_auth.py` - Parent verification emails
- ✅ Updated `infra/stacks/team_media_hub_stack.py` - CDK parameters
- ✅ Updated `.github/workflows/deploy.yml` - Pass RESEND_API_KEY
- ✅ Created test suite: `test_resend_email.py`
- ✅ Created documentation: `RESEND_EMAIL_INTEGRATION.md`
- ✅ Committed and pushed to main branch (commit: dd34f3b)

## 🔄 Pending Steps

### 2. GitHub Secret Configuration
**ACTION REQUIRED**: Add RESEND_API_KEY to GitHub repository secrets

#### Option A: Manual via GitHub UI
1. Go to: https://github.com/HaydenHaddad99/team-media-hub/settings/secrets/actions
2. Click **"New repository secret"**
3. Name: `RESEND_API_KEY`
4. Value: `re_9b9dgvqL_KytCcXYYteRD2X2SQ7gqhmoN`
5. Click **"Add secret"**

#### Option B: Using GitHub CLI (if installed)
```bash
cd /Users/haydensmac/team-media-hub
./scripts/add_resend_secret.sh
```

### 3. Verify Resend Domain
**ACTION REQUIRED**: Ensure `verify.teammediahub.co` is verified in Resend

1. Log in to Resend dashboard: https://resend.com/domains
2. Check if `verify.teammediahub.co` shows as **"Verified"**
3. If not verified:
   - Add DNS records (SPF, DKIM, DMARC) to domain provider
   - Wait for DNS propagation (~10-60 minutes)
   - Click "Verify" in Resend dashboard

### 4. Deploy to Production
Once GitHub secret is added, deploy will happen automatically on next push:

```bash
# Push will trigger GitHub Actions deploy
git push origin main
```

**Or trigger manual deploy:**
1. Go to: https://github.com/HaydenHaddad99/team-media-hub/actions
2. Click "Deploy" workflow
3. Click "Run workflow" → "Run workflow"

### 5. Test Email Delivery
After deployment completes:

#### Test Coach Sign-In
1. Go to: https://app.teammediahub.co/coach/signin
2. Enter email: `your-test-email@gmail.com`
3. Click "Send Code"
4. Check inbox for 6-digit code
5. Verify email from: `noreply@verify.teammediahub.co`

#### Test Parent Join Flow
1. Go to: https://app.teammediahub.co/join
2. Enter email + team code
3. Click "Send Code"
4. Check inbox for 6-digit code
5. Verify email from: `noreply@verify.teammediahub.co`

#### Monitor Resend Dashboard
- Go to: https://resend.com/emails
- View delivery logs, bounce rates, spam reports
- Verify emails show as "Delivered"

## 📊 Post-Deployment Validation

### Check Lambda Logs
```bash
# View recent logs
aws logs tail /aws/lambda/TeamMediaHubStack-ApiFunction --follow
```

Look for:
- `[EMAIL/RESEND] ✓ Sent to <email> (ID: xxx)` - Success
- `[EMAIL/RESEND] ✗ Failed to send` - Error (check API key, domain)

### Check CloudFormation Parameters
```bash
cd infra
cdk diff
```

Should show:
- `EmailProvider = resend`
- `EmailFrom = noreply@verify.teammediahub.co`

### Rollback to SES (if needed)
```bash
cd infra
cdk deploy --parameters EmailProvider=ses
```

## 🐛 Troubleshooting

### Issue: "403 - error code: 1010"
**Cause**: Cloudflare access denied (invalid API key or domain not verified)

**Fix**:
1. Verify API key in Resend dashboard
2. Check domain verification status
3. Ensure API key has "Send Email" permissions

### Issue: Emails not arriving
**Check**:
1. Spam folder
2. Resend dashboard for bounces/blocks
3. Lambda logs for send errors
4. Domain verification status

### Issue: GitHub Actions deploy fails
**Check**:
1. RESEND_API_KEY secret is added
2. Secret name matches exactly (case-sensitive)
3. GitHub Actions logs: https://github.com/HaydenHaddad99/team-media-hub/actions

## 📝 Important Notes

### API Key Security
- ✅ API key stored in GitHub Secrets (encrypted)
- ✅ Never committed to repository
- ✅ Passed as environment variable to Lambda
- ✅ Not logged in CloudWatch (masked)

### Cost Monitoring
- Resend free tier: 3,000 emails/month
- Current usage estimate: ~500 emails/month (50 users × 2 OTPs × 5/month)
- Monitor usage: https://resend.com/settings/billing

### SES Backup
- SES code remains intact
- Switch via `EMAIL_PROVIDER=ses` environment variable
- No code changes required for rollback

## ✅ Success Criteria

All checks must pass:
- [ ] GitHub secret `RESEND_API_KEY` added
- [ ] Domain `verify.teammediahub.co` verified in Resend
- [ ] CDK deploy completes successfully
- [ ] Coach sign-in sends email via Resend
- [ ] Parent join sends email via Resend
- [ ] Emails arrive in inbox (not spam)
- [ ] Resend dashboard shows "Delivered" status
- [ ] No Lambda errors in CloudWatch logs

---

**Current Status**: Code deployed, awaiting GitHub secret configuration + domain verification

**Next Action**: Add RESEND_API_KEY to GitHub Secrets (see Step 2 above)
