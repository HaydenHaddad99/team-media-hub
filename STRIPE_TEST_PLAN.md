# Stripe Billing Integration - Test Plan

## Overview
This test plan covers the production-ready Stripe subscription billing system with hardened lifecycle handling, webhook idempotency, Customer Portal, and enhanced UI.

---

## Prerequisites

1. **Stripe Test Mode Credentials**:
   - Test Secret Key (`sk_test_...`)
   - Test Webhook Secret (`whsec_...`)
   - Test Price IDs for Plus (50GB) and Pro (200GB)

2. **GitHub Secrets Configured**:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_50GB=price_...
   STRIPE_PRICE_200GB=price_...
   APP_BASE_URL=https://app.teammediahub.co
   STRIPE_SUCCESS_URL=https://app.teammediahub.co/feed
   STRIPE_CANCEL_URL=https://app.teammediahub.co/feed
   ```

3. **Stripe Dashboard Setup**:
   - Webhook endpoint configured: `https://app.teammediahub.co/billing/webhook`
   - Events selected:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
     - `invoice.payment_succeeded`

4. **Test Cards**:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - 3D Secure: `4000 0025 0000 3155`

---

## Test Scenarios

### 1. Initial Subscription (Free → Plus)

**Steps**:
1. Create a new team (defaults to Free plan, 10GB)
2. Click "Upgrade" button in Feed
3. Select "Upgrade to Plus (50GB)" in modal
4. Complete Stripe Checkout with test card `4242...`
5. Return to app after payment

**Expected Results**:
- ✅ Redirected to Stripe Checkout
- ✅ After payment, webhook fires `checkout.session.completed`
- ✅ Team record updated:
  ```
  plan: "plus"
  storage_limit_bytes: 53687091200  # 50GB
  subscription_status: "active"
  cancel_at_period_end: false
  current_period_end: <timestamp>
  ```
- ✅ UI shows:
  - Badge: "Active"
  - Plan: "Plus · Up to 50GB storage"
  - Renewal date: "Renews MM/DD/YYYY"
  - Button: "Manage billing"

**Verify in Stripe Dashboard**:
- Customer created
- Subscription active
- Metadata includes `team_id`

---

### 2. Proration Upgrade (Plus → Pro)

**Steps**:
1. From Plus plan, click "Manage billing"
2. In Stripe Customer Portal, click "Update subscription"
3. Change to Pro plan (200GB)
4. Confirm proration charge

**Expected Results**:
- ✅ Webhook fires `customer.subscription.updated`
- ✅ Team record updated:
  ```
  plan: "pro"
  storage_limit_bytes: 214748364800  # 200GB
  subscription_status: "active"
  ```
- ✅ UI reflects 200GB storage immediately
- ✅ Prorated charge appears in Stripe dashboard

**Alternative Path (Direct Upgrade)**:
- Can also use the upgrade flow from modal if still on Plus and selecting Pro

---

### 3. Cancel at Period End (Graceful Cancellation)

**Steps**:
1. From Pro plan, click "Manage billing"
2. In Customer Portal, click "Cancel subscription"
3. Choose "Cancel at end of billing period"
4. Confirm cancellation

**Expected Results**:
- ✅ Webhook fires `customer.subscription.updated`
- ✅ Team record updated:
  ```
  plan: "pro"  # Unchanged
  storage_limit_bytes: 214748364800  # Unchanged
  subscription_status: "active"  # Still active
  cancel_at_period_end: true
  current_period_end: <timestamp>
  ```
- ✅ UI shows:
  - Badge: "Cancels on MM/DD/YYYY" (orange)
  - Warning: "Your subscription will end on MM/DD/YYYY. You'll be downgraded to Free (10GB)."
  - Storage limit remains 200GB
  - Uploads still work
- ✅ After period end, webhook fires `customer.subscription.deleted`
- ✅ Team reverts to:
  ```
  plan: "free"
  storage_limit_bytes: 10737418240  # 10GB
  subscription_status: "canceled"
  ```

**Critical Check**:
- ❌ User should NOT lose storage immediately after canceling
- ✅ User retains access until `current_period_end`

---

### 4. Immediate Cancellation

