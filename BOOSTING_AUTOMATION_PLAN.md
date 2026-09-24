# Dual-provider Boosting automation plan

Last researched: 13 September 2026

Implementation note: the additive, supplier-inert foundation migration was applied to production and structurally verified on 14 September 2026. It does not schedule or submit supplier orders.

Providers in scope:

- SMM Raja: `https://www.smmraja.com/api/v2`
- BulkFollows: `https://bulkfollows.com/api/v2`

## Decision

Integrate both providers behind one Fast Accounts fulfilment system. Customers never choose or see a provider. The router chooses the lowest-cost **proven equivalent** service that is currently healthy, sufficiently funded, within the promised quantity/refill rules, and above our minimum margin.

Using two providers is sensible, but two accounts alone do not create reliability. Provider marketing claims and service names are not evidence that two services are equivalent. Reliability has to come from our own order results, conservative mappings, circuit breakers, and a manual escape hatch.

The two panels may also resell overlapping upstream supply. Track whether failures and slowdowns happen together; do not treat them as independent redundancy until our results support that conclusion.

Checkout must remain independent of both providers. A slow or unavailable supplier must never delay payment confirmation, lose a paid order, or create duplicate supplier orders.

## What the public APIs currently prove

Treat the public documentation as a starting hypothesis, not truth. Every operation and response shape must pass authenticated contract tests before it can control a real order; reseller-panel documentation can be incomplete or stale.

Both endpoints accept form-encoded `POST` requests with an API key and an `action`, and both reject an unauthenticated request as expected.

### Authenticated catalogue discovery snapshot — 10 September 2026

Read-only authenticated calls returned 6,237 SMM Raja services and 5,801 BulkFollows services. A broad category/name scan found the following discovery candidates across both catalogues:

| Platform  | Followers/subscribers/members | Views/streams |            Likes/reactions | Useful conclusion                                           |
| --------- | ----------------------------: | ------------: | -------------------------: | ----------------------------------------------------------- |
| Instagram |                           584 |           232 |                        775 | Deep supply for primary outcomes                            |
| TikTok    |                           260 |           295 |                        286 | Deep supply for primary outcomes                            |
| YouTube   |                            48 |         1,285 |                        251 | Subscriber pool is smaller but still broad                  |
| Facebook  |                           306 |           308 |                        632 | Broad supply; page/profile/post types still need separation |
| X         |                           140 |           210 |                        100 | Enough candidates for quality/price testing                 |
| Spotify   |                            47 |         1,070 | Not a core Spotify outcome | Strong stream/listener supply; saves are much thinner       |
| Telegram  |                           486 |           399 |                        213 | Broad members/views/reactions supply                        |

These are discovery counts, not approved routes: keyword matches can overlap or misclassify services. The raw catalogues also contain zero rates, extreme price outliers and provider claims that cannot be treated as measured quality. The normalizer must quarantine malformed/outlier rows, preserve original fields for review, and require explicit equivalence approval. Refill/cancel flags are useful filters but remain untrusted until authenticated behaviour and controlled orders confirm them.

### First isolated staging import — 19 September 2026

The guarded importer persisted 12,007 current rows to the Neon staging branch: 6,230 from SMM Raja and 5,777 from BulkFollows. It then created 101 hidden customer-offer drafts and 390 unapproved shadow-route suggestions across 37 core platform/outcome categories. No generated category was activated, no offer was reviewed or published, and no supplier-order endpoint was called. Re-running the importer produced zero duplicates or overwrites. Forty-four untouched generated drafts that initially had no legacy catalogue price received conservative tier-specific price suggestions rounded to ₦50; a second price pass changed zero rows.

On 10 September 2026, read-only authenticated probes succeeded for both accounts: SMM Raja returned 6,237 services and BulkFollows returned 5,801, and both balance endpoints reported USD. No paid order was submitted. This proves the supplied credentials and basic `services`/`balance` shapes, not the behaviour of submission, status, refill, cancellation or error cases.

On 13 September 2026, authenticated read-only probes using deliberately nonexistent order IDs also confirmed each supplier's single and batch status fields and keyed per-order error shape. SMM Raja accepted a comma-separated `order`; BulkFollows accepted `orders`. BulkFollows returned valid JSON with an inaccurate `text/html` content type, so our adapter validates the body rather than trusting that header. These checks still do not prove successful-order statuses, submission, refill or cancellation. Those remain gated behind the controlled paid canary.

One BulkFollows probe from the local integration environment first hit a connection timeout and then passed on a clean retry. This is not enough to attribute a supplier outage, but it is a useful early reminder that DNS/network health can be intermittent. Track it independently from order quality, use short bounded status calls, and let the circuit breaker hold new submissions when a provider is unreachable.

| Capability                      | SMM Raja                            | BulkFollows                      | Build decision                                                                           |
| ------------------------------- | ----------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| List services and current rates | Documented                          | Documented                       | Sync into our own catalogue; never match by name at order time                           |
| Submit a standard order         | `service`, `link`, `quantity`       | `service`, `link`, `quantity`    | Supported through one provider adapter                                                   |
| Read order status               | Documented                          | Documented                       | Normalize provider states internally                                                     |
| Batch status                    | Comma-separated IDs in `order`      | `orders`, up to 100 IDs          | Invalid-ID keyed shapes are confirmed; revalidate successful rows during the paid canary |
| Read balance                    | Documented                          | Documented                       | Cache and reconcile a local projected balance                                            |
| Refill/cancel                   | Advertised in service data/API page | Documented                       | Do not automate until authenticated contract tests pass                                  |
| Webhooks                        | Not found in the public contract    | Not found in the public contract | Assume bounded batch polling                                                             |
| Client idempotency key          | Not found in the public contract    | Not found in the public contract | Never blindly retry or fail over an ambiguous submission                                 |

