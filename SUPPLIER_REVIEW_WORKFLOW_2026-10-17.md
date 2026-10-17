# Manual supplier review — local implementation, 17 October 2026

Owner approved a smooth pricing-page picker with exact-service overrides and one final
Save, reviewed localhost and then explicitly requested “looks good, push”. The reviewed
code release is approved; deployment/live checks are pending. No migration, production
catalogue/mapping/price change, supplier order or manual outbound email is authorised.

## Owner workflow

1. Click the source name or **Choose supplier**. Search the stored catalogue by name,
   or select SMM Raja/BulkFollows and enter the exact code (including an `s` prefix).
2. Compare cost at the current draft dollar rate, quantity limits and advertised refill
   terms. Incompatible rows state why and cannot be selected. Account/claim issues are
   shown separately as requirements before publication.
3. **Use this service** changes the draft only. A manual price/lock and quantity settings
   stay intact. Rule-following prices recalculate for the chosen service; locked prices
   do not. Close/cancel/undo/inspection never saves or publishes.
4. Review price and quantity settings; tick Live only for ready offers. Preloaded shadow
   mappings no longer require a hidden separate approval screen.
5. The existing final Save review lists the supplier selection/approval, cost, other edits
   and publication intent. Confirm once. Unticked offers stay offline.

Specific selections become locked mappings, not suggestions for an automatic selector.
Existing multi-service preloads remain explicit lists in the review. Historical paused
routes are not silently revived. No selection/ranking/learning/automatic retry changes.

## Safety and implementation

- Picker reads cached catalogue only, bounded to 30 alphabetical matches with refine-search
  guidance. Abortable/debounced requests; timeout, retry and empty states. Existing offers
  use a direct authenticated offer lookup instead of rebuilding the sheet per keystroke.
- Draft IDs/quote revisions are separate from immutable display metadata. Final Save resolves
  the actual service server-side; it never trusts browser-supplied prices, supplier names,
  claims or approvals. Changed mappings/costs require renewed review, with drafts preserved.
- The existing transaction/advisory lock includes supplier approval, any necessary missing
  offer, exact mapping, pricing, visibility and audit. Supplier-only changes also require
  explicit confirmation. Automated repricing and legacy price-only saves cannot select or
  approve suppliers. Going offline still works after supplier facts change during an outage.
- Only an explicit supplier approval can review a new cost ceiling; ordinary price edits
  retain the old ceiling. Profit/funding/freshness/input/quantity/checkout guards still run.
  New-minimum cost approval avoids double-rounding down by a kobo.
- Existing route evidence/reliability/history, customer promises and paid-order snapshots
  are not rewritten or fabricated. Supplier-advertised refill is not verified cover.
- Genuine unsupported results, unavailable services or unverified promises remain blockers;
  the picker is not a bypass or a promise that every catalogue row can launch.

## Verification

- Full server regression: 241 suites / 1,808 tests pass. Final canonical-audit follow-up:
  73 focused server tests pass.
- Full Chromium regression: 18 suites / 122 tests pass. Existing test-runner teardown
  diagnostics remain; suites pass and exit zero.
- Type check: zero errors / 113 existing warnings. Verified-staging build and matching
  client/server startup identities pass.
- Actual 1360px/390px localhost sample walkthrough: exact-code search, draft choice,
  preserved price/quantities, final supplier review, cancel and undo pass. Zero page errors,
  horizontal overflow or network writes. A transient old Vite overlay was absent on fresh
  navigation; rerun passed without restarting the owner server or touching their tab.
- Final built-app separate-staging rehearsal passed: real synthetic login, preloaded supplier
  approved through final Save, unmapped offer exact-code selection saved/pinned, canonical
  supplier audit, storefront and correct ₦500 unpaid checkout. Known unavailable offers
  hidden and stale carts refused. Fake gateway only; zero supplier calls, real payments,
  emails, blocked external requests or production changes. Transaction rollback and
  independent fixture cleanup verified.

Preview: http://localhost:5173/local-review/boosting-pricing (fictitious data only).
Current sprint: approved code push/deployment verification → owner production review and
selected publication. Save/export any existing draft before opening the updated admin in
a fresh tab; the agent does not approve or publish production offers.
Universal: SEO/indexing/marketing with Claude, support inbox verification, approved
announcements, retention/refill evidence, production performance and deferred cleanup.
