# Customer journey audit — 16 October 2026

Update: the owner subsequently approved local fixes. Implementation/verification and remaining
release limits are recorded in CUSTOMER_FLOW_FIXES_2026-10-16.md. Findings below describe the
original audit, not the final state of those repaired paths.

## Outcome

Price review can continue independently. The broad local audit found real customer-flow
defects; passing existing tests does not mean these edge cases are safe. Fix the shared
checkout/cart defects before release, then repeat the customer walkthrough. Numbers state
handling needs its own corrections too. No product code, prices, mappings, approvals or live
state were changed by this audit. Nothing pushed, deployed, purchased, charged or emailed.

This is an evidence-backed review, not a claim that every possible bug has been excluded.

## Findings, in recommended repair order

### 1. Reconfirm a changed price before creating the payable order — high priority

An unchanged cart's successful quote has no time limit. A browser observation fetched a
₦500 quote, advanced the clock three hours, and received the same cached quote without a
second refresh. Checkout only explicitly reloads before payment if it already has a cart
error. Separately, a mocked order request displaying/posting ₦500 reached the order-creation
boundary with a current server total of ₦1,000, without a price-change confirmation.

Keep server-authoritative pricing: trusting the browser would be unsafe. Instead, refresh
the quote before payment and require the buyer to acknowledge any changed amount. Bind the
accepted quote to order creation so a second change cannot slip through. Preserve the same
checkout identity during uncertain-response recovery; do not create duplicate orders.

The higher payable amount is demonstrated at a mocked pre-write boundary, NOT by charging a
customer. Surprise gateway amounts, or a larger store-credit debit, are risks inferred from
the remaining flow, not observed financial transactions.

Sources: `src/lib/stores/cart.svelte.ts:375`; `src/routes/checkout/+page.svelte:497` and
`:683`; `src/routes/api/orders/+server.ts:563` and `:1391`.

### 2. Keep unavailable-item recovery in the correct shop — high priority

A removed Boosting option produces the real server wording “this customer option is no
longer available.” The browser treats that as a Numbers shortage, clears the entire cart,
shows “This number isn’t available right now,” and sends the buyer to `/numbers`.
The same generic branch can catch an unavailable account add-on. Conversely, the newer
“temporarily unavailable” wording does not trigger that recovery or an automatic refresh.

Use structured product/item error codes, preserve unaffected lines, and provide a clear
return to the relevant shop. Avoid deciding product type by searching an English sentence.

Sources: `src/routes/checkout/+page.svelte:615`; `src/routes/api/orders/+server.ts:656`,
`:787`, `:876` and `:1229`. Reproduced in a fully mocked browser checkout.

### 3. Reset Numbers details when the displayed order changes — high priority

The number card copies its initial status, number and code into local state, without
resetting them when its order changes. Rerendering a mounted card from Brazil/code 111111
to Canada/code 222222 changes the heading to Canada but leaves 111111 visible and copyable.
The order page renders the card without an order-specific key. This concerns client-side
navigation that reuses the mounted order page, not every visit or a demonstrated cross-user
data leak.

Key the card by order-item identity or reset its complete state and polling lifecycle when
identity changes. Ignore responses from the previous order after a switch.

Sources: `src/lib/components/NumbersOtpCard.svelte:29`; `src/routes/order/[id]/+page.svelte:350`.
Reproduced with synthetic props; no real number/code accessed.

### 4. Do not let the cookie notice cover mobile Checkout — medium priority

At 390 × 844, the first-visit cookie notice sits above the cart footer. A browser hit-test
at the Checkout button's centre reaches the cookie notice rather than Checkout. The user
can choose Necessary only or Accept to dismiss the notice, so this is recoverable, but the
page should not make a cookie decision appear necessary to reach its purchase control.

Keep both consent choices accessible. Arrange the two overlays so neither covers the
other's actions, including small screens and large text.

Sources: `src/lib/components/MiniCart.svelte:158`;
`src/lib/components/CookieConsentBar.svelte:50`. Reproduced with both real components.

### 5. Show a useful failed-Numbers state — medium priority

A card with status `failed` and no number/code displays its heading but no explanation,
refund message or next action, and it does not poll. `failed` is absent from both the active
and terminal display branches. The page loader prepares a refund message, but the component
does not show it for this state. When correcting this, do not equate failure with a completed
refund: the loader currently derives refund wording from rental state/reason rather than
showing evidence of the credit posting in this calculation.

Show the failure and appropriate support/retry destination; distinguish refund pending
from refund completed using authoritative accounting state. No automatic purchase/retry
behavior is proposed here.

Sources: `src/lib/components/NumbersOtpCard.svelte:27`, `:109` and `:555`;
`src/routes/order/[id]/+page.server.ts:100`. Blank state reproduced in browser.

### 6. Use the same credit calculation in preview and server — medium priority

For a ₦500 order with ₦499.50 refund credit and ₦100 earned credit, the preview applies
another ₦0.50 earned credit and shows Complete Order. The server's existing whole-naira
earned-credit rule applies zero earned credit, leaving ₦0.50 payable instead. Both sides
were exercised with identical synthetic balances. No debit or gateway request was made.

Share a pure calculation while keeping the refund, earned and affiliate balances separate.
Do not round away a customer's refund credit or silently change earned-credit policy.

Sources: `src/routes/checkout/+page.svelte:80`;
`src/lib/services/store-credit.ts:136`.

### 7. Clear the cart consistently across tabs — medium priority