SMM Raja's public example covers services, add, status, multi-status and balance. Its API page says service records expose rate, min/max and refill/cancel availability. BulkFollows documents services, add, single/batch status, balance, refill and cancel. Exact service catalogues, account currencies, rate limits, response variants and commercial terms still require authenticated verification.

## Non-negotiable safety rule

Neither public order contract shows a client idempotency key. If a supplier receives an order but our request times out before the order ID returns, sending the same order to the other supplier could buy the boost twice. Cancellation capability is service-specific, and even a cancellable order is not safe to replace until the provider confirms its terminal cancellation state.

Therefore:

- Route immediately **before** submission.
- Fail over automatically only when we know no supplier order was created.
- Treat any timed-out or malformed response after an order request may have left our server as `submission_unknown`.
- Hold `submission_unknown` for admin reconciliation; never submit it again automatically.
- Never race both suppliers in parallel.

This is stricter than a typical reseller-panel integration, but duplicate delivery is a financial and customer-trust failure.

### Reaching a conclusive state after an uncertain submission

`submission_unknown` must not become a permanent limbo state:

1. Freeze automatic retries and place the item at the top of **Needs review**.
2. Recheck the provider account's recent orders and balance movement for the matching service, target, quantity and time window.
3. If the supplier order is found, attach its ID and resume normal tracking.
4. If the provider or an admin conclusively confirms no order exists, mark the attempt `not_submitted` and allow a fresh routing decision.
5. If it cannot be proven either way, keep the customer-facing state calm, escalate its age visibly to the admin, and resolve it manually rather than risking duplicate delivery.

If authenticated testing reveals a searchable client reference or idempotency facility, automate this reconciliation behind the same state machine.

## Customer experience

### The complete flow

Keep the existing simple path:

1. Pick a service.
2. Paste a public link and choose the amount.
3. Pay.
4. Track it from Purchases.

The supplier selection, supplier price, service ID, retries, balances and technical errors remain invisible.

### The customer buys a promise, not a supplier service

A Fast Accounts customer option is a stable **offer envelope**. It describes the result the customer is buying while allowing many approved supplier subservices to fulfil it.

| Layer          | What it contains                                                                                                         | Who sees it        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Customer offer | Platform, outcome, audience when relevant, quality choice, quantity, price and concise expectations                      | Customer           |
| Offer rules    | Required retention/refill/speed attributes, quantity limits, target margin, derived supplier budget and complaint rights | Fast Accounts only |
| Candidate pool | Every tested SMM Raja/BulkFollows service currently allowed to satisfy those rules                                       | Admin/router only  |

One customer offer can therefore map to a wide candidate pool across both suppliers. The router retains the freedom to choose and safely recover within that pool, but it may never use a cheaper candidate that falls outside the promise the customer selected. Changing the underlying route must not change the customer's price, displayed expectation or order identity.

Customer-visible variety and backend redundancy are separate:

- Normally show **two or three meaningful customer choices** for a major outcome: **Affordable**, **More stable**, and **Premium** when the catalogue and evidence support all three.
- Show a third only when it expresses a genuinely different tested benefit, such as local audience, faster start or a longer refill window.
- Each choice uses either **My choice** (one exact provider/service code plus an optional fallback) or **Smart Auto** (the router chooses from compatible proven services).
- If two visible choices are not measurably different, show one. Do not create fake variety from supplier names.
- Pre-populate the standard tier names and customer wording, but do not mark provisional supplier suggestions as selected routes. Smart Auto can recommend compatible services without making the owner review a large generated shortlist.
- Supplier catalogues remain internal inventory. Never publish one customer option per supplier service or make customers understand provider terminology.

### Initial platform coverage target

This is the intended breadth, not permission to publish untested services. Each outcome goes live only after its links, delivery behaviour, cost and customer promise are verified.

| Platform  | Core customer outcomes                                               | Notes                                                                 |
| --------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Instagram | Followers, post/reel views, likes                                    | Separate audience/region before quality when relevant                 |
| TikTok    | Followers, video views, likes, shares                                | Support profile, full video and official short/share links            |
| YouTube   | Subscribers, video views, likes                                      | Add watch-time products only after a separate expectation/risk review |
| Facebook  | Page/profile followers, post likes/reactions, video views            | Clearly distinguish page, profile and post targets                    |
| X         | Followers, post likes, reposts/views                                 | Keep target wording consistent with the URL type                      |
| Spotify   | Streams, followers, monthly listeners/saves where reliably available | Never imply guaranteed organic discovery or earnings                  |
| Telegram  | Members, post views, reactions where reliably available              | Distinguish public channels, groups and post links                    |

For every popular platform/outcome, catalogue discovery should look for at least two meaningfully different customer offers and multiple possible backend routes. Coverage is considered complete only when the important outcome matrix is filled or a deliberate reason for exclusion is recorded.

### Mobile-first service-selection screen

Use one calm decision sequence on the existing platform page:

```text
[Platform name and one short promise]

What do you want?
[Followers] [Views] [Likes] [More]

Choose what suits you
[Best value — recommended]
 Lowest price that passed our checks
 [More stable]
 Better tested retention / refill protection

Your public link
[ Paste link                                      ]
[ Compact verified preview or Open link ]

How many?
[1,000] [2,000] [5,000] [10,000]
             [−] 5,000 [+]

[Add to cart — ₦X]
```

Interaction rules:

