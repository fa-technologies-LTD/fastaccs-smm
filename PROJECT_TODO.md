# Fast Accounts project checklist

Last updated: 8 September 2026

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

## Active

- [x] Run focused and full unit tests
- [x] Run full typecheck
- [x] Run the final production build
- [x] Send one SMTP preview to the configured admin inbox
- [x] Owner confirms the preview looks right in Gmail/mobile before deployment

## Waiting for business input

- [ ] Choose a boosting supplier and provide its official API documentation and test credentials
- [ ] Analyse Numbers and Boosting margins before choosing a cashback percentage and caps
- [ ] Provide a Snap Conversions API access token if server-side ad-blocker-resistant tracking is desired

## Operational follow-up

- [ ] Encrypt the 17 legacy affiliate bank-detail records using the approved dry-run fingerprint
- [ ] Recheck the two held upstream dependency chains when compatible SvelteKit and Prisma fixes ship

## Later

- [ ] Implement and pilot boosting-provider automation
- [ ] Implement and measure the Numbers/Boosting incentive pilot
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