Deleting the cart storage key in another tab dispatches a storage event, but loading a
missing key immediately returns, leaving the old cart in memory. A browser storage-event
observation confirmed the item count stays at one. This can confuse a buyer after another
tab completes or clears the cart; no duplicate charge was tested or claimed.

Explicitly handle removed storage and storage-clear events, invalidate cached quotes, and
keep pending-payment recovery separate from a newly emptied basket.

Source: `src/lib/stores/cart.svelte.ts:99` and `:155`.

### 8. Carry availability and honest labels through cart refresh — medium priority

Code inspection shows cart refresh loads a live offer with any enabled/approved route, but
does not run the shared known-unavailability inspection or honor its full selected-route
conditions. It can therefore keep displaying an option that public browsing and final
checkout refuse. Final checkout's refusal remains a protection; this finding does NOT
demonstrate an unavailable service being paid for.

It also returns raw `customerName`, bypassing the neutral-label helper used in browsing and
new purchase snapshots. Old comparative names can reappear in cart/checkout. Apply the same
public meaning throughout the journey, without rewriting purchased terms or selecting a
different supplier. This finding is source-inspected, not a dedicated endpoint reproduction.

Source: `src/routes/api/cart/refresh/+server.ts:300`, `:358` and `:414`.

### 9. Reconcile support promises with actual terms — medium priority

Support still says the 30-day refill window starts after fulfilment. The actual eligibility
calculation uses the earlier valid submission/completion time. The corrected store copy and
Support consequently disagree. Support also describes only automatic account allocation,
without explaining the existing exact-account selection option.

Keep one factual policy wording and explain standard versus exact selection only where
relevant. Do not add supplier guarantees or extend purchased protection silently.

Sources: `src/routes/support/+page.svelte:48` and `:74`;
`src/lib/server/boosting-providers/complaints.ts:44`.

### 10. Finish keyboard behavior and simplify repeated UI — lower priority

The cart stays open after Escape and has no dialog semantics; this was reproduced. Its
modal also needs intentional focus placement, containment and return. The mobile menu
opens successfully but does not expose its expanded state to assistive technology.

Visual review recommendations, not undisclosed redesign decisions:

- Keep one main Accounts / Numbers / Boosting choice on the homepage; avoid immediately
  repeating the same three choices in another prominent section.
- Replace “Account Required” with a welcoming sign-in heading. Remove the duplicate Back
  links and generic browsing-benefit bullets; browsing is already possible without login.
- Reduce repeated login prompts on anonymous checkout to one clear action and explanation.
- Keep help reachable without making the buyer scroll through unrelated account advice.
- No password-recovery link or matching public route was found. Treat self-service recovery
  as a separate feature decision, not an unannounced addition in this audit.

Sources: `src/lib/components/MiniCart.svelte:144`;
`src/lib/components/Navigation.svelte:641`; `src/routes/auth/login/+page.svelte:118` and `:225`.

## Verification and limits

- Fresh existing server baseline: **229 suites / 1,732 tests passed**.
- **Eight isolated browser observations and two server observations** reproduced the edge
  cases above. These deliberately asserted current defects; their passing results are NOT
  passing regression coverage for the desired behavior. Temporary test files were removed
  from the source tree after preserving copies/logs in `/private/tmp`.
- Anonymous GET-only sweep: **19 customer routes × two widths (390px / 1440px), 38 visits**,
  including account platform/detail, help, blog, policies, sign-in/signup and protected-page
  redirects. Final destinations all returned 200; no whole-page horizontal overflow. No page
  errors except the Numbers local-asset failure detailed below. Screenshots reviewed for
  main browse, account details, sign-in/signup, help and mobile layout. External requests,
  submissions and cron requests blocked; zero network-write requests. No customer login or
  real payment was attempted. Protected authenticated journeys beyond these redirects were
  covered by code/mocked tests, not a new complete signed-in browser purchase.
- Existing privacy allowlists, dashboard-only account-ready email helper, payment binding,
  terminal settlement and credit protections were inspected/tested as part of the baseline;
  this is not an independent penetration test or proof of live delivery.
- Numbers has a separate localhost development-asset issue: browser requests for the Vite
  `svelte_reactivity.js` dependency returned 504 and prevented hydration. Direct source
  modules returned 200. This is a local preview/tooling finding, not a demonstrated
  production Numbers outage. Preserve the owner's drafts before any controlled restart.
- Local providers/payment/email credentials are intentionally unavailable in the verified
  staging launcher. Empty Numbers/paused Boosting in that environment do not prove missing
  production stock. No production catalogue conclusions were drawn.
- Development load times include compilation and staging connectivity. They cannot establish
  production speed or Core Web Vitals. A built-app/network-throttled performance check is
  still needed after the shared customer-flow fixes; do not optimize away quote validation.

Evidence: `/private/tmp/fastaccs-customer-pages-audit-20261016.json`,
`/private/tmp/fastaccs-customer-audit-observations-20261016.log`,
`/private/tmp/fastaccs-customer-price-audit-20261016.log`,
`/private/tmp/fastaccs-customer-audit-server-20261016.log` and
`/private/tmp/fastaccs-customer-audit-*-20261016.png`.

## Next checkpoint

Owner may continue price review without these findings changing any price or service choice.
After local implementation approval: correct checkout/cart first, then Numbers state display,
copy and accessibility; add permanent desired-behavior regressions and repeat the built-app
staging walkthrough and responsive/performance checks. Show localhost before release approval.

Universal work remains separate: SEO/indexing/marketing with Claude, support inbox verification,
email privacy/copy and announcement approval before sending, retention/refill evidence and
deferred cleanup. Supplier routing, learning and automatic paid retries remain excluded.