**Steps**:
1. From Plus/Pro plan, click "Manage billing"
2. In Customer Portal, cancel and choose "Cancel immediately"
3. Confirm

**Expected Results**:
- ✅ Webhook fires `customer.subscription.deleted`
- ✅ Team immediately reverts to Free
- ✅ UI shows "Canceled" or "Free Plan" badge
- ✅ Storage limit drops to 10GB
- ✅ If over limit, uploads blocked with `STORAGE_LIMIT_EXCEEDED` error

---

### 5. Failed Payment (past_due with 7-day grace)

**Steps**:
1. Active Pro subscription
2. In Stripe Dashboard, simulate failed payment:
   - Go to subscription
   - Click "..." → "Update payment method"
   - Use declining card `4000 0000 0000 0002`
   - Trigger invoice payment
3. Wait for webhook

**Expected Results**:
- ✅ Webhook fires `invoice.payment_failed`
- ✅ Team record updated:
  ```
  subscription_status: "past_due"
  past_due_since: <timestamp>
  plan: "pro"  # Unchanged
  storage_limit_bytes: 214748364800  # Unchanged
  ```
- ✅ UI shows:
  - Badge: "Past due" (red)
  - Warning: "Payment failed. Uploads will be blocked in 7 days if not resolved."
  - Storage limit remains 200GB
  - Uploads still work (for first 7 days)

**Day 8 Test** (simulate by manually setting `past_due_since` to 8 days ago):
- ✅ Uploads blocked with error:
  ```
  403 PAYMENT_PAST_DUE
  "Uploads blocked. Your subscription payment is past due. Please update your payment method to continue uploading."
  ```
- ✅ Downloads still work (read-only mode)

**Payment Resolution**:
1. Update payment method in Customer Portal
2. Retry payment succeeds
3. Webhook fires `invoice.paid`
4. Team record updated:
  ```
  subscription_status: "active"
  past_due_since: null
  ```
- ✅ UI returns to "Active" badge
- ✅ Uploads re-enabled

---

### 6. Webhook Idempotency

**Steps**:
1. Trigger any webhook event (e.g., subscription update)
2. In Stripe Dashboard, manually replay the same webhook event
3. Check backend logs and DynamoDB

**Expected Results**:
- ✅ First webhook processes normally
- ✅ Event ID stored in `WebhookEventsTable`
- ✅ Second webhook (duplicate) returns:
  ```json
  {"handled": false, "reason": "duplicate_event"}
  ```
- ✅ Team record NOT double-updated
- ✅ Backend logs show: `[webhook] Duplicate event ignored: evt_...`

**Check DynamoDB**:
- `WebhookEventsTable` has entry:
  ```
  event_id: "evt_..."
  processed_at: <timestamp>
  ```
- TTL automatically expires after 7 days

---

### 7. Customer Portal Access

**Steps**:
1. Logged in as coach/admin
2. On Plus/Pro plan
3. Click "Manage billing" button

**Expected Results**:
- ✅ Redirected to Stripe Customer Portal
- ✅ Portal shows:
  - Current plan details
  - Payment method
  - Billing history (invoices)
  - Option to update card
  - Option to cancel subscription
- ✅ After portal actions, redirect to `STRIPE_SUCCESS_URL` (app feed)
- ✅ Changes reflected in app within 3-7 seconds (webhook latency)

**Error Cases**:
- Free plan team (no `stripe_customer_id`):
  - ✅ Button shows "Upgrade" instead of "Manage billing"
  - ✅ Opens upgrade modal, not portal
- Non-admin/coach user:
  - ✅ Button not visible (only admins/coaches can manage billing)

---

### 8. Renewal Date Display

**Steps**:
1. Subscribe to Plus or Pro
2. Check UI after webhook completes

**Expected Results**:
- ✅ Active subscription shows: "Renews MM/DD/YYYY"
- ✅ Canceling subscription changes to: "Cancels on MM/DD/YYYY"
- ✅ After cancellation completes: renewal date disappears (shows "Free Plan")

---

### 9. Edge Cases

#### 9a. Subscription Deleted Without Checkout
**Scenario**: Subscription deleted directly in Stripe Dashboard
- ✅ Webhook fires `customer.subscription.deleted`
- ✅ Team reverts to Free
- ✅ UI updates correctly

