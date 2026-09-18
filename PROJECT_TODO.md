# Fast Accounts project checklist

Last updated: 18 September 2026

## Completed

- [x] Release storefront, cart, checkout, Numbers, Boosting, inventory, and affiliate upgrades
- [x] Deploy release commit `a27b503` to production
- [x] Confirm production homepage and core public routes return successfully
- [x] Confirm post-deployment customer flows with the owner
- [x] Build the professional shared email design
- [x] Audit and tighten every customer-facing email subject and body
- [x] Visually check representative emails at desktop and 390px mobile widths
- [x] Add the reusable audience and email-copy guide
- [x] Draft the safe boosting-provider automation architecture
- [x] Draft the simple Numbers/Boosting store-credit incentive model
- [x] Triage dependency alerts and apply all safe, non-breaking security updates
- [x] Replace the old Snap Pixel with the approved pixel ID
- [x] Track Snap page views, signups, product views, cart adds, checkout, billing, and verified purchases
- [x] Add order-level Snap purchase deduplication and Snapchat click-ID attribution
- [x] Deploy and verify the upgraded Snap tracking in production
- [x] Run the release tests, typecheck, production build, and owner smoke test
- [x] Confirm the upgraded customer email design in Gmail and on mobile
- [x] Research SMM Raja and BulkFollows public API contracts and supplier policies
- [x] Design the dual-provider Boosting architecture, safe router, failover rules, calm customer flow, admin operations, telemetry, tests, and staged rollout
- [x] Build the private click-to-comment planning room for the Boosting plan and project checklist
- [x] Incorporate the owner's review comments and add admin-controlled automatic, preferred, and locked supplier routing
- [x] Define the customer-offer envelope, hidden multi-route pool, recovery budget, mobile Boosting UX and usability gates
- [x] Build read-only SMM Raja and BulkFollows adapters with scrubbed contract fixtures
- [x] Normalize supplier catalogues and quarantine malformed or ambiguous service rows
- [x] Add the private supplier coverage and balance panel without any supplier-order capability
- [x] Extend safe link handling for Spotify, Telegram and thirteen engagement outcomes
- [x] Build and test the fail-closed automatic/preferred/locked route simulation engine
- [x] Build the private mobile-first customer-offer flow preview with illustrative offers
- [x] Build batched normalized supplier-catalogue persistence and its internal admin save action
- [x] Add the durable offer, route, fulfilment and attempt data model with commercial snapshots and overlap protection
- [x] Verify the current Boosting foundation with focused tests, full typecheck, production build and browser journeys
- [x] Build the admin supplier-route mapping workspace with audited automatic, preferred and locked controls
- [x] Connect reviewed customer names, promises and expectation chips to the existing mobile Boosting flow without exposing supplier details
- [x] Add official-domain-only short-link resolution with graceful manual review when a link stays ambiguous, plus a lightweight abuse/compute guard
- [x] Build a manually triggered shadow router that records the safest hypothetical route for paid orders but has no supplier-order capability
- [x] Add strict fixture-tested supplier submit/status contract adapters without connecting them to fulfilment
- [x] Confirm both suppliers' authenticated single/batch status shapes using read-only nonexistent-order probes
- [x] Align the unapplied migration's duplicate-target guard with the final fulfilment states and exclude shadow observations
- [x] Apply the additive Boosting foundation migration to production and verify all six tables and safety indexes
- [x] Make Boosting-map offer clicks latest-request-safe and reveal the selected workspace on stacked admin layouts
- [x] Replace multiplier quantity choices with real amounts and keep every preset on its configured increment
- [x] Add an aggregate-only Snapchat attribution report and verify the approved Pixel is present in production
- [x] Re-audit every email send path and build the private Email Review room with trigger, timing, frequency, safeguards, exact sample copy and rendered preview
- [x] Remove repeated inbox-preview subjects and the automatic recurring inbox-tip paragraph from all emails
- [x] Simplify stock, Boosting, manual-handover, affiliate-payout, Numbers and reward emails where the first audit left repeated or internal wording
- [x] Incorporate the owner’s complete Email Review comments into the real send paths and previews
- [x] Correct live `WELCOME10` from a broken ₦200/site-wide-one-use setup to 10% off, once per customer, with no global cap or platform restriction
- [x] Keep the first-order day 3/10/21 offer sequence active by default, with purchase suppression, consent, deduplication and seven-day spacing
- [x] Make instant account fulfilment send one automatic, deduplicated account-details-ready email after allocation
- [x] Make normal CSV inventory restocks notify customers who explicitly requested that tier
- [x] Let requested account, Numbers and Boosting availability alerts bypass unrelated campaign pacing while retaining consent and deduplication
- [x] Set inactive-customer win-back to 20 days and remove its dependency on unrelated campaign pacing
- [x] Turn the expired Numbers launch emails into a live, paced discovery sequence featuring USA/UK WhatsApp and Telegram options
- [x] Restore the complete weekly owner summary inside the email and remove its dependency on an Analytics-page click
- [x] Replace generic Boosting platform symbols with official brand icons and place each platform name underneath across the selector and catalogue flow
- [x] Remove temporary Boosting Preview, Email Review and Plan Review links from the permanent admin sidebar while keeping their direct review URLs available until sign-off
- [x] Round manually managed account and Boosting catalogue prices to the nearest ₦50 without changing Numbers prices, discounts, paid totals, refunds or historical orders
- [x] Show the “Move Fast Accounts to Primary” inbox tip only on each customer’s first three successfully sent emails

