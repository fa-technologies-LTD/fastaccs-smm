# Current sprint checkpoint

Updated: 30 September 2026

Integration branch: `codex/nonaffiliate-release-candidate`

Purpose: combine the completed non-affiliate work from `test` with the current production branch without losing production-only work such as `/go`. This branch is local only. It must pass the complete verification gate and the owner's local walkthrough before any push or production deployment.

## Included in this release candidate

- Replacement Boosting setup, private preview, storefront flow, cart/checkout integration, order history, fulfilment worker, exception queue and complaint/refill handling.
- Direct and adjustable Boosting quantities: supplier minimum initializes the value, the increment is independently configurable, customers can type a quantity or use quick controls, and invalid increments are normalized safely.
- Clear Boosting pricing language: the global default profit only pre-fills new offers; each offer has its own target. Supplier cost, suggested price and displayed actual profit now use the same formula and server-side checks.
- Safe Boosting routing: Shadow is the default, public visibility is separate from paid-route approval, uncertain submissions cannot be retried automatically, and no supplier identity or cost is exposed publicly.
- Positive allowlists for public category and customer order responses, removing private supplier, cost, margin, affiliate and internal metadata.
- Verified-X follower options for eligible manual-handover X tiers: 0F, +100F for ₦4,000, +500F for ₦12,000 and +1,000F for ₦19,000. Admin enables the options per tier; the server owns the prices.
- Numbers no-code recovery email: owner-controlled and off by default, sent once per attempt after 24 hours only when no code was ever delivered, and suppressed after a later successful Numbers order.
- Owner-only paid-order CSV export with exactly `order_id`, `paid_at`, `product`, `quantity`, `amount`.
- Homepage call-to-action changed from “Browse Accounts” to “Accounts”.
- Bounded rate limits for public analytics and blog-like endpoints.
- Current production-only changes, including `/go`, retained by merging from `main` instead of replacing it with the test branch.

## Boosting safety state

- `BOOSTING_AUTOMATION_MODE` fails closed to `shadow`.
- A supplier service cannot become live merely because it appears in a catalogue.
- Publishing an offer does not enable paid supplier submission.
- Paid submission requires a reviewed, explicitly enabled route and a controlled canary.
- Accepted, charged or ambiguous attempts cannot cause an automatic duplicate purchase.
- SMM Raja refill escalation remains manual until its live contract is confirmed in a canary.
- The two pending production migrations are additive; current production has no conflicting Boosting offers or complaint rows.

## Verification and release gate

Before the owner walkthrough:

1. Production/test integration resolved and reviewed: application source matches the tested `test` branch and `/go` matches production.
2. Diff integrity passed.
3. Svelte/type checking passed with 0 errors and the existing 122-warning baseline.
4. All 139 unit/integration files passed: 804/804 tests.
5. Production build passed under Node 20.19.4.
6. All four production-preview Playwright journeys passed.
7. Integration commit `c3dcfc5` is running at `http://localhost:5173` against isolated staging branch `ep-calm-term-a4byqp53`; all seven expected Boosting tables and five safety indexes passed the read-only integrity probe.
8. Walk through one small Boosting offer: setup, private preview, staging-only publication, service page, cart and checkout.
9. Check Verified-X options, Numbers recovery controls and the paid-order CSV in staging.

The staging pooler was intermittently unreachable during startup, so this local walkthrough process uses the same staging branch's verified direct endpoint. Staging admin writes remain available, while checkout, email, push, Monnify, supplier keys and paid Boosting automation are explicitly disabled for this process. Sequential smoke checks returned 200 for Home, Platforms, Numbers, Boosting Services, Support, `/go`, public categories and public Boosting offers. The public catalog response contained none of the private cost, supplier, affiliate or restock keys.

Before production:

1. Owner approves the local walkthrough.
2. Back up production and apply the two additive Boosting migrations.
3. Deploy the approved integration commit only; do not merge unfinished affiliate work.
4. Keep automation in Shadow while real manual orders provide route comparisons.
5. Run one limited, low-value paid canary before enabling any broader automated fulfilment.

## Deliberately excluded

The Super-affiliate 5%-of-profit work, private per-tier costs, Verified-X option costs, attribution corrections, payout encryption and legacy contract backfills remain isolated from this release candidate. Regular affiliates and buyer discounts remain unchanged.

## Owner decisions still genuinely required

- Approval after the local walkthrough and separate approval before production deployment.
- Which small Boosting offers to configure first and which single route to use for the paid canary.
- Whether a customer password-reset feature should be added; the investigated old account is already verified and therefore correctly receives no new signup-verification code.
- For a broader offline backup system: storage destination, encryption/key custody, cadence/retention, exact scope and restore-test frequency.

## Do not weaken these rules

- No production database experiments.
- No service goes live from a supplier import alone.
- No automatic paid duplicate after acceptance, charge or ambiguity.
- No public cost, supplier or internal affiliate data.
- No claim of “never drops”; show a specific refill-protection period only when the chosen service supports it.
