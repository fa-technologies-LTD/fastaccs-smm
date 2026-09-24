# Current sprint checkpoint

Paused on: 24 September 2026  
Branch: `test`  
Checkpoint base commit: `13b6423` (`fix: keep locked boosting reviews shadow-only`)

This file is the restart point for the Boosting automation sprint. The homepage banner and copy edits made alongside this checkpoint are a short diversion; they do not change the Boosting direction below.

## Exact current state

- The permanent Neon staging branch is connected and guarded from accidental production-database writes.
- The first real supplier catalogue is imported into staging: 12,007 normalized services, comprising 6,230 SMM Raja rows and 5,777 BulkFollows rows.
- The initial generator created 101 hidden tier offers and 390 unapproved, shadow-only route suggestions across 37 core platform/outcome categories.
- No generated category, offer or supplier route is published.
- No supplier order has been submitted by the new system and no customer order is connected to it.
- Scheduled six-hour catalogue and supplier-balance refresh exists.
- Supplier service, balance, submission and status adapters exist and are contract-tested, but paid submission is deliberately disconnected from fulfilment.
- The router can simulate routes and store shadow observations. It cannot place a paid order.
- The current customer preview is illustrative and hard-coded; it is not yet reading the saved staging offers.
- The current mapping screen is too engineering-heavy. Its generated suggestions look like configured routes even though they are unapproved. That screen is being replaced, not polished as the final workflow.
- Production contains only the additive, empty Boosting foundation tables; the unfinished router, mapping workspace and paid supplier submission are not live. The existing Boosting system must remain available until replacement parity is proven.

## Locked product direction

Customers see a small, calm catalogue—not either supplier's raw catalogue. For a normal outcome such as X Followers, show at most:

- Affordable
- More stable
- Premium

Only show tiers that represent a real difference in price, retention/refill coverage, audience or another tested benefit. Supplier identities, service codes and technical routing remain internal.

Each tier uses one of two admin modes:

- **My choice:** the owner selects an exact provider and service code, with an optional compatible fallback.
- **Smart Auto:** the router chooses the cheapest currently healthy, proven service that satisfies the tier promise and commercial rules.

The replacement setup flow is:

1. Open an outcome, for example X Followers.
2. Choose the two or three customer tiers to offer.
3. Open one tier.
4. Choose My choice or Smart Auto.
5. For My choice, choose SMM Raja or BulkFollows and enter the exact supplier service code.
6. Show the matched service name, supplier price, quantity limits and advertised refill information.
7. Map it to the tier; optionally add a fallback.
8. Set the target margin.
9. Accept the suggested customer price or lock a manual selling price. Customer prices remain rounded to the nearest ₦50.
10. Save.

Tier names, customer promises and normal safeguards should be pre-filled. Copy controls, pilot controls, route evidence and detailed cost maths belong under **Advanced**, not in the everyday setup path.

## Pricing and spending rules

- Use one admin-controlled USD/NGN conversion rate and currency buffer, as the Numbers service does.
- The target margin derives the supplier budget and suggested customer price.
- The owner can lock a different customer price for a specific tier.
- Show the expected supplier cost, gross margin and remaining safety room plainly before save.
- Never treat margin as permission to keep buying the same result automatically.

## Fulfilment and retry rules

- Route once before submitting.
- Never race both suppliers.
- Automatically try another route only when it is certain that no supplier order was created and no charge occurred.
- A timeout or malformed response after submission becomes `submission_unknown`; freeze it for reconciliation instead of risking duplicate delivery.
- A supplier saying `completed` is evidence, not indisputable proof that delivery happened.
- Do not automatically place a second paid order after an accepted or charged attempt.

## Complaints, drops and refill recovery

- Every customer may report **nothing delivered** or **delivery stopped early**.
- Refill/drop complaints are available only when the purchased tier promised refill protection and its stated window is still open.
- Promise a defined refill period, such as 30-day refill protection, rather than “never drops.”
- Affordable does not receive an automatic paid replacement.
- More stable uses included supplier refill protection when the chosen service provides it.
- Premium uses the locked provider's included refill route first. An exceptional paid replacement always requires an owner decision.
- Preserve the original target and detect obvious eligibility problems such as a changed username/link, private profile or deleted target.
- The intended admin action is: validate the complaint, then press one **Escalate to provider** action.
- BulkFollows documents a refill endpoint. SMM Raja's working refill/support route still needs controlled canary confirmation before one-click escalation is enabled.

## Reliability model

Do not trust supplier labels alone. Build Fast Accounts' reliability score from our own accepted/rejected orders, start and completion time, partial/cancelled outcomes, customer complaints, drops, successful refill requests and manual operational work.

Independent platform checks may be added only where official APIs provide stable, permitted counters. Counter changes are useful evidence but cannot universally prove supplier attribution. Fragile scraping must not become required infrastructure.

## Exact restart sequence

1. Build the simplified provider-code, My choice/Smart Auto setup flow above as the next active sprint task.
2. Remove or reset the 390 provisional staging selections so suggestions cannot be mistaken for configured mappings.
3. Connect the customer preview to persisted staging offers.
4. Use the new flow to map the known Premium X Followers service and a very small first offer set.
5. Run the router only in shadow mode beside manually fulfilled real orders and compare its choices with the owner's choices.
6. Finish paid submission and status polling with idempotency, bounded retries and `submission_unknown` protection.
7. Add the context-aware complaint, validation, refill and provider-escalation flow.
8. Run a limited, low-value canary and record real reliability/cost evidence.
9. Connect the replacement flow fully to cart, checkout, order history, email/notifications and the exceptions-only admin queue.
10. Retire the old Boosting customer/admin system only after functional and operational parity is proven.

The Boosting automation foundation and automated paid fulfilment remain test-only until this sequence is complete and has passed isolated staging, shadow and controlled-canary verification.

## Do not lose these gates

- No paid submission without the owner's approved wording and a controlled canary.
- No service becomes live merely because it exists in a supplier catalogue.
- No automatic paid duplicate/retry after acceptance or charge.
- No production-data experiments for mapping development.
- No removal of the old Boosting flow before the replacement passes checkout, fulfilment, history, notifications, complaints and admin recovery end to end.

## Checkpoint verification

- Svelte/type checking passes with 0 errors and the existing 121-warning baseline.
- The production build passes, including the affiliate-encryption configuration check.
- Formatting and diff-integrity checks pass.
