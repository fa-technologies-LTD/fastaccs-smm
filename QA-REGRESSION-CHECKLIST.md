# FastAccs Regression Checklist

Last updated: April 23, 2026
Scope owner: Admin + Checkout Stability

## Phase 0 Safety Baseline

### 1) Login and session persistence
- [ ] User can sign up, verify email, log in, and remain authenticated after refresh.
- [ ] User can log out and session cookie is removed.
- [ ] Suspended user cannot authenticate with existing or new sessions.
- [ ] Admin can revoke a session from `/admin/settings` and affected session is invalidated.

### 2) Order lifecycle states
- [ ] New checkout creates order as pending/pending_payment before payment confirmation.
- [ ] Paid webhook/verify transitions result in `paid` or `completed` only once.
- [ ] Failed/cancelled payment transitions are consistent across verify/webhook/reconcile.
- [ ] Manual admin status updates and process/deliver flows do not break allocation logic.

### 3) Payment verification outcomes
- [ ] Successful Monnify payment updates order and sends confirmation.
- [ ] Amount mismatch is rejected and logged as anomaly.
- [ ] Reconcile endpoint can correct stale payment states safely.
- [ ] Duplicate webhook/verify events remain idempotent.

### 4) Admin access controls
- [ ] `FULL_ADMIN` can access all admin routes and financial values.
- [ ] `ORDER_MANAGER` can operate orders/inventory/catalog but cannot access settings/financial modules.
- [ ] `READ_ONLY` can access read surfaces only and cannot perform writes.
- [ ] Non-full-admin roles see restricted financial values where applicable.

### 5) Cart and checkout behavior
- [ ] Add-to-cart and checkout still work on desktop and mobile.
- [ ] Promo code validation applies server-authoritative discount.
- [ ] Minimum order and checkout-enabled controls are enforced.
- [ ] Tier sample screenshots render correctly on tier detail pages.

## Release Blocking Result
- [ ] All Phase 0 checks pass on Preview.
- [ ] All Phase 0 checks pass on Production candidate.
- [ ] No P0/P1 regression open.