- Show platform choices in a wrapping grid; no native horizontal scrollbar.
- Show the major outcomes first and put genuinely secondary ones under **More**.
- Show no more than three offer cards at once. Preselect the safest best-value default, not the untested cheapest route or the option with the highest margin.
- Keep only one service panel expanded. Opening a new one closes the previous panel without losing entered data.
- A homepage/service-card deep link opens the exact platform and outcome, scrolls it into view and expands it automatically.
- Ask about audience/region only when it materially changes delivery; then ask quality. Do not mix geography, speed and retention into an unexplained list of similarly named products.
- Keep link, quantity, live total and CTA together. On mobile, use a compact sticky total/CTA after a valid selection rather than another checkout-summary screen.
- Preserve selections when the customer goes back, signs in or corrects a link.
- Use app icons, 44px minimum tap targets, strong contrast, visible focus and keyboard/screen-reader labels.
- No nested modals, raw service IDs, supplier names, technical status, fake stock or fake countdown pressure.

### Offer-card language

Each option contains only:

1. A short name.
2. One sentence explaining why it costs more or less.
3. At most two verified expectation chips.
4. The price for the currently selected quantity.

Preferred labels are plain outcomes such as **Best value**, **More stable**, **Faster start** or **Local audience**. Use **Recommended** once, on the default. Do not use unexplained labels such as HQ, LQ, server, API, non-drop or refill code. Never promise “won't drop”; say exactly what testing supports, for example **Some followers may drop**, **30-day refill included**, or **Better tested retention**.

Keep longer caveats behind one **What to expect** disclosure. The primary card must still tell the customer enough to choose confidently without opening it.

### Selection feedback and anxiety control

- Validate after paste or a short pause, not on every keystroke.
- A definite mismatch says what is needed and shows one example: **Paste the Facebook profile link you want to grow.**
- An official but ambiguous link is accepted for checking; do not block payment merely because a preview provider failed.
- Adding/removing a cart item gives immediate visual confirmation and a short toast. Disable only the affected CTA while it is saving.
- If an operation takes longer than two seconds, keep the selected values visible and use specific copy such as **Adding to cart…**; never leave an unexplained spinner.
- Supplier switching, refill attempts and ordinary recovery remain under **In progress**. The customer's original expected window never restarts because the backend changed routes.
- Contact the customer only for a link correction, a material expectation change or a terminal resolution. Ordinary backend work should feel effortless.

### UX acceptance criteria before live automation

- A first-time mobile customer can select a platform, understand the two offers and add one to cart in under 60 seconds without help.
- At least four of five representative low-tech testers can correctly explain why the options have different prices after reading only the cards.
- No tested 360–390px screen has clipped content, horizontal page scrolling or an obscured primary CTA.
- Exact service deep links open the intended outcome and keep the selected tab in view.
- Every supported link class has a success, ambiguous and correction state with preserved input.
- Price changes are immediate and the cart total always matches the selected offer/quantity.
- Keyboard-only and screen-reader paths can reach every decision and understand selection state.
- Customer screens never expose provider names, supplier IDs, retries, cost ceilings or raw errors.
- Five-second comprehension test: the platform, desired result, main difference between offers and next action are visually obvious.

### Link handling

The current link validator is a good base because it accepts Facebook share links and TikTok short/share links for review instead of rejecting every URL it cannot classify locally.

- Accept official Facebook, Instagram, TikTok, YouTube and X URL formats, including recognized short/share URLs.
- Normalize and validate again on the server before supplier submission.
- For an ambiguous official link, allow checkout and place it in a quick automated/manual verification path.
- Show one short reminder: **Keep the profile or post public while we deliver.**
- Show one subtle privacy reassurance near the field: We only need the public link—never your password.
- Let the customer open the normalized link before paying.
- If correction is required, preserve the existing link-update flow instead of cancelling the entire order.

Do not add provider-specific URL rules to customer pages. Those belong in each route mapping and adapter.

### Calm customer statuses

The backend may have many precise states, but the customer should see only four. Partial delivery, refills and ordinary supplier checking remain under **In progress** instead of creating more concepts for the customer.

| Customer label        | Meaning                                                            | Customer action                            |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| Getting ready         | Payment is confirmed and the order is being checked/submitted      | Nothing                                    |
| In progress           | Delivery is active, including any ordinary partial/refill recovery | Nothing                                    |
| Quick link fix needed | The link is private, wrong or cannot be used                       | Update link                                |
| Complete              | Delivery finished                                                  | Nothing; optional small celebration/review |

**As simple as possible** is the governing rule for the whole customer experience. A short supporting line such as **We're checking this—nothing needed from you** can appear when appropriate without becoming another status.

Do not show alarming red errors for supplier incidents and do not display fake percentage progress. A small four-step progress treatment can make the journey feel active, but animations and countdowns must reflect real state.

For active orders, refresh a tiny indexed status endpoint from Fast Accounts, not the supplier APIs. Poll modestly while the order is visible, back off when unchanged, stop when terminal, pause while the tab is hidden, and refresh immediately when it regains focus. Support `ETag`/`updatedAt` so unchanged checks can return cheaply. Send the existing email/push notification for completion or a required link correction so customers do not have to watch the page. This preserves a live feeling without repeatedly loading order history or wasting Neon compute.

### Context-aware complaints and provider-backed recovery

Every order can report **Nothing was delivered** or **Delivery stopped early** while its support window is open. Drop/refill complaints appear only when the purchased offer snapshot promised refill protection and the complaint is still inside that exact refill period. An Affordable customer must not be invited to claim a drop guarantee they did not buy.

A complaint records the original submitted link, stable platform object ID when one can be resolved, original username, supplier order ID, supplier status, start count, latest observed count and the promise/refill window bought by the customer. A changed username, replaced post, private/deleted target or different resolved object is shown clearly before a refill is attempted because suppliers commonly require the original link to remain unchanged.

The admin review should be one calm case page with **Validate complaint** and **Escalate to provider**. Escalation means:

- call the supplier's refill endpoint when the order is refill-eligible and that provider contract has been verified;
- otherwise create/send a provider support case containing the supplier order ID, original link, complaint type and safe evidence;
- track the escalation reference and poll or remind until resolved.

