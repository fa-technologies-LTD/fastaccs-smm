# Current sprint checkpoint

Updated: 10 October 2026

## Owner-requested temporary pause — latest operational state

The owner requested Boosting be taken offline while reviewing pricing and catalogue structure. All eight live offers were reversibly returned to reviewed status; zero live offers independently confirmed through the public API. Prices, quantities, margins, supplier routes and already placed orders were preserved. The managed-storefront marker remains active to prevent the retired catalogue from resurfacing. Accounts and Numbers are outside this pause. A lightweight CSS/SVG upgrade screen uses the owner's wording, “We’re upgrading this section…”, and respects reduced-motion preferences. Do not republish without the owner's next instruction; no new supplier tests or pricing changes are approved by this pause.

The release notes below describe the preceding launch, not the current publication state.

## Release checkpoint — supersedes historical deployment blockers below

Fresh private production backup is validated (archive listing and complete decode; a full separate restore remains untested). Exactly the three safety migrations for the webhook inbox, refund recovery tasks and refill tracking were applied with Prisma and independently verified in production. All five explicitly approved internal supplier-cost limits are saved; customer selling prices are unchanged. Four unreviewed custom-comment drafts now have separate input categories; the provider row ambiguously labelled Default is paused, not assumed usable.

Fresh real-catalogue simulation uncovered and fixed unrestricted general-audience routing and floating-point cost-ceiling failures. Added checkout guards against legacy-cart cutover bypass and cached unavailable/cross-platform services. Public offers and new managed checkout fail closed unless production dispatch is live. Boosting quotes now round upwards consistently to the next 50-naira boundary; supplier costs, historical payments and refunds remain exact.

Final combined code verification: 175 server suites / 1,210 tests pass; isolated browser suites 4 / 12 assertions pass with the previously recorded development-tool teardown warnings; supplier-spend policy 8 tests pass; typecheck has zero errors / 121 explicitly deferred warnings; production build and whitespace checks pass. Claude's five existing commits are integrated, including marketing admin and per-app/country Numbers pages; her source files and separate marketing worktree are unchanged by this sprint.

The final 10 October separate-staging recovery walkthrough also passed all nine application/PostgreSQL checks. Schema and fixture changes rolled back independently; zero external calls and no production changes. This is database/application evidence, not a real Monnify charge or refund claim.

The owner enabled Production live dispatch and redeployed revision `01f37ee`; the public API and same-revision naturally scheduled worker both verified live mode. A new validated private backup preceded publication. Exactly eight reviewed/test-confirmed offers are now live, with retail prices, quantities and margins independently preserved; the other 96 rows, including duplicate Facebook follower tiers, remain unpublished. The public API exposes no tested private supplier/cost fields. A read-only real-browser walkthrough passes at 390px and 1440px, including minimum-quantity adjustment, custom-comment input and no whole-page overflow or browser errors. No additional supplier purchase or refill request was made. Existing provider tests now report terminal results, but provider completion is not proof of visible delivery; observed Instagram like counts remain 11 and 10. Long-term retention, uncertain follower submission and a real refill contract remain held evidence tasks, not blanket claims.

The post-launch cart sweep found a nearest-versus-upwards quote mismatch in MiniCart. Its Boosting-only quote now uses the same upward-rounding helper as the storefront, cart store and server. Four isolated browser regressions pass for 455→500, 91 comments→500, attempt-only under-minimum messaging and two 250-naira lines combining. This does not change supplier costs, accounts pricing or historical financial records. Typecheck remains zero errors / 121 deferred warnings. The small follow-up deployment and its live cart walkthrough must be verified before final handoff.

The same sweep also found that cart refresh dropped custom-comment text. It now preserves normalized text/count and rejects missing, malformed or count-mismatched comments without truncation. Eight cart-refresh regressions and twelve existing order-input checks pass; the full combined server run now passes 176 suites / 1,218 tests. A real anonymous Boosting-only cart refresh is SELECT-only; final live-cart checks must stop before any order/payment/provider write.

Current sprint: production backup/migrations, approved limits, input separation, live-mode worker and eight-offer controlled publication complete; cart rounding follow-up under final verification. Universal follow-ups: owner Spacemail inbox/receipt/reply test; Claude consent-aware marketing integration; separate Super-affiliate private-cost/exclusion setup; launch announcements/email blasts and remaining live-site cleanup; deferred warnings/dev-tool advisories.

## Current payment/Boosting safety checkpoint

Latest combined-code checkpoint, 9 October: fetched and rebased onto Claude's three main commits (`3623573`, `ac50742`, `0343eaa`) using autostash; all local sprint changes restored without conflicts. No local changes to Claude's hook, attribution, SEO, homepage/platform or sitemap files. Marketing T1–T5 remain gated on the ready consent/dispatch contract; a read-only attribution hook is not a complete marketing launch.

