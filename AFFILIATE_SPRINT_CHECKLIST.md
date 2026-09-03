# FastAccs Affiliate Sprint — Living Checklist

Last updated: 2026-09-04

Status: `[x]` implemented and verified · `[~]` rollout in progress · `[ ]` rollout action not yet completed · `[LATER]` separately scoped work

This is the durable source of truth for the affiliate sprint. Code completion and production rollout are kept separate so a green implementation cannot silently mutate production data.

## Working rules

- [x] Work only on `test` until the owner reviews it.
- [x] Do not merge, push, deploy, or mutate production without separate explicit approval.
- [x] Reconcile the earlier developer's work into one implementation; do not leave competing paths.
- [x] Fail closed and protect business money when a financial state is ambiguous.
- [x] Preserve `.probe/` and unrelated user files.
- [x] Use one local checkpoint for the sprint after final verification.
- [x] Complete the final file-by-file scope review before creating that checkpoint.

## Locked business policy

- [x] The programme exists to create an internal, organic customer-acquisition and sales channel.
- [x] A customer's first completed retained purchase unlocks regular affiliate access automatically.
- [x] First-touch attribution is durable; an existing buyer cannot switch affiliates.
- [x] Attribution is accepted only before the buyer has a previous paid order.
- [x] Regular affiliate economics apply to account orders only; Numbers and Boosting are excluded.
- [x] The buyer receives 5% off the first two eligible account orders, capped at ₦1,000 per order.
- [x] The affiliate earns 5% on those same first two retained eligible orders, capped at ₦1,000 per order.
- [x] Referral pricing and separate promotion codes do not stack.
- [x] Affiliate Cash may go toward FastAccs purchases or be withdrawn, but cannot be spent and withdrawn twice.
- [x] The approved payout minimum remains ₦10,000 and is adjustable in admin.
- [x] Payout requires a 15-day-old account and approved Nigerian bank details; processing day is Saturday.
- [x] Super Affiliate contract: ₦700 after a referred buyer retains ₦3,500 of account spend or three retained account orders.
- [x] Super monthly bonuses are total, non-additive targets: ₦3,000 at 10 activations, ₦8,000 total at 20, and ₦15,000 total at 30.
- [x] Super settings affect new referral relationships only; an accepted relationship keeps its frozen contract.
- [x] Bank details are requested after the first vested earning, while voluntary setup remains available.

## Money integrity and abuse prevention

- [x] Enforce account-only eligibility independently at checkout, reward creation, settlement, refund, and reporting layers.
- [x] Calculate regular rewards from retained eligible value after item-level refunds.
- [x] Exclude store-credit-funded value from the commission base.
- [x] Limit buyer discounts and regular rewards to the first two eligible orders under transaction locks.
- [x] Make regular, Super activation, and monthly-bonus creation idempotent across retries and concurrent jobs.
- [x] Prevent self-referrals, returning-buyer linking, referral switching, and promotion stacking.
- [x] Keep pending and identity-held rewards unavailable for spending or withdrawal.
- [x] Hold shared-phone, shared-bank, or unavailable identity checks for admin review instead of automatically granting money.
- [x] Recompute or reverse regular rewards, Super activations, and Super monthly totals after partial or full refunds.
- [x] Record any unrecovered overpayment as an immutable adjustment so future earnings remain offset.
- [x] Reserve payouts atomically and enforce one open payout per user in the database.
- [x] Recheck live access, account age, approved bank details, ledger entitlement, and open-request state at payout request time.
- [x] Recheck approved bank details and maximum payable entitlement again before an admin can mark a payout paid.
- [x] Permission-gate and audit affiliate enable/disable, regular/Super changes, flagged reward review, bank review/reveal, settings, and payout actions.
- [x] Remove the obsolete per-affiliate commission-rate endpoint so admins cannot create hidden one-off economics.

## Attribution, contracts, and Super Affiliate