BulkFollows publicly documents a refill endpoint. SMM Raja's public example currently documents add, status, multi-status, services and balance but not a refill or support-ticket endpoint, so its one-click escalation requires controlled contract confirmation or a provider support-channel adapter. Never pretend a local button contacted the supplier when no supported channel exists.

Fast Accounts does not silently fund a second paid order after a supplier has accepted or charged for the first. Free supplier refill/support is the normal recovery. Any exceptional paid replacement is a separate, explicit owner decision rather than an automatic use of margin.

### Expectations

- Initially say that timing varies by platform and service; do not promise a fixed start time without measured evidence.
- After enough route-level history exists, show plain observed guidance such as **Usually starts within 20 minutes** and **Usually finishes the same day**.
- Derive that wording from recent median and slower-end delivery times, not supplier marketing.
- Show **Refill included** only when both our product promise and the chosen supplier route support the same refill window.
- Never promise an exact completion time.

### Link preview and graceful validation

Upgrade the existing weak link preview into a shared customer-confidence and internal-verification tool, but keep it best-effort. Social platforms can block automated previews, so a missing thumbnail or profile name must never reject an otherwise valid official URL.

- Resolve recognized Facebook/TikTok/Instagram/YouTube/X short links server-side through an allowlisted redirect chain.
- Normalize the final URL and classify profile versus post/video when the platform makes that determinable.
- Use official oEmbed/public metadata where available, then safe Open Graph metadata as a fallback.
- Show a compact preview card with platform icon, image, display name/handle and target type when available.
- If a preview cannot be fetched, show the normalized link and **Open link** action without anxiety-provoking error copy.
- Hard-stop only a definite wrong platform, wrong target type, unsafe scheme/domain or malformed URL.
- Send ambiguous official URLs to the supplier route's accepted-link rules or the quick review queue without forcing the customer to abandon checkout.
- Cache successful previews and short-lived failures by canonical URL; use a short timeout and do not refetch on every keystroke.
- Prevent SSRF with fixed domain/redirect allowlists, public-IP checks, response-size limits and no authenticated browser session.
- Give admins the resolved URL, detected type, preview result and reason for ambiguity; keep those diagnostics away from customers.

## Backend design

### System flow

```text
Payment confirmed
       |
       v
Paid order + fulfilment row (one transaction)
       |
       v
Bounded worker -> eligibility gates -> cheapest reliable route
                                      |                  |
                                      v                  v
                                  SMM Raja          BulkFollows
                                      |                  |
                                      +--------+---------+
                                               v
                                  normalized status + cost
                                               |
                              +----------------+----------------+
                              v                                 v
                    simple customer status             admin work queue
```

### 1. Provider boundary

Create one server-only adapter contract:

```ts
interface BoostProviderAdapter {
	listServices(): Promise<ProviderService[]>;
	getBalance(): Promise<ProviderBalance>;
	submitOrder(input: SubmitBoostOrder): Promise<SubmitResult>;
	getStatuses(providerOrderIds: string[]): Promise<ProviderOrderStatus[]>;
	requestRefill?(providerOrderId: string): Promise<RefillResult>;
	cancel?(providerOrderIds: string[]): Promise<CancelResult>;
	escalateSupportCase?(input: ProviderSupportCase): Promise<SupportCaseResult>;
}
```

Implementation rules:

- Use fixed allowlisted API base URLs; never accept a provider URL from a request.
- Keep `SMMRAJA_API_KEY` and `BULKFOLLOWS_API_KEY` in server environment variables only.
- Form-encode requests exactly as each contract requires.
- Apply short connect/response timeouts and validate every JSON response against a schema.
- Treat HTTP 200 with HTML, empty content or an unexpected shape as a provider failure.
- Never log keys. Store a redacted response summary only when useful for support.
- Unit-test adapters with recorded, scrubbed fixtures before making any paid request.

No additional application encryption key is needed for these API keys; deployment environment secrets are the correct storage layer.

### 2. Simple offer-to-supplier mapping

Every live Fast Accounts customer offer maps to zero or more approved provider service IDs. A platform/outcome category can contain multiple customer offers, but each route must satisfy the exact offer envelope. Never use name similarity during fulfilment.

The normal admin workflow is:

1. Open a customer outcome such as **X Followers**.
2. Keep two or three useful tiers: **Affordable**, **More stable**, and **Premium**.
3. Open one tier and choose **My choice** or **Smart Auto**.
4. For **My choice**, choose SMM Raja or BulkFollows, enter the exact supplier service code, inspect the returned rate/limits/refill facts, and use it as primary or optional fallback.
5. Set the target margin. The configured USD/NGN rate and currency buffer derive the suggested selling price and maximum supplier budget.
6. Accept the rounded suggested price or lock a deliberate selling price, then save.

Standard customer names and promises are generated from the tier. Editing wording is an optional advanced action. Normal-cost targets, recovery percentages, pilot limits, shadow state and other engineering controls stay out of the ordinary form.

Each saved mapping still records:

- Fast Accounts `offerId` and parent `categoryId`
- Provider and provider service ID
- Our reviewed equivalence label and target type
- Quantity min/max and any step restrictions
- Rate, currency and last catalogue sync
- Refill/cancel support and verified refill days
- Quality/speed/region attributes we explicitly promise
- Enabled, shadow-only or paused state
- Routing policy: automatic, preferred or admin-locked
- Maximum pilot quantity, managed internally during canary
- Mapping reviewer and approval date

If no approved candidate is currently safe, the item remains in the manual queue. The router must not guess.

#### Admin-locked services

Some important products already have a supplier service that the owner has tested manually and trusts. The admin must be able to lock a Fast Accounts product to that exact provider service:

- **Automatic** chooses the cheapest eligible proven route.
- **Preferred** tries the selected service first, then uses another approved route when a safe pre-submission failure makes that necessary.
- **Locked** always uses the selected service. Price scoring cannot replace it, and the system must not silently move the order to another provider.

