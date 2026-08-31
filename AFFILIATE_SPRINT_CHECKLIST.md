# FastAccs Affiliate Sprint — Living Checklist

Last updated: 2026-08-31

Status: `[x]` implemented and verified · `[~]` final review in progress · `[ ]` rollout action requiring separate approval · `[LATER]` separately scoped work

This is the durable source of truth for the affiliate sprint. Code completion and production rollout are kept separate so a green implementation cannot silently mutate production data.

## Working rules

- [x] Work only on `test` until the owner reviews it.
- [x] Do not merge, push, deploy, or mutate production without separate explicit approval.
- [x] Reconcile the earlier developer's work into one implementation; do not leave competing paths.
- [x] Fail closed and protect business money when a financial state is ambiguous.
- [x] Preserve `.probe/` and unrelated user files.
- [x] Use one local checkpoint for the sprint after final verification.
- [~] Complete the final file-by-file scope review before creating that checkpoint.

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
- [x] The approved payout minimum is ₦5,000 and remains adjustable in admin.
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
- [x] Static analysis passes with 0 errors; 126 existing advisory Svelte warnings remain across 40 files.
- [x] Production build passes.
- [x] Complete test suite passes: 98 files, 567 tests.
- [x] `git diff --check` passes.

## Production rollout — not executed

- [ ] Configure `AFFILIATE_PAYOUT_ENCRYPTION_KEYS` with a new current key and retained rotation policy.
- [ ] Run the read-only migration preflight against production and review duplicate programmes, open payouts, and incomplete bank rows.
- [ ] Deploy only the additive affiliate migration after explicit approval.
- [ ] Run the full affiliate integrity report in dry-run mode and review its exact fingerprinted record list.
- [ ] Confirm the existing production payout setting currently reported as ₦10,000 and approve changing it to the locked ₦5,000 policy.
- [ ] Review every proposed legacy referral/policy snapshot, cached total, missing programme, missing reward, payout anomaly, and bank row before any write.
- [ ] Apply only the owner-approved non-ambiguous repairs; do not grant money for ambiguous records.
- [ ] Encrypt the exact fingerprint-approved legacy bank rows, then verify plaintext is cleared.
- [ ] Verify referral ownership, frozen contracts, ledger totals, payout reservations, available cash, and admin funnel values after rollout.
- [ ] Obtain explicit approval before pushing, merging to `main`, or deploying.

## Separately scoped future work

- [LATER] Design a separate internal incentive system for Numbers and Boosting instead of forcing them into account-sale economics.
- [LATER] Run the organic discovery/sales sprint covering search discovery, useful content, catalogue landing pages, lifecycle loops, referrals, and conversion measurement without paid social dependence.
- [LATER] Add provider delivery/open-event monitoring for email deliverability beyond application-level render and send records.