Added a repeatable separate-staging recovery schema walkthrough: all three safety migrations and exact synthetic fixtures run inside ONE transaction, deliberately rolled back. Nine actual application/PostgreSQL checks pass for schema compatibility, privacy-minimised duplicate webhook persistence, completed-event replay, temporary backoff, lease exclusion/recovery, exhausted quarantine, duplicate refund enqueue, interrupted reward accounting and completed-task replay. The gateway response, reward obligations and alerts are deliberately mocked; outbound HTTP is blocked. Independent schema, migration-history and fixture readbacks confirm rollback. No production migration or financial change. Evidence: `/private/tmp/fastaccs-recovery-schema-20261009.log`. An earlier harness run timed out while module compilation/build invalidation consumed the transaction budget; application compilation now happens before the transaction, then the rehearsal passes. This is not a live Monnify or real reward-clawback proof.

Added server checkout regressions: saved pricing defeats forged client totals; one ₦500 item or two ₦250 Boosting items pass the minimum guard; under-minimum carts stop before a financial transaction. Boundary tests deliberately stop at a no-write transaction sentinel, not a payment-provider success claim. Combined final verification: 168 server files / 1,147 tests pass; supplier policy 8; typecheck 0 errors / 121 deferred warnings; production build and whitespace/new-file formatting pass. Isolated browser run under NODE_ENV=test: 4 files / 12 assertions pass, existing SvelteKit hook/shutdown errors remain. Earlier combined browser attempt failed before tests and is not a pass.

Fresh SELECT-only production audit still finds 104 offers / zero live, three pending safety migrations, five stale hidden cost ceilings, eleven offers without an unpaused available route and two price ties requiring input/service review. No below-mapped-cost flag using saved rates (not fresh supplier quotes). Unapproved limits, owner-reviewed prices/routes and publication states are preserved. Support inbox: owner chose Spacemail Pro and is setting it up; inbound/reply/website-email tests remain pending. No new supplier spend, commit, push, deployment or production write in this checkpoint.

Latest follow-up, 9 October (supersedes older pending-implementation claims below): canonical purchase and durable incremental refund analytics are implemented locally. New consented orders use one reporting authority; absent server configuration retains browser reporting, and old orders are not silently upgraded. Canonical purchase uses original paid value/time, promotion-adjusted item revenue and full sale value rather than gateway remainder. Refund claims commit before HTTP; uncertain acceptance/restart is held for review, never blindly resent. Read-only reporting holds appear on the permission-checked admin recovery page. Actual PostgreSQL exposed a Prisma void-result advisory-lock bug, fixed with a supported text cast. Initialization no longer calls an under-review late payment already paid or extends a cancelled checkout. Numbers refunds re-read paid/terminal/remaining-money state under the shared order lock, preventing stale partial/full-refund overlap and duplicate item accounting.

Verification: 18 real application/PostgreSQL cases pass; exact synthetic fixtures and absence independently verified. External providers, Google collection, email/notifications and refund-recovery enqueue mocked/blocked, not an external end-to-end claim. Full server suite 165 files / 1,123 tests; supplier-policy 8; typecheck 0 errors / 121 deferred warnings; production build and whitespace check pass. Isolated browser run: 4 files / 12 assertions pass, existing SvelteKit/Vite hook and shutdown warnings remain. Earlier concurrent browser run aborted and is not a pass. Google debug accepts all three schemas with a labelled placeholder secret, zero collected report events; production credentials/delivery remain unverified.

Fresh SELECT-only production review: 104 offers, zero live offers, zero managed-GA order captures, all three safety migrations pending. Five hidden cost caps are stale: Facebook Shares value/stable, Spotify Streams stable/premium, TikTok Followers stable. Prices cover mapped costs; exact internal target/cap updates await owner approval, not applied. Reviewed prices/suppliers/quantities untouched. IG Likes #14918 and Reel #s2657 now provider Completed; earlier public test posts still show 11 and 10 likes. TikTok hides logged-out counters. Completion is not proof of visible full delivery/retention; the currently paused owner-verified custom-comment route was not silently re-enabled.

Claude's separate marketing worktree/files remain untouched. T1–T5 integration awaits ready modules and agreed consent/payload/idempotency contracts. No new supplier purchase, publication, production write/migration, commit, push or deployment in this follow-up. Current and universal lists must accompany the chat reply. Remaining provider walkthrough, price/input/route decisions, delivery/retention/refill evidence and production operational verification are open gates.