For a locked service, repeated definitive failures raise **Review this route** after a small configurable threshold. A single temporary failure keeps the order safely queued and visible; it does not erase the owner's choice. Structural problems—service removed, incompatible quantity limits, mapping changed or explicit supplier rejection—stop submission and raise review immediately. The owner can unlock, replace or manually fulfil the route at any time. Every policy change records who changed it, when and why.

### 3. Durable records

Keep the existing `OrderItem` fields as the customer/admin summary, and add dedicated records for automation.

#### `BoostCustomerOffer`

The stable customer-facing SKU and its promise envelope:

- platform, outcome/metric and required target type
- audience/region when relevant and quality tier
- short customer name, explanation and expectation chips
- quantity limits/presets and customer price curve
- required speed/retention/refill attributes
- minimum margin, normal cost target, maximum total supplier cost and attempt cap
- recovery modes allowed: refill, remainder top-up and/or conclusive full replacement
- active, hidden or pilot state and display order

Orders snapshot this offer so later copy, pricing or mapping changes cannot rewrite what the customer bought.

#### `BoostProviderState`

One row per provider:

- enabled/paused and circuit-breaker state
- cached balance and currency
- projected balance after locally accepted orders
- catalogue/balance/API last-success timestamps
- consecutive failure count and pause reason

#### `BoostProviderService`

The latest normalized supplier catalogue row plus a change fingerprint. Keep dated snapshots when rate, min/max, availability, refill or cancel support changes.

#### `BoostServiceRoute`

The reviewed mapping between a Fast Accounts customer offer and one supplier service. This is the only table the live router may use.

#### `BoostFulfillment`

One-to-one with a boosting `OrderItem`:

- immutable target URL, quantity and customer-price snapshots
- normalized target key and target type
- internal status, customer status and manual/automatic mode
- selected route, provider and supplier service snapshots
- supplier order ID once known
- quoted supplier cost, final supplier charge, currency and FX snapshot
- maximum allowed supplier cost and projected/final margin
- start count, remains and raw provider status
- attempt count, lease, next action time and last safe error category
- queued, submitted, started, completed and last-checked timestamps

Create this record in the same database transaction that first changes a boosting order to paid. Recovery should also create a missing row idempotently for any already-paid item.

#### `BoostAttempt`

Append-only history for catalogue checks, route decisions, submissions, status checks, refills, cancellations and admin actions. Store request fingerprints and safe summaries—not API keys or unrestricted raw payloads.

Continue writing the existing append-only `OrderEvent` entries for the human-readable order timeline.

#### Active-target guard

Create a canonical target key and prevent overlapping active fulfilments for the same target/action when a provider's rules or refund policy make simultaneous orders unsafe. A later order waits until the earlier one is terminal or an admin explicitly overrides it.

This matters because BulkFollows warns that simultaneous services on the same target can affect refund/refill eligibility.

### 4. Real-time router

“Real time” should mean the decision uses fresh cached prices, balances and health at the moment the paid item is claimed. It should not make the customer wait while two supplier APIs are queried.

#### Hard eligibility gates

A candidate is eligible only when all are true:

- The mapping was explicitly reviewed and is enabled.
- The offer's routing policy permits the candidate; an admin lock narrows the set to one exact service.
- The supplier catalogue still contains the service and the snapshot is fresh.
- Target type, product promise, region/quality attributes and refill window match.
- Quantity is within the current supplier limits.
- Cached/projected balance covers the order plus a safety buffer.
- Projected landed cost is below the per-item cost cap and minimum-margin rule.
- Provider-level and service-level circuit breakers are closed.
- No unsafe overlapping order exists for the same canonical target/action.

#### Ranking eligible candidates

1. Exclude candidates below the configured reliability floor.
2. Compare **landed expected cost**, not the displayed rate alone.
3. Choose the lowest-cost remaining candidate.
4. Break a close tie with better recent start/completion time.

Landed expected cost includes supplier price, currency conversion buffer, historical partial/refund loss and expected refill/support cost. Customer pricing stays fixed from checkout even if a supplier rate changes later.

An admin lock outranks cost scoring. If its exact service is not safely eligible, leave the item queued for review instead of silently buying a different service.

#### Learning without gambling on customers

New mappings have too little history to be called reliable. Start them in shadow mode, then allow only small capped pilot orders. Once both routes have enough comparable orders, reserve a small configurable share of low-value traffic for the runner-up so we continue measuring it. Never explore with a large order.

Use recent service-level outcomes with a conservative provider-level prior so one successful order cannot make a new route look perfect. Keep thresholds configurable; do not hard-code an unearned reliability claim.

#### Circuit breakers

Pause a route or provider when signals such as these cross configured limits:

- repeated API or explicit submission failures
- stale catalogue or balance data
- insufficient balance
- abnormal partial/refund/cancellation rate
- start times materially worse than the service's baseline
- response schema unexpectedly changes

A successful health check may move it to a limited trial state. Full reopening should require enough successful probes/orders or admin approval.

### 5. Failover matrix

| Situation                                                                                      | Automatic action                                                                                       |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Provider is paused, unfunded or ineligible before submission                                   | Choose the next eligible candidate                                                                     |
| DNS/connect failure proven to occur before an order body was sent                              | Choose the next eligible candidate                                                                     |
| Provider explicitly rejects the order and returns no order ID                                  | Record the rejection and choose the next eligible candidate                                            |
| Provider explicitly cancels/refunds with no delivery                                           | Confirm the supplier credit was restored, then safely submit once elsewhere or send to review          |
| Submission times out, returns malformed data or loses the response after it may have been sent | Set `submission_unknown`; do not retry or fail over                                                    |
| Provider returns an order ID, Pending/Processing/In progress                                   | Keep that provider; poll normally                                                                      |
| Partial delivery                                                                               | Record delivered/remains and escalate to the original provider; do not buy the remainder automatically |
| Link is wrong/private                                                                          | Ask the customer for a corrected link                                                                  |
| Both providers are unavailable                                                                 | Keep the paid order safely queued, alert admin, and use manual handling                                |

