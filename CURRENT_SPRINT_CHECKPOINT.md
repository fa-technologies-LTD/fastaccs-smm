# Current sprint checkpoint

Updated: 25 September 2026
Branch: `test`
Base before this sprint: `926fb96` (`docs: close release cleanup`)

This is the handoff point for the replacement Boosting workflow. The implementation is complete on
`test` and is intentionally safe by default. It must pass owner walkthrough, shadow comparison and a
small controlled canary before it can replace the existing production Boosting flow.

## Completed in code

- Replaced the engineering-heavy mapping workspace with the agreed setup flow:
  choose outcome → choose tier → My choice or Smart Auto → exact supplier-code lookup → price/margin
  review → optional fallback → save.
- Kept the customer catalogue deliberately small. Supplier identities and thousands of raw services
  stay internal.
- Added one shared USD/NGN conversion setting and currency buffer, target-margin pricing, prices
  rounded to ₦50 and an optional locked selling price per offer.
- Added a database-backed private customer preview. Reviewed offers can be inspected privately;
  only offers explicitly marked `live` can appear in the public store.
- Connected live replacement offers to service pages, cart refresh, checkout, paid-order recovery,
  customer order history and completion notifications.
- Added durable fulfilment state, leases, idempotent submission records and supplier status polling.
- Added strict retry protection: another supplier route is tried only after a definite rejection where
  no supplier order was created and no charge occurred. Timeouts and ambiguous replies become
  `submission_unknown` for manual reconciliation and are never blindly resubmitted.
- Added an exception-focused Boosting orders screen. Normal mapped orders are handled by automation;
  the page concentrates operator attention on shadow decisions, unknown submissions and complaints.
- Added context-aware customer complaints. Everyone can report no delivery or an early stop; refill
  complaints are offered only when the purchased promise included refill protection and the window
  remains open.
- Added complaint validation, audit events, customer updates and admin alerts.
- Added one-click BulkFollows refill escalation with duplicate-click and ambiguous-response protection.
  SMM Raja refill escalation remains manual until its undocumented contract is proven in a canary.
- Added catalogue/balance refresh and fulfilment worker schedules.
- Removed the temporary Boosting preview/setup links from the permanent admin navigation. The private
  preview remains directly accessible for this verification sprint.
- Added a guarded staging cleanup command. It refuses production, refuses preferred/locked routes and
  removes only untouched auto-generated shadow suggestions.

## Staging database state

- Target: isolated Neon staging branch `ep-calm-term-a4byqp53`.
- Supplier snapshot retained: 12,007 normalized services (6,230 SMM Raja and 5,777 BulkFollows at the
  time of the original import).
- Both Boosting migrations are applied:
  - `20260911150000_add_boost_automation_foundation`
  - `20260925120000_complete_boosting_workflow`
- Seven expected Boosting tables and all safety indexes verify successfully.
- The 390 untouched provisional route suggestions were removed.
- No preferred or locked route was removed.
- No paid supplier order was placed by migration, cleanup or verification.

## Safety state

- `BOOSTING_AUTOMATION_MODE` defaults to `shadow` when missing or invalid.
- Shadow mode calculates and records a route but cannot contact a supplier.
- Even in `pilot` or `live`, only owner-reviewed routes explicitly changed to `enabled` are eligible.
- Supplier calls are serialized; the worker never races two providers.
- An accepted, charged or uncertain attempt cannot trigger an automatic second paid order.
- Public visibility and supplier submission are separate gates. Publishing an offer does not by itself
  approve a supplier route for paid automation.
- The existing production Boosting system remains intact until parity is proven.

## Verification completed

- Unit/integration tests: 133 files passed, 779 tests passed.
- Browser checks: 4 passed against the production preview build.
- Svelte/type check: 0 errors; 123 existing warnings remain.
- Production build: passed under Node 20.19.4.
- Diff integrity: passed.
- Staging schema and safety probe: passed, including zero provisional generated routes.

## Owner walkthrough on localhost

1. Open `/admin/boosting-mappings`.
2. Choose a small outcome such as X Followers and open Premium.
3. Choose **My choice**, select SMM Raja or BulkFollows and enter a real supplier service code.
4. Confirm the exact service name, supplier price, quantity limits and refill wording.
5. Set the target margin; confirm the suggested rounded price, or lock a manual price.
6. Optionally add one compatible fallback and save.
7. Open `/admin/boosting-preview` and confirm the customer wording and quantities.
8. Keep the offer reviewed/private first. When satisfied, mark only that small offer live in staging and
   verify its service page, cart and checkout presentation.
9. Run a normal manually fulfilled order beside shadow routing and compare the suggested route with the
   route you would have chosen.

## Gates that intentionally remain after the localhost walkthrough

These are rollout evidence, not unfinished feature code:

1. Configure only the small first offer set the owner actually wants to sell.
2. Accumulate shadow comparisons against manual orders.
3. Run one limited, low-value paid canary with an explicitly enabled route and observe submission,
   polling, history, completion notification and complaint recovery.
4. Confirm the working SMM Raja refill/support contract before automating that provider's escalation.
5. Merge `test` to production only after the canary passes.
6. Retire the old Boosting customer/admin system only after replacement parity is proven in production.

## Do not weaken these rules

- No service becomes live merely because it exists in a supplier catalogue.
- No paid submission without an owner-approved route and controlled canary.
- No automatic paid duplicate after acceptance, charge or ambiguity.
- No production-data experiments.
- No claim of “never drops”; promise a specific refill period when the chosen service actually supports it.
