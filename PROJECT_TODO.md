# Fast Accounts unified project checklist

Last updated: 30 September 2026

## Now — non-affiliate release candidate

- [x] Build the replacement Boosting setup and private preview.
- [x] Connect reviewed live offers to storefront, cart, checkout, paid-order recovery, order history and notifications.
- [x] Add safe supplier routing, idempotent fulfilment, status polling and fail-closed `submission_unknown` handling.
- [x] Add the exception-focused admin queue and customer complaint/refill flow.
- [x] Clarify global default profit versus per-offer profit and make all displayed price/profit maths consistent.
- [x] Replace fixed quantity chips with a direct, adjustable quantity selector that respects supplier minimums and increments.
- [x] Prevent public/customer APIs from exposing supplier, cost, margin, affiliate or internal metadata.
- [x] Build owner-enabled Verified-X follower options with server-owned prices.
- [x] Build the owner-controlled Numbers no-code recovery email, off by default.
- [x] Build the exact five-column owner-only paid-order CSV export.
- [x] Change the homepage call-to-action to “Accounts”.
- [x] Preserve production-only `/go` work in the integration branch.
- [x] Complete the integration branch diff review.
- [x] Pass diff integrity, typecheck, all 804 unit/integration tests, production build and all four production-preview E2E journeys.
- [x] Start the integration branch against isolated staging for the owner walkthrough and smoke-check its key public routes.
- [ ] Owner reviews Boosting setup/preview/store/cart/checkout, Verified-X, Numbers control and CSV.
- [ ] Obtain a separate explicit approval before pushing or deploying.

## Boosting rollout after code approval

- [ ] Owner configures only the first small offer set in staging.
- [ ] Compare Shadow route choices with manual fulfilment on real orders.
- [ ] Choose one reviewed, low-value route for a controlled paid canary.
- [ ] Verify submit, polling, history, completion notification, complaints and recovery end to end.
- [ ] Confirm SMM Raja's refill/support contract before automating that provider's refill escalation.
- [ ] Keep the existing production flow available until replacement parity is proven.

## Paused affiliate sprint — excluded from this release

Locked rules:

- [x] Scrap the flat ₦100 recurring reward and all monthly milestone bonuses/tier notifications.
- [x] Keep the existing one-time ₦700 Super activation reward unchanged.
- [x] Keep buyer discounts and all regular-affiliate rules unchanged.
- [x] New Super commission is 5% of entered profit for future post-activation orders only; no historical back-pay.
- [x] Existing valid Super relationships, including Private Musk under Amiii, may earn on future orders.
- [x] Commission fails closed when required cost is missing or an order has no positive entered-cost margin.
- [x] Costs, margins, rates and referral spend stay private; affiliates see only their own credited naira amounts.

Remaining implementation and operational work:

- [ ] Finish private cost input for every commissionable account tier.
- [ ] Add a separate private cost input for each enabled Verified-X follower option; order cost is base tier cost plus the selected option cost.
- [ ] Keep “exclude from affiliate commissions” as the no-cost-required path for Boosting and other excluded tiers.
- [ ] Freeze tier cost, add-on cost, paid allocation, profit, rate, eligibility decision and commission amount per order.
- [ ] Flag skipped commissions in admin and allow a deliberate rerun after missing costs are filled, without duplicating credits.
- [ ] Confirm automatic refund void/reversal and the existing earnings hold in local acceptance tests.
- [ ] Apply referral-window gating to Super progress and the existing regular reward path without changing regular amounts.
- [ ] Remove referral buyer spend from the affiliate dashboard; show only the affiliate's own earnings.
- [ ] Back up production, then run the approved late-attribution correction dry run and show before/after rows before applying it.
- [ ] Keep Amiii → `privatemusk00@gmail.com`.
- [ ] Remove Amiii → `jmjoannamoorejm@gmail.com`, Joanna → `verystrongethan@gmail.com`, and `verystrongethan@gmail.com` → `verifyright68@gmail.com` as test/wrong attributions.
- [ ] Grandfather prior Amiii ₦700 rewards; no clawback.
- [ ] Explain each ambiguous legacy frozen contract before changing it; safe backfills only record already-effective terms.
- [ ] Back up the database and test payout-detail encryption on a copy before touching the 17 production rows.
- [ ] Store encryption keys only in production secrets plus a separate secure backup, and prove old-key rotation/readability.
- [ ] Unify the two affiliate audit scripts' definition of Super `totalSales` before automated reconciliation.

## Other genuine decisions

- [ ] Decide whether to build password reset. The investigated account is active and already verified, so signup verification is not its problem.
- [ ] Define the comprehensive offline backup product: destination, encryption and key owner, cadence, retention, included data/files and restore-test schedule.
- [ ] Clarify whether “fresh analytics” or a separate Boosting analytics view is still wanted; current Analytics already includes Boosting revenue statistics.

## Production release checklist

- [ ] Record the exact approved commit.
- [ ] Take a production database backup.
- [ ] Apply only the reviewed additive migrations.
- [ ] Deploy with Boosting automation still in Shadow and Numbers recovery still off unless the owner explicitly enables it.
- [ ] Smoke-test homepage, Accounts, Numbers, Boosting, cart, checkout, customer orders, admin analytics and `/go`.
- [ ] Inspect the first production catalogue refresh and Shadow routing records.
- [ ] Do not include the isolated affiliate worktree in this deployment.