Automatic failover is for known-safe pre-submission failures, not every error.

#### Provider-backed recovery without duplicate spending

Margin determines whether a supplier service is eligible; it is not permission to keep purchasing until a counter moves. Automatic failover is allowed only before a charge, after an explicit rejection with no supplier order, or after a terminal zero-delivery cancellation/refund whose credit has been confirmed.

Once a supplier accepted or charged for an order:

- Pending, processing, slow, partial, completed or `submission_unknown` states never trigger another paid order automatically.
- Nothing-delivered and stopped-early complaints are validated and escalated to the original provider.
- A drop complaint is available only when the purchased offer promised a still-active refill period.
- Refill uses the original supplier's covered refill/support path and must preserve the submitted target.
- A second paid order, full replacement or out-of-pocket top-up requires an explicit owner decision and is never presented as routine automation.

Internally record each complaint, evidence snapshot, provider escalation, refill response, restored supplier credit, manual decision and final outcome. The customer continues to see a calm **In progress** or **We're checking this** state while Fast Accounts handles the supplier.

### 6. Database-backed worker

Reuse the existing automation job/run/lock pattern and Neon database. Do not add another queue product for the first release.

- Payment settlement creates `BoostFulfillment(status = 'queued')` atomically.
- A `boosting-fulfillment` cron runs once per minute and claims a bounded batch using row leases/skip-locked semantics.
- It submits newly queued items first, then batches due status checks by provider.
- Customer pages read our database only; they never call suppliers.
- Terminal items stop polling.
- Every job run records processed/failure counts through the existing automation runner.

Adaptive status schedule:

- Awaiting start: approximately every 5 minutes.
- Actively delivering: every 10–15 minutes.
- Unchanged for a long time: back off to 30–60 minutes.
- Terminal: stop.

Use BulkFollows batch status for up to 100 orders. Use SMM Raja batching only after its authenticated contract is confirmed; otherwise cap individual calls. This follows BulkFollows' own warning not to poll every 30 seconds and keeps Vercel/Neon compute bounded.

The minute cron means a normally paid order should enter submission within roughly a minute without extending checkout. If later volume or latency evidence justifies it, a managed queue can replace only the dispatch mechanism without changing the data model.

### 7. Catalogue, balance and cost controls

- Sync service catalogues about every 30 minutes, with jitter and change detection.
- Check balances about every 10–15 minutes and maintain a local projected balance between checks.
- Pause only the affected route when a service disappears or its limits change.
- Hold a paid item for review if the live cost exceeds its stored maximum supplier-cost cap.
- Allocate order discounts, gateway fees and affiliate cost consistently when calculating contribution margin.
- Store supplier charge in its native currency and the NGN FX rate used for reporting.
- Treat store credit as a payment source, not automatically as a discount; record promotional-credit cost separately where applicable.
- Record credits from cancelled/refunded/partial supplier orders so reported cost is not overstated.

This cost ledger is also the missing foundation for any future Numbers/Boosting incentive decision.

### 8. Normalized internal states

Use precise internal states such as:

`queued`, `routing`, `submitting`, `submission_unknown`, `submitted`, `pending`, `in_progress`, `partial`, `refill_requested`, `completed`, `cancelled`, `refunded`, `needs_link`, `manual_review`, `failed_terminal`.

Persist the raw provider status alongside the normalized state. State transitions must be monotonic unless a documented refill/cancel/reopen action explains the reversal.

## Admin experience

Extend the improved Boosting Orders screen rather than building a separate disconnected tool.

The normal admin state should require no action. Refresh catalogues and balances on schedule,
route eligible orders automatically, poll active orders with backoff, fail over only on proven-safe
failures, and send customers routine progress updates automatically. Alert the admin only for a low
balance, an ambiguous submission, a link that needs correction, no safe route, a broken supplier
contract, or a route whose measured performance has deteriorated. Keep adjustable controls to a
small set of business guardrails—price, minimum margin, spend cap, and an optional provider lock—so
the owner does not have to tune individual orders or repeatedly monitor healthy ones.

### Work queue

Use five primary views:

- Ready to start
- Starting
- In progress
- Needs review
- Completed

Default to newest actionable items, with search, date range, provider, service and status filters. Preserve the existing paging and bulk-link workflow for manual orders.

Each order row should show:

- placed/paid/last-updated dates
- customer, product, target and quantity
- automation/customer status
- selected provider and supplier order ID (admin only)
- supplier cost, customer revenue and expected margin for authorized admins
- start count/remains when meaningful
- clear next action

Actions:

- retry a known-safe failure
- reconcile an unknown submission
- refresh status
- validate a context-appropriate customer complaint
- escalate to the provider through a verified refill API or support channel
- request refill or cancel only when verified as supported
- correct/approve the mapping
- switch to manual handling
- ask customer to fix the link with a short reason
- mark complete/reject through the existing audited flow

### Provider health

One compact operations panel should show:

- current and projected balances
- API/catalogue last success
- open circuit breakers and reason
- submission acceptance, full-completion and partial/refund rates
- median time to start/finish by route
- queued and oldest-waiting counts

Alerts should cover low balance, stale catalogue, no viable route, `submission_unknown`, schema changes and deteriorating route outcomes.

### Mapping workspace

The main UI follows the provider-code workflow above. It must not begin with thousands of rows or show automatically suggested services as already selected.