- [x] Add one durable `AffiliateReferral` relationship per buyer, with first-touch uniqueness.
- [x] Retain safe dual-read compatibility with legacy referral locks during rollout.
- [x] Freeze the relationship's programme type and Super commercial terms in a policy snapshot.
- [x] Use the earliest trustworthy order contract as the legacy fallback; flag ambiguity rather than guessing.
- [x] Enforce one affiliate programme per user and make concurrent activation idempotent.
- [x] Preserve an explicit admin disable so automatic activation cannot silently undo it.
- [x] Provide a simple audited regular/Super control in the affiliate admin area.
- [x] Make Super thresholds, reward, and monthly targets configurable in one admin settings section.
- [x] Show frozen Super agreements on the admin detail screen so current settings are not mistaken for old promises.
- [x] Show each Super affiliate the correct frozen targets for their existing referrals.

## Payout details and privacy

- [x] Encrypt new payout details with versioned AES-256-GCM envelopes.
- [x] Support current-key encryption plus retained legacy keys for rotation/decryption.
- [x] Store only the last four account-number digits outside the encrypted envelope.
- [x] Mask ordinary admin views and audit every full reveal.
- [x] Fail closed if encryption, decryption, or reveal auditing is unavailable; never overwrite with partial data.
- [x] Add a production build check that refuses to deploy without a valid encryption key configuration.
- [x] Add a fingerprinted dry-run/apply utility for encrypting approved legacy plaintext rows.
- [x] Make customer payout screens show exact blockers, the live minimum, bank-review status, and Saturday processing.

## Canonical reporting and measurement

- [x] Use the immutable wallet ledger as the source for pending, available, spent, adjusted, requested, and paid Affiliate Cash.
- [x] Separate net referred account sales, buyer discount cost, regular reward cost, Super reward cost, liability, and cash paid in admin.
- [x] Stop trusting cached affiliate referral/sales totals for business reporting.
- [x] Add idempotent affiliate events for link opens, referral locks, access activation, retained orders, rewards, reversals, payouts, and notification opens.
- [x] Measure dashboard views, code/link copies, WhatsApp share starts, and copied share messages.
- [x] Add a light admin funnel showing landings, referral locks, buyers, retained orders, productive affiliates, and payouts.
- [x] Show identity-held rewards, open payout requests, bank-review state, frozen Super contracts, and popup engagement in admin.
- [x] Add a read-only audit that reports policy drift, stale cached totals, legacy relationships, missing settlements, reward anomalies, payout anomalies, and bank-encryption work.

## Lifecycle, notification bell, and emails

- [x] Keep the bell universal for all customers rather than tying it to affiliate status.
- [x] Load only the unread summary until the bell opens, then paginate older notifications.
- [x] Give useful order and affiliate notifications deep links and record affiliate notification opens.
- [x] Retain the legacy notification endpoint path only for client compatibility; its behavior is system-wide.
- [x] Replace recurring generic affiliate nudges with one truthful unlock/share message and event-led milestones.
- [x] Do not send celebratory reward email while a reward is held for identity review.
- [x] Add first-referral, first-earned-cash, payout-requested, payout-paid, and payout-reversed lifecycle states.
- [x] Inventory customer, affiliate, order, payment, lifecycle, security, support, and admin email producers.
- [x] Add one responsive FastAccs email shell with a preheader, escaped content, clear CTA, footer, and HTTPS-only action links.
- [x] Render headings and bullet lists as email HTML instead of leaking raw markdown/code-like text.
- [x] Make affiliate email figures and payout timing use live configuration and consistent Affiliate Cash terminology.
- [x] Give admin alerts operational context without credentials, secrets, raw objects, or unsafe links.
- [x] Add renderer, malicious-content, marketing-control, affiliate lifecycle, notification, and payout email tests.

## Customer and admin UX

