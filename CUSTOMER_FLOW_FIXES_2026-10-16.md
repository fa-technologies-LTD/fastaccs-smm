# Customer flow and admin-email changes — local review checkpoint

Approved seven-step follow-up completed locally. No push, deployment, production write,
publication, real payment, supplier order or customer/admin email. Prices, quantities,
supplier mappings and the owner's price-review selections were not changed. Existing
uncommitted work preserved. No schema migration or dependency installation needed.

## Customer changes

- Cart quotes expire after 30 seconds; opening the cart and attempting payment request fresh
  data. Changed totals stop checkout for review and another explicit click. The server compares
  displayed totals and, for the updated website, the full accepted subtotal/discount/credit/
  payable/line-price snapshot before creating a new payable order. It never trusts these
  assertions as the source of price. Existing checkout recovery runs before new-price guards.
- Uncertain attempts keep their original request and key across retries/reloads. The screen
  identifies a saved checkout and its original amount, rather than silently replacing it.
  Optional tracking IDs/consent are not persisted in that recovery request: current consent
  is read again on every send. Resumed analytics use the saved order amount, not a changed
  basket's total/products, and do not overwrite a previously captured checkout snapshot.
  Only explicit pre-payment refusal codes reset availability failures; generic gateway outage
  wording cannot discard an uncertain attempt. Definite input rejections remain editable.
- Unavailable-item recovery no longer clears the basket or redirects everything to Numbers.
  Refresh removes refused lines, preserves unaffected ones, checks the existing mapping/lock
  and availability rules, rejects stale managed-catalogue legacy entries, and uses neutral
  customer labels. No supplier ranking, selection, paid retry or learning was added.
- Shared credit arithmetic preserves refund kobo and the existing whole-naira/30% earned-credit
  rule. Credit/affiliate buckets remain separate. A failed balance read stops checkout rather
  than silently treating the customer's selected credit as zero. Discount changes are visible.
- Other-tab removal/clear/expiry resets the visible cart; obsolete refresh failures cannot
  poison a newer cart. Checkout follows actual cart changes instead of leaving old rows visible.
- The keyed Numbers card owns each order's state/timers. Destroyed cards abort/ignore late
  polling responses. Failed orders have useful balance/support links. Refund completion needs
  the committed rental refund plus sufficient recorded refunded amount for the signed-in
  buyer; terminal labels alone do not prove credit was posted. Existing Numbers recovery
  endpoints/financial implementation remain in place; no new supplier or refund algorithm.
  Returning during cancellation/replacement now shows the operation and retires the old number
  instead of offering it for copying. Unknown states have a safe My Orders destination, and
  receipts without visible code details offer Refresh details/support rather than a false
  promise that an automatic refresh is happening.
- Mobile cart and cookie notice no longer cover Checkout. The cart has dialog semantics,
  Escape dismissal, focus cycling/restoration and bounded scrolling. Cookie height is measured
  after wrapping/resizing. Storage-denied consent stays fail-closed without trapping the UI.
  Mobile navigation exposes its expanded state.
- Sign-in says “Sign in to FastAccs,” has one Back-to-browsing control, and drops the misleading
  browse-benefit bullets. Anonymous checkout has one “Sign in & continue” action. Support
  explains Quick buy versus profile selection and uses the purchased refill deadline instead
  of promising a fresh 30 days after fulfilment. Branding/useful homepage shortcuts retained.

## Admin emails

- Normal paid Boosting orders no longer trigger a per-sale admin email. The former helper is
  also policy-disabled, protecting against an accidental future caller. Customer transactional
  receipts/delivery messages remain unchanged. Routine weekly business-summary emails are
  disabled under the owner's exceptions-only email policy; dashboard reporting remains.
- Manual-delivery emails remain, titled “Action needed: manual delivery.” Existing payment
  review/mismatch, refund-processing, critical automation, stock/funds, customer complaint
  and affiliate payout alerts remain. Their existing bounded reminder/cooldown policies were
  not silently removed; this change does not claim every old alert is globally once-only.