#### 9b. Multiple Webhooks Out of Order
**Scenario**: Stripe sends webhooks in wrong order (network retry)
- ✅ Each webhook processed idempotently
- ✅ Final state matches latest subscription status
- ✅ No race conditions cause inconsistent state

#### 9c. Webhook Signature Validation
**Scenario**: Invalid webhook signature (tampered request)
- ✅ Returns `400 Missing Stripe signature` or `400 Invalid signature`
- ✅ Team record NOT updated
- ✅ Logged as security event

#### 9d. Free Team Tries Portal
**Scenario**: User manually calls `/billing/portal` with free team
- ✅ Returns `400 No Stripe customer ID found for team`
- ✅ Frontend gracefully handles error

---

## Regression Tests

### Storage Enforcement
1. Upload when under limit → ✅ Success
2. Upload when over limit → ✅ `403 STORAGE_LIMIT_EXCEEDED`
3. Downgrade from Pro to Free with 50GB used → ✅ Uploads blocked, downloads work

### Auth & Permissions
1. Viewer tries to upgrade → ✅ `403 forbidden` (only uploaders/admins)
2. Coach without team access tries portal → ✅ `403 Not a member of this team`
3. Invite token vs User token auth → ✅ Both work for `/me` and team access

### UI State Management
1. Hard refresh after subscription change → ✅ UI reflects latest state
2. Multiple tabs open → ✅ All tabs update on refresh
3. Storage bar color changes at 80% → ✅ Orange warning color

---

## Monitoring & Logs

**Backend Logs to Check**:
- `[stripe_service] Webhook event processed: evt_...`
- `[stripe_service] Warning: Could not mark webhook evt_... as processed` (if table error)
- `[billing_portal] Portal session created for team: team_...`
- `[media_presign_upload] Uploads blocked - payment past due (7+ days)`

**DynamoDB Tables**:
- `TeamsTable`: Check `plan`, `storage_limit_bytes`, `subscription_status`, `cancel_at_period_end`, `current_period_end`, `past_due_since`
- `WebhookEventsTable`: Verify event IDs stored with TTL

**Stripe Dashboard**:
- Customers → Metadata includes `team_id`
- Subscriptions → Metadata includes `team_id`, `tier`
- Webhooks → All events `200 OK` (no retries)

---

## Known Issues / Limitations

1. **Webhook Latency**: UI may take 3-10 seconds to reflect changes after portal actions
   - **Workaround**: Frontend polls `/me` after 3s and 7s

2. **Downgrade with Excess Storage**: If user has 150GB used and downgrades to Plus (50GB):
   - Storage bar shows over 100%
   - Uploads blocked
   - Downloads still work
   - **Future**: Add "archive old media" flow

3. **No Email Notifications**: App doesn't send payment failure emails
   - **Workaround**: Stripe sends default emails (enable in Dashboard → Settings → Emails)

4. **Grace Period Enforcement**: 7-day past_due enforced at upload time, not real-time
   - If user doesn't upload, they can download beyond 7 days
   - **Acceptable**: Read-only access is low-cost

---

## Success Criteria

✅ All 9 test scenarios pass  
✅ Zero webhook replay errors  
✅ Portal opens and returns successfully  
✅ Cancellation doesn't immediately downgrade  
✅ Past due grace period works (uploads blocked after 7 days)  
✅ UI shows correct status badges for all states  
✅ Renewal/cancellation dates displayed accurately  
✅ Storage enforcement works pre/post subscription changes  

---

## Deployment Checklist

Before going live:
- [ ] All GitHub secrets set in production (not test)
- [ ] Webhook endpoint uses production domain
- [ ] Stripe webhook secret matches production endpoint
- [ ] Test with real credit card (small charge, then refund)
- [ ] Monitor first 24h for webhook errors
- [ ] Enable Stripe email notifications for payment failures
- [ ] Set up CloudWatch alarms for Lambda errors

---

## Rollback Plan

If critical issues detected:
1. Disable webhook processing (return 200 without updating DB)
2. Manual fixes via Stripe Dashboard → DynamoDB console
3. Re-enable after fix deployed

**Emergency Access**: Coaches can always cancel via Stripe Customer Portal (bypasses our backend)
