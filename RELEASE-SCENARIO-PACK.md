# Phase 7 Manual Scenario Pack

Last updated: April 23, 2026  
Business timezone baseline: `Africa/Lagos`

## Environment
- Preview URL: `https://fastaccs-smm.vercel.app`
- Production URL: `https://smm.fastaccs.com`

## Scenario Run Order

### 1) User signup/login/google
- Create a new user via email/password.
- Sign out, then sign back in with same account.
- Validate Google auth callback still lands correctly and creates/links session.

### 2) Email verification + resend
- Trigger verification code request.
- Confirm resend cooldown and successful resend flow.
- Verify account and confirm welcome flow.

### 3) Checkout + payment outcomes
- Add tier to cart and complete Monnify checkout (happy path).
- Validate order state transitions and customer-facing status copy.
- Execute failed/cancelled payment path and verify truthful status.
- Validate promo code path: valid code, invalid code, min-order violation, usage-cap behavior.

### 4) Admin order handling
- Review `/admin/orders` list and open detail.
- Process and deliver eligible order.
- Confirm non-full-admin role can manage orders but cannot view restricted finance fields.

### 5) Alerts and settings updates
- Trigger low-stock path and verify alert dispatch behavior.
- Update business/settings controls and verify persistence.
- Send SMTP test email from `/admin/settings`.
- Revoke at least one session and verify invalidation.

## Go/No-Go Criteria
- [ ] All scenarios pass in Preview.
- [ ] All scenarios pass in Production candidate.
- [ ] No blocking anomalies in payment, fulfillment, auth, or admin roles.
- [ ] Monitoring active for 24–48h post-release with anomaly alert review.