## Latest verification — 14 September 2026

- [x] 711 unit, integration and browser-component tests passed across 121 files
- [x] Svelte/type checking passed with 0 errors; 121 existing warnings remain unchanged
- [x] Production build passed with the affiliate encryption configuration verified
- [x] 4 production-preview browser journeys passed; local remote-DB connectivity was intermittent, so these were UI/fallback journeys rather than a full live-data acceptance test
- [x] Diff whitespace/integrity check passed
- [x] Permanent Neon staging branch connected, guarded `dev:staging` startup confirmed, homepage returned 200, migrations current, and Boosting foundation verified read-only
- [x] 13 focused quantity/config tests and 2 focused Chromium interaction tests passed
- [x] Post-reservation typecheck passed with 0 errors and the production build completed successfully

## Email re-audit verification — 15 September 2026

- [x] 62 sendable email versions documented in the private Email Review room, including every distinct payment, Numbers and automation exception
- [x] 22 focused email/copy tests and the Email Review Chromium interaction test passed
- [x] Typecheck passed with 0 errors and the unchanged 121-warning baseline
- [x] Production build passed with affiliate encryption configuration verified
- [x] Owner reviewed every entry and supplied the final copy and trigger notes
- [x] 30 focused email, promotion, lifecycle, Numbers-campaign and fulfilment tests passed
- [x] Revised Email Review Chromium journey passed
- [x] Post-review typecheck passed with 0 errors and the unchanged 121-warning baseline
- [x] Post-review production build passed with affiliate encryption configuration verified
- [x] Complete unit suite passed: 733 tests across 129 files

## Final test-branch sweep — 18 September 2026

- [x] Focused catalogue-rounding and category API coverage passed: 22 tests
- [x] Complete unit suite passed: 744 tests across 130 files
- [x] Typecheck passed with 0 errors and the unchanged 121-warning baseline
- [x] Production build passed with affiliate encryption configuration verified
- [x] Diff whitespace/integrity check passed

## Next release