- Outcome first: **X Followers**.
- Tier second: **Affordable**, **More stable**, or **Premium**.
- Mode third: **My choice** or **Smart Auto**.
- For **My choice**, provider + exact service code returns one unambiguous service card with rate, converted cost, limits, refill facts and last sync.
- One action maps it as primary; an optional second action adds a fallback.
- For **Smart Auto**, show the plain eligibility/reliability rules and the current likely winner, not a long editable route list.
- Show target margin, suggested rounded selling price and optional **Lock price**. Derive the spend ceiling internally.
- Put customer wording and engineering diagnostics under **Advanced**.

The first catalogue import may classify and rank candidates for Smart Auto, but it must not create visible “selected routes.” Supplier names and marketing words are not reliability ratings. As canary history grows, measured delivery and complaint/refill outcomes replace provisional signals. An exact owner-selected service always outranks automatic scoring until changed.

## Measuring reliability honestly

Record these from our own orders:

- API availability and successful submission rate
- time from paid to supplier acceptance
- time to first start and full completion
- full, partial, refunded and cancelled outcomes
- delivered quantity/remains
- refill requests and recovery outcome
- manual interventions and support incidents
- final landed cost and contribution margin

Supplier status is evidence, not truth. Where an official platform interface permits it, capture an independent counter snapshot immediately before submission and at sensible intervals afterward. Compare the net change with the ordered quantity and retain timestamped evidence. If a provider says **Complete** while the visible metric did not materially move, flag **delivery unverified** rather than rewarding the route's reliability score. If the visible metric reaches the target while the provider still says **In progress**, show the customer a calm completed result while continuing supplier reconciliation internally.

Independent verification is confidence-based, not universal or indisputable:

- YouTube exposes public video view/like/comment counts, but channel subscriber totals can be hidden or rounded.
- X exposes public profile metrics through its developer API when Fast Accounts has suitable API access.
- TikTok exposes video counters through its Display API for an authorized creator; broad public-profile research access is restricted.
- Spotify exposes artist follower totals, but not a general exact stream/monthly-listener counter suitable for every order.
- Telegram can expose channel/group member counts through the Bot API when the target is accessible to the bot.
- Instagram/Meta access depends on account type, app review and authorization; arbitrary consumer-profile verification cannot be assumed.

A net counter increase still cannot prove which supplier caused it because organic activity and removals can happen at the same time. Use independent counters to strengthen or challenge supplier status, validate obvious no-delivery cases and prioritize complaints—not to accuse customers or promise perfect attribution. Do not make fragile page scraping a required fulfilment dependency.

Do not count a private, deleted or wrong customer link as supplier unreliability. Report both recent rolling performance and lifetime sample size. Prefer route-level data; fall back conservatively to provider-level data when a route is new.

## Privacy and expectation controls

- Send suppliers only the public target URL, service ID and quantity required for fulfilment—never customer name, email, password or payment data.
- Retain target links only as long as operational/support requirements justify.
- Keep provider terms and social-platform-policy risk in the business review. Automation makes fulfilment faster; it does not remove those risks.
- Never copy a supplier's optimistic delivery wording directly into customer promises.

## Rollout

### Phase 0 — authenticated discovery, no orders

- Both funded supplier accounts and their read-only services/balance authentication were confirmed on 10 September 2026. No supplier orders were placed.
- Keep the current keys only in ignored local environment configuration for contract work. Rotate them before production, then store the replacements as server-only Vercel secrets.
- Pull real catalogues and confirm currencies, schemas, rate limits, batch status, error responses, refill/cancel and support escalation.
- Ask both providers explicitly whether any hidden client reference/idempotency mechanism exists.

### Phase 0.5 — offer catalogue and UX prototype

- Normalize the real service catalogues into platform, outcome, target type, audience, quality/refill, limits and cost attributes.
- Build the platform/outcome coverage matrix and identify missing, single-route and redundant offers.
- Draft no more than two primary customer choices per major outcome, adding a third only when testing supports a distinct benefit.
- Prototype the mobile selection flow with fixture offers and deep links before connecting any paid fulfilment.
- Run the comprehension and task tests in the UX acceptance criteria; revise labels before backend automation makes them expensive to change.

### Phase 1 — read-only integration

- Build adapters, catalogue/balance sync, schema monitoring and provider-health admin panel.
- Place no supplier orders.

### Phase 2 — shadow router

- For every manually handled paid order, record which route the system would have selected and at what projected cost.
- Compare those decisions with actual manual outcomes for at least one meaningful operating window.

### Phase 3 — controlled canary

- Automate a few precisely mapped, low-value services with strict per-order and daily spend caps.
- Keep ambiguous links and large quantities manual.
- Start with one primary route while measuring the other in shadow; enable safe failover only after both pass contract tests.

### Phase 4 — dual-provider routing

- Enable cheapest-reliable selection only for product pairs proven equivalent.
- Expand service by service, not platform by platform.

### Replacement cutover

- Keep the current Boosting customer and admin flows available only while the replacement is being
  proven in staging, shadow mode and the controlled canary.
- Before removal, prove cart/checkout parity, order-history continuity, manual recovery, link
  correction, notifications, refunds and admin audit history.
- Then route all Boosting traffic through the replacement and remove the retired customer UI, admin
  UI, endpoints and unreachable compatibility code in one deliberate cleanup. Preserve historical
  order data and the migration path; do not maintain two active Boosting systems indefinitely.

### Phase 5 — advanced recovery

- Automate eligible refills and carefully reviewed partial-delivery recovery.
- Keep ambiguous submission recovery manual unless providers add idempotency or searchable client references.

### Phase 6 — revisit incentives

- Resume the paused incentive study after supplier cost/outcome data is mature enough to protect margin.

## Test plan