- The existing hourly support-review job now additionally groups recorded Boosting exceptions
  and unfinished 24-hour orders into actionable emails. Overdue is explicitly not called
  confirmed failure. Uncertain submission warns against submitting again. Only recorded safe
  explanations leave the server, not raw provider output or financial internals.
- Successful coverage is recorded per recipient/incident; repeat checks skip covered issues.
  Failed sends remain retryable, and the same already-sent batch can repair missing coverage
  markers without another email. A private rotating cursor prevents older cases starving newer
  ones. Scanning is bounded to 100 items per run and uses the existing automation lock.
  This is not a transport-level exactly-once guarantee: ambiguous SMTP acceptance/logging
  failures still need email-health review. No real outbound email was sent to test this.

## Verification

- **235 server suites / 1,754 tests pass.** **15 Chromium suites / 101 tests pass.**
  New tests cover the actual desired behavior, not the old audit's buggy observations.
- Type check: **zero errors**, 113 existing/remaining warnings. Existing browser-harness
  wrapDynamicImport/teardown diagnostics remain; suite exit status is zero.
- Built app: **38 anonymous visits across 19 routes at 390/1440px**, all final destinations
  HTTP 200, zero browser startup errors, zero unexpected HTTP asset errors, no whole-page
  overflow, working mobile menu, no network-write requests. Screenshots visually reviewed.
- Real separate-staging rehearsal: authenticated synthetic session → one confirmed pricing
  Save → public visibility → stale-total rejection before any order/gateway work → acknowledged
  ₦500 unpaid checkout with fake gateway response. Synthetic insufficient funds then hides the
  offer and refuses a stale cart. All fixtures/settings/provider runtime changes rolled back;
  row counts and provider records independently verified unchanged. No actual charge/delivery.
- Built-page checks caught a real artifact mismatch when config-generating checks/builds
  overlapped: client/server bootstrap identities differed and hydration failed. Finish checks
  and tests, then build alone. Added `verify-built-bootstrap.mjs` to the build command: it
  rejected that mismatched artifact, and the clean sequential build and native browser pass
  now match. No application workaround or live-site change was used. Broken legacy static
  policy-logo references now reuse the existing `/favicon.png` asset.
- Speed: built/local staging only, desktop plus 4× CPU slowdown, no real mobile-network
  emulation. Initial runs had ~4–6s cold catalogue waits; the final run recorded **7.2s** for
  the homepage alongside a transient “cannot reach staging database” error and safe catalogue
  fallback. That is not a healthy full-catalogue or production performance result. Final warmed
  mobile samples had **7–654 ms TTFB / 84–868 ms LCP**, sampled JS about **108–117 KiB**.
  Database connectivity subsequently recovered and the final real staging transaction and
  cleanup passed. Cold connectivity remains a reservation; do not declare production speed
  solved from warm localhost measurements or a fallback page's rendered response.

Evidence: `/private/tmp/fastaccs-customer-fixes-{server,all-client,check,build,staging}-20261016.log`,
`/private/tmp/fastaccs-customer-fixes-pages-20261016.json`,
`/private/tmp/fastaccs-customer-fixes-performance-20261016.json`,
`/private/tmp/fastaccs-customer-fixes-*-20261016.png`.

## Review and next step

Stable built staging preview: http://localhost:5181/auth/login and http://localhost:5181/support.
Its payment/supplier/email credentials are disabled. Numbers/Boosting empty/paused states in
that preview are not production-stock findings. Port 5173 was not restarted or stopped, so
the owner's pricing session stays separate; any old dev dependency-cache issue there is not
a failure of the verified built preview.

Owner can continue price review. After localhost review, explicit release approval is still
required before any push/deployment/publication. No offer is automatically approved by these
tests. Universal follow-ups: SEO/indexing/marketing with Claude, support inbox verification,
email privacy/copy and approved announcements before sending, retention/refill evidence,
cold-load/production performance verification and deferred cleanup.