Current local branch: `main`; ongoing changes are uncommitted and not pushed/deployed in this workflow. Production Boosting remains offline: fresh public API returns zero managed offers and the storefront maintenance message.

Ten application/real-PostgreSQL race checks pass on a separately verified staging branch, using synthetic users/orders/wallets/inventory with external provider/email/analytics dispatch blocked. Cleanup independently verified. Newly found first-wallet creation race fixed in credit/redemption and the shared affiliate upsert primitive (no reward-policy change); actual ON CONFLICT SQL confirmed. Account allocation rejects a terminal delivery-refund marker even if paid flags are stale. GA checkout client-id capture respects current consent; debug responses fail closed on schema errors/malformed bodies and network errors cannot disclose secrets.

Verification: 163 server suites / 1,066 tests; 8 supplier-budget checks; zero type errors / 121 explicitly deferred warnings; production build and whitespace checks pass. Google debug accepted purchase/refund schemas, using a clearly labelled placeholder secret because the local secret is absent. This is schema validation only, not production analytics delivery/credentials verification.

Remaining current launch gates: external refund analytics/canonical purchase reporting; broader recovery and Numbers walkthrough; owner-review remaining price/service/input mismatches; approved delivery/retention/refill evidence; fresh production backup and three pending safety migrations; code deployment and live cron/reporting checks; publish only ready offers. No new supplier spend. X Likes test is optional/on hold until a neutral target exists. All eleven approved price corrections remain saved; no owner mappings overwritten here. Inbound support inbox and other universal tasks remain tracked in chat and `SPRINT_COMPLETION_TODO.md`.

## Archived integration checkpoint — 2 October 2026

Integration branch: `codex/nonaffiliate-release-candidate`

Purpose: combine the completed non-affiliate work from `test` with the current production branch without losing production-only work such as `/go`. This branch is local only. It must pass the complete verification gate and the owner's local walkthrough before any push or production deployment.

## Included in this release candidate

- Replacement Boosting setup, private preview, storefront flow, cart/checkout integration, order history, fulfilment worker, exception queue and complaint/refill handling.
- Direct and adjustable Boosting quantities: supplier minimum initializes the value, the increment is independently configurable, customers can type a quantity or use quick controls, and invalid increments are normalized safely.
- Clear Boosting pricing language: the global default profit only pre-fills new offers; each offer has its own target. Supplier cost, suggested price and displayed actual profit now use the same formula and server-side checks.
- Safe Boosting routing: Shadow is the default, public visibility is separate from paid-route approval, uncertain submissions cannot be retried automatically, and no supplier identity or cost is exposed publicly.
- Bounded Boosting draft generation: each category gets at most three genuinely distinct tiers, one separate supplier service per generated tier, and fewer tiers when the catalogue cannot support a credible choice. Prices remain cost-safe while presenting a meaningful ladder: More stable targets 2.5x Affordable, Premium targets 5x, and cost outliers that cannot fit the guarded bands are omitted.
- Outcome-aware Boosting pricing: likes and similar engagement are benchmarked below the same platform's audience-growth price, while views and streams are lower again. Prices are normalized per 1,000 units so categories with different customer increments compare correctly.
- Cleaner Boosting choice cards: quality names and promises appear once, repeated quality chips are removed from new and legacy responses, and one section-level marker replaces a draft badge on every card.
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
4. All 140 unit/integration files passed: 822/822 tests.
5. Production build passed under Node 20.19.4.
6. All four production-preview Playwright journeys passed.
7. Integration commit `c3dcfc5` is running at `http://localhost:5173` against isolated staging branch `ep-calm-term-a4byqp53`; all seven expected Boosting tables and five safety indexes passed the read-only integrity probe.
8. Owner walkthrough of the Boosting setup and customer flow passed, including mobile use and cart behavior.
9. Staging draft population produced 84 hidden, unapproved generated offers across 36 supplier-covered categories, plus the owner's one preserved reviewed X Followers offer. The repeatable draft audit returned zero errors after checking tier bands, outcome-relative prices, cost safety and distinct routes.
10. Check Verified-X options, Numbers recovery controls and the paid-order CSV in staging.

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
- Which generated Boosting drafts to approve after deployment and which single reviewed route to use for the paid canary.
- Whether a customer password-reset feature should be added; the investigated old account is already verified and therefore correctly receives no new signup-verification code.
- For a broader offline backup system: storage destination, encryption/key custody, cadence/retention, exact scope and restore-test frequency.

## Do not weaken these rules

- No production database experiments.
- No service goes live from a supplier import alone.
- No automatic paid duplicate after acceptance, charge or ambiguity.
- No public cost, supplier or internal affiliate data.
- No claim of “never drops”; show a specific refill-protection period only when the chosen service supports it.
