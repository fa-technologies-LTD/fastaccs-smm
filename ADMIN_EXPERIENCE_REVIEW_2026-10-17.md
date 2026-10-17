# Admin workflow completion — local review, 17 October 2026

## Boundaries

This pass strengthens the existing Boosting price-review workflow and shared admin
navigation. It does not redesign Numbers pricing, change owner prices/quantities/mappings,
approve suppliers, select/rank services, activate offers, add learning/automatic retries,
send email, run production migrations or release anything. No push/merge/deploy is authorised.

## Completed

- Price/quantity/description/lock/Live drafts remain one final reviewed Save. Ctrl/Cmd+S
  opens that same review; it cannot submit it or bypass confirmation.
- Show edited-row markers, draft visibility labels, changed-offer/rule counts and honest
  operation labels. “Live now” filters the saved live state, not pending checkbox ticks.
  Add unsaved/ready filters, code/provider search, visible result counts and Clear filters.
- Discard requires confirmation and only replaces this tab's draft. Read-only Reload saved
  requires confirmation before replacing unsaved work; failed/malformed reads keep drafts.
  Export remains available to keep a copy before explicitly replacing a draft.
- A failed/ambiguous Save never turns into a success message. Its draft is kept; uncertain
  responses block another Save until the saved state is checked. Definite validation
  failures remain editable. No automatic write retries, price approvals or conflict merges.
- Reload and supplier-detail reads have bounded waits. Reloading stored supplier details
  does not sync catalogues, change mappings, spend money or save settings. Per-provider
  balance refresh remains independent and read-only.
- Admin dialogs support Escape, focus trapping/restoration and reference-counted background
  scroll locking. Mobile navigation has named controls/expanded state, the same keyboard
  protections, and closes when resizing to desktop. The most-specific sidebar destination
  stays active, so Numbers Orders does not also highlight Numbers Pricing.
- Suppress duplicate exact warnings; distinguish estimated quote-based profit from recorded
  order profit; label pricing quantity clearly. Reuse draft-change calculations and currency
  formatters to avoid rebuilding the same work on each price edit.

## Important limitations

Drafts are not silently autosaved to production or durable browser storage. Leaving/reloading
still warns about unsaved edits. Explicit discard/reload intentionally replaces the draft;
export first when a copy is needed. A checked Live box is still a draft until final Save.

Real funding, mapping, input, quantity and promise-verification problems remain blockers.
The saved Facebook Comments `s4975` record is review-only; fixing the old paused-service
display does not activate it. Supplier readiness and production rollout are not completed by
this UI pass. Existing paid/refunded orders and their purchased snapshots are unchanged.

## Verification and handoff

Completed: 237 server suites / 1,764 tests; 18 browser suites / 118 tests, including a
120-offer edit-isolation case; zero type errors / 113 remaining warnings. Sequential
verified-staging build and bootstrap guard passed. Native 1360/390px sample walkthroughs
passed with no page errors or write requests, and the refreshed 5181 built preview passed
mobile startup/overflow checks. Real authenticated, rollback-only separate-staging Save →
stored prices/quantities → storefront → acknowledged ₦500 unpaid checkout passed, including
known-unavailable and stale-cart refusal. Fake gateway only; zero real payments, provider
calls, emails or production changes. Rollback and independent fixture cleanup verified.

The checkpoint in SPRINT_COMPLETION_TODO.md records final test/build/native walkthrough and
rollback-only staging results. Fixtures/mocked responses are not supplier delivery evidence.
Tests, type checking, build and native walkthrough should run sequentially when checking the
final artifact; concurrent generated files and heavy screenshot/type-check work can interfere
with the existing dev server or exhaust test timeouts. Do not restart price-review port 5173
or reload the owner's browser tab over unsaved edits.

Review localhost first, then request explicit release approval. Universal follow-ups remain:
SEO/indexing/marketing with Claude, support inbox verification, approval before announcements,
retention/refill evidence, production/cold-load performance and deferred cleanup.