- [x] Simplify the affiliate dashboard to: understand → share → track pending/available cash → withdraw.
- [x] Remove duplicate totals, obsolete activation progress, premature bank prompts, and the redundant payout modal.
- [x] Keep regular and Super explanations separate; Super-only terms do not appear to regular affiliates.
- [x] Make the 5%/5%, first-two-orders, account-only, and ₦1,000-cap promise consistent across dashboard, public page, guide, terms, checkout, blog, popups, and email.
- [x] Give exact payout blockers instead of a generic disabled button.
- [x] Lazy-load the full affiliate report only when the affiliate tab is requested; ordinary dashboard visits fetch only a lightweight access summary.
- [x] Replace the oversized affiliate explainer with three familiar compact steps and one rules strip.
- [x] Remove fake demo earnings and non-functional share controls from the explainer.
- [x] Make the How It Works tabs horizontally usable on mobile.
- [x] Visually review the public affiliate page and explainer at 390 px and 1440 px widths.
- [x] Keep the public payout figure live from backend configuration rather than hard-coding a promise.
- [ ] Owner review of the authenticated regular and Super dashboards on the local `test` server.

## Extended storefront and operations review

- [x] Keep local production-data preview explicit and fail closed by default; the owner-approved `production-e2e` mode is the only localhost mode allowed to write to live systems.
- [x] Repair guest and signed-in cart refresh/recovery so saved items remain usable when the live refresh endpoint has a transient failure.
- [x] Prevent browser-notification opt-in from remaining stuck and make denied, unsupported, and failed states actionable.
- [x] Make admin attention badges refresh after relevant actions, focus/visibility changes, and a quiet two-minute visible-page interval rather than requiring a full reload.
- [x] Make bank-detail failures render an actionable screen instead of a raw 500 response.
- [x] Remove the misleading `Instant` and `No-code refund` promises from the Numbers explanation.
- [x] Unify all four How It Works tabs around the same compact side-by-side journey, with tab-specific introductions and questions.
- [x] Hide the native mobile tab scrollbar and automatically bring the selected tab into view.
- [x] Build three complete homepage concepts for comparison and move the approved Option C catalogue treatment onto the real homepage.
- [x] Keep the real homepage catalogue short, add the existing app icon set, show live account stock/prices, and deep-link Numbers and Boosting shortcuts into the selected expanded service.
- [x] Keep the notification menu readable over the hero with a visible translucent glass surface rather than an opaque block.
- [x] Simplify the account-buying catalogue on every platform, not only X: Features are visible, promotional badges are contained, quick Add to Cart remains primary, and exact-profile selection is optional and consistent.
- [x] Replace customer-facing reservation jargon with Add to Cart language throughout exact-profile selection.
- [x] Make cart removal optimistic and confirm it visibly, cache hydrated cart rows, and remove global reservation maintenance from the cart-read hot path.
- [x] Keep checkout on the same idempotent order while Monnify initializes so partially store-credit-funded payments do not bounce to order history prematurely.
- [x] Supply Monnify with the canonical production return URL while preserving localhost callbacks for explicit local payment tests.
- [x] Replace the post-purchase boosting copy with a short platform-aware upsell and measure its views, clicks, and click-through rate in admin Analytics.
- [x] Keep the mobile cookie notice compact so it does not cover a primary product action.
- [x] Accept legitimate Facebook, Instagram, TikTok, YouTube, and X profile/post/share/short-link formats while rejecting off-platform lookalikes.
- [x] Turn the manual Boosting admin page into a chronological, searchable, paginated queue with order dates, provider references, copy actions, status transitions, and a customer link-correction workflow.
- [x] Redesign Inventory around actionable stock states, quick filters, useful sorting, truthful restock dates, and a mobile card layout.
- [x] Keep visible Numbers-order feedback at three seconds while pausing hidden-tab polling and resuming immediately when the customer returns.
- [x] Reduce wake-heavy background schedules without removing live purchase-time supplier checks or payment recovery.
- [x] Keep the approved service/country expansion list in the controlled Numbers catalogue; PVAPins discovery cannot publish a product until a real rent/release or delivery proves it.
- [x] Owner manual review and final smoke test of the release-critical storefront and operations flows.
- [ ] Observe Neon compute for 24–48 hours after deployment and compare active compute hours and invoice trend with the previous five-minute wake pattern.
- [ ] Confirm the controlled probe has produced enough successful evidence for the specific new services/countries intended for promotion; unsupported or unproven shortcuts must remain off the storefront.