- [x] Owner completed the revised Email Review pass and supplied final comments
- [x] Commit the complete tested working tree to `test`
- [ ] Push `test` and smoke-test the permanent Vercel/Neon staging deployment
- [ ] Promote the approved commit to `main` and redeploy Production with the latest environment values
- [ ] Confirm the first production runs of first-order offers, Numbers discovery, 20-day win-back, requested restock alerts and automatic account-ready delivery
- [x] Round catalogue prices to the nearest ₦50 while preserving exact accounting for checkout discounts, paid totals, refunds and historical orders
- [ ] Remove temporary review routes and their review-only supporting code after their final sign-off or replacement flow is complete

## Current Boosting build

- [ ] Save the first internal supplier-catalogue snapshot, then map the first reviewed offers
- [x] Create one persistent Neon development branch and store its pooled/direct URLs locally for future migrations and transaction tests
- [x] Complete the available authenticated no-order service, balance, single-status, batch-status and error-shape checks
- [ ] Before live automation, audit both suppliers' current terms, FAQs and how-to guidance; align Fast Accounts' Boosting FAQs, policies and expectation copy for owner review
- [ ] Map the first reviewed offers, then run and compare shadow decisions against human-fulfilled orders
- [ ] Make healthy Boosting operations hands-off: scheduled catalogue/balance refresh, automatic safe routing, backoff status checks, customer updates, and an exceptions-only admin queue
- [ ] Connect the replacement customer flow to cart, checkout, order history, notifications and audited manual recovery
- [ ] After staging, shadow and canary parity, retire the complete old Boosting customer/admin UI, endpoints and unreachable compatibility code
- [x] Fund both supplier accounts and verify their credentials with read-only service-list and balance calls
- [x] Store both supplier credentials in the ignored local environment for authenticated contract testing

## Paused until the data is mature

- [ ] Resume incentive analysis after Numbers has a larger sample and the Boosting upgrade is live
- [ ] Then choose safe pilot cashback rates and caps from fresh 30/60-day margins

## Waiting for business input

- [x] Rotate the supplier keys that were shared in chat
- [x] Store the rotated supplier keys as server-only Vercel secrets for Production and Preview
- [ ] Before deployment, confirm any previous affiliate payout encryption key remains after the new key so existing encrypted records stay readable
- [ ] Review the Snapchat Ads Manager 7-day Pixel overview and Event Diagnostics; investigate why no recent signup is first-touch attributed to Snapchat before judging campaign return
- [ ] Confirm the remaining paid/operational API behaviour during a controlled canary: successful submission/status, rate limits, idempotency/client reference, refill/cancel rules, credits, and support escalation
- [x] Review every entry in `/admin/email-review` and incorporate the final tone and policy edits before deployment
- [ ] Provide a Snap Conversions API access token if server-side ad-blocker-resistant tracking is desired

## Operational follow-up

- [ ] Encrypt the 17 legacy affiliate bank-detail records using the approved dry-run fingerprint
- [ ] Recheck the two held upstream dependency chains when compatible SvelteKit and Prisma fixes ship

## Later

- [ ] Run the Boosting router in shadow mode against manually fulfilled orders
- [ ] Pilot small, precisely mapped services before enabling dual-provider routing
- [ ] Expand safe automation service by service and add refill/partial recovery later
- [ ] Start recording boosting supplier cost and outcome per order so true margin and reliability can be measured
- [ ] Heavily market the new Boosting service only after automated fulfilment and customer-status handling pass canary checks
- [ ] Implement and measure the Numbers/Boosting incentive pilot after margin analysis resumes
- [ ] Review live Numbers-service performance after more production usage
- [ ] Add Snap Conversions API tracking and deduplicate it against the browser Pixel
- [ ] Run one final full-site code, UX, security, and operations sweep

## Working principles

- Keep customer language short, plain, and mobile-friendly.
- Show the outcome, price, status, or required action first.
- Use one clear primary action per screen or message.
- Reuse store credit instead of creating points, tiers, or another wallet.
- Never let a supplier outage block payment confirmation or create duplicate orders.
- Keep production data changes separate, dry-run first, and explicitly approved.