- Adapter contract fixtures for every documented response and state.
- Invalid JSON, HTML 200, missing fields, rate limits, auth failure and slow/time-out responses.
- Changed price/min/max/service availability between checkout and submission.
- Low balance and stale catalogue.
- Two workers attempting to claim the same item.
- Payment recovery creating the fulfilment exactly once.
- Ambiguous submission proving there is no automatic retry/failover.
- Explicit safe rejection failing over once.
- Offer envelopes excluding cheaper candidates that do not satisfy the selected customer promise.
- Customer price and promise snapshots remaining unchanged when routes or catalogue data change.
- Automatic, preferred and locked policies choosing only the routes they are allowed to use.
- Locked service failure remaining queued without a silent supplier switch, then raising review at the configured threshold.
- Removed or structurally incompatible locked service raising review immediately.
- Full replacement occurring only after conclusive zero delivery and only within the offer's attempt/cost caps.
- Partial recovery ordering only the verified remainder and stopping at the recovery budget.
- Partial, cancelled, refunded, refill and terminal-state reconciliation.
- Facebook profile/page/post/share URLs and TikTok profile/video/vm/vt/t share URLs.
- Private/wrong/deleted target correction.
- Active-target overlap protection.
- Customer pages never exposing provider data or raw errors.
- Mobile offer-selection tests for progressive disclosure, deep-link expansion, preserved input, immediate pricing and cart feedback.
- Admin permissions and append-only event audit.
- Bounded-query/compute checks with a realistic active-order volume.

## Release gates

- Zero duplicate supplier orders in concurrency and timeout tests.
- Every paid Boosting item has exactly one fulfilment record and a complete event trail.
- Checkout/payment response time is unaffected by supplier latency.
- Every automated order records provider, route, final cost and outcome.
- Every live customer offer has a concise tested promise and at least one approved route; major outcomes target two routes where genuinely equivalent supply exists.
- No recovery path can exceed the snapshotted attempt or supplier-cost cap without an audited admin override.
- Safe pre-submission provider failures route to an eligible backup.
- Ambiguous submissions stop for review.
- Customer copy remains short and supplier-agnostic.
- Admin can finish every order manually if automation is paused.
- Daily spend, per-order quantity and minimum-margin limits are enforced server-side.
- Both provider adapters pass authenticated contract tests before handling real orders.
- Fast Accounts' Boosting FAQs, terms, help text and order-status copy have been reviewed against both suppliers' current terms, FAQs and operating guidance, rewritten in our own plain language, and approved word-for-word by the owner.

## Target audience working profile

Design and copy decisions currently assume that many Fast Accounts customers:

- browse and pay on mobile, often through Nigerian payment methods and in naira;
- have mixed technical confidence and want the desired result, price and next action to be obvious;
- are short on patience for reseller-panel terminology, long explanations and large service lists;
- include both price-sensitive buyers and buyers willing to pay more for a clearer, more stable promise;
- need calm reassurance around payment, public links, delivery timing, drops/refills and what happens when something goes wrong;
- may return for repeat orders, so remembered choices, deep links and quick reordering matter;
- should never need to understand supplier routing, raw API statuses or internal recovery attempts.

This profile comes from the owner's customer knowledge, support issues and the existing purchase flow. It is a working hypothesis, not a demographic fact. Do not invent assumptions about age, gender or occupation. Validate it after launch with funnel data, support themes and a small number of real customer usability conversations.

## Customer policy and expectation review

The public supplier-policy review was completed on 19 September 2026. Both providers' current terms, service guidance and practical API/refill material support the same conservative customer rules:

- delivery times are estimates and vary by service, quantity and platform conditions;
- the customer must supply the exact requested public link and keep it accessible during delivery;
- refill is service-specific, applies only when explicitly offered and must be assessed within the stated window;
- overlapping services for the same target and result make delivery and drop-off unsafe to measure, so Fast Accounts should queue the later order;
- an undelivered or explicitly cancelled portion can be reconciled, but a completed portion and ordinary drop on a no-refill option do not create a blanket refund promise; and
- supplier labels such as “premium,” “real,” “non-drop” or a stated speed remain advertising claims until Fast Accounts' own canary outcomes support them.

Those findings are now reflected in Fast Accounts' Boosting help, how-it-works, service-card, checkout, order-status, confirmation-email, marketing CTA, Terms and Refund Policy copy. The wording stays supplier-agnostic and deliberately avoids raw panel rules. The owner still reviews the resulting customer-facing words before live automated fulfilment.

Before live automation, keep these areas aligned whenever a supplier policy or approved offer promise changes:

- FAQs and help centre;
- terms, refund/refill and acceptable-use wording;
- service-card promises and **What to expect** disclosures;
- checkout reminders, order statuses, link-fix messages and support replies.

Keep the result short, accurate and in the Fast Accounts voice. Supplier wording is evidence to check, not copy to publish, and our promise must never be broader than the routes approved to fulfil it.

## Information still required from the providers

- API keys and account currency (stored only as server secrets)
- exact authenticated service catalogues and rates
- documented rate limits and recommended polling limits
- every error/response variant for order submission
- confirmation of multi-status parameters and maximum batch size
- whether a client reference or idempotency facility exists
- exact cancel/refill eligibility and timing
- partial/cancel/refund credit behaviour
- balance top-up options and support escalation path

## Official references

- SMM Raja API documentation: https://www.smmraja.com/?page=api
- SMM Raja public API example: https://www.smmraja.com/example.txt
- SMM Raja Facebook service guidance: https://www.smmraja.com/facebook-smm-panel
- SMM Raja Instagram service guidance: https://www.smmraja.com/instagram-smm-panel
- BulkFollows API documentation: https://bulkfollows.com/api
- BulkFollows automation guidance: https://bulkfollows.com/blog/how-to-use-an-smm-panel-api-to-automate-your-reseller-business
- BulkFollows terms: https://bulkfollows.com/terms
- BulkFollows refill/refund guidance: https://bulkfollows.com/blog/bulkfollows-refund-and-refill-policy-what-every-smm-reseller-needs-to-know