## Tests and validation

- [x] Regular 5%/5%, first-two-order rules, per-order caps, and account-only direct-API enforcement.
- [x] Self-referral, prior-buyer, switching, first-touch race, programme-activation race, and first/second/third-order concurrency coverage.
- [x] Duplicate settlement/retry, partial/full refund, post-vesting reversal, automatic/manual refund, and Super monthly invalidation coverage.
- [x] Store-credit spend versus payout reservation and live payout-entitlement coverage.
- [x] Bank approval, encryption/decryption, rotation, missing/corrupt keys, masking, and audit failure coverage.
- [x] Super spend/order qualification, one-time activation, total monthly tiers, demotion, frozen contracts, and refund invalidation coverage.
- [x] Admin permission and audit coverage for high-risk affiliate actions.
- [x] Canonical ledger, analytics, event deduplication, notification pagination, and lazy stats loading coverage.
- [x] All four affiliate migration/repair scripts pass Node syntax validation.
- [x] Prisma schema validation passes.
- [x] Static analysis passes with 0 errors; 121 existing advisory Svelte warnings remain across 39 files.
- [x] Production build passes.
- [x] Complete test suite passes: 104 files, 601 tests.
- [x] Browser regression suite passes: 4 tests, including homepage, navigation, and cart recovery.
- [x] `git diff --check` passes.

## Production rollout — in progress

- [ ] Configure `AFFILIATE_PAYOUT_ENCRYPTION_KEYS` with a new current key and retained rotation policy.
- [x] Run the read-only migration preflight against production and review duplicate programmes, open payouts, and incomplete bank rows.
- [x] Confirm the additive affiliate migration is already present in production; no migration write is needed for this release.
- [x] Run the full affiliate integrity report in dry-run mode and record its exact fingerprinted result without applying repairs.
  - 2026-09-04 fingerprint: `c4c0c932bc79adff7cfad0de2c85b7ee662f7566578a24b4e8f35e32bcd2778c`; 13 ambiguous legacy contracts remain blocked from automatic repair, and no production rows were changed.
- [x] Keep the existing production affiliate payout minimum at ₦10,000.
- [ ] Review every proposed legacy referral/policy snapshot, cached total, missing programme, missing reward, payout anomaly, and bank row before any write.
- [ ] Apply only the owner-approved non-ambiguous repairs; do not grant money for ambiguous records.
- [ ] Encrypt the exact fingerprint-approved legacy bank rows, then verify plaintext is cleared.
- [ ] Verify referral ownership, frozen contracts, ledger totals, payout reservations, available cash, and admin funnel values after rollout.
- [x] Obtain explicit approval before pushing, merging to `main`, or deploying.

## Separately scoped future work

- [LATER] Design a separate internal incentive system for Numbers and Boosting instead of forcing them into account-sale economics.
- [LATER] Run the organic discovery/sales sprint covering search discovery, useful content, catalogue landing pages, lifecycle loops, referrals, and conversion measurement without paid social dependence.
- [LATER] Add provider delivery/open-event monitoring for email deliverability beyond application-level render and send records.
- [LATER] Plan and integrate a boosting-service provider API so fulfilment can be automated with idempotency, status reconciliation, retries, refunds, supplier failover, margins, and an admin override path.
- [LATER] Review live Numbers performance: availability, OTP success, supplier quality, failover, refund rate, response time, and cost per successful rental.
- [LATER] Audit every transactional, lifecycle, support, security, admin, and marketing email for accuracy, tone, clarity, and duplicated or outdated promises.
- [LATER] Upgrade the shared email design system and verify responsive rendering across common inboxes.
- [LATER] Finish with a complete customer/admin site sweep covering copy, navigation, responsive UI, accessibility, loading/error states, conversion friction, operational controls, and dead or inconsistent paths.
