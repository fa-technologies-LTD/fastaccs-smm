# Dashboard Page

## Route

`/dashboard`

## Current Purpose

Authenticated customer workspace for order history, purchase credential access, and support shortcuts.

## Runtime Data Source

`src/routes/dashboard/+page.server.ts` loads from a single endpoint:

- `GET /api/dashboard`

If unauthenticated, users are redirected to:

- `/auth/login?returnUrl=/dashboard`

## Current Tab State

`UserDashboard.svelte` currently renders:

1. `Orders`
2. `Purchases`
3. `Affiliate · Coming Soon` (present but disabled)

## Current Dashboard Structure

1. Compact welcome/security row (avatar, first-name greeting, secured/unsecured pill).
2. 2x2 compact stats grid:
   - accounts owned
   - total spent
   - active platforms
   - open issues
3. Tabbed content:
   - `OrderTab`
   - `PurchaseTab`
   - `AffiliateTab` (disabled entry)
4. Bottom quick-action tiles:
   - buy more
   - support
   - affiliate (muted/coming soon)

## Notes

1. Wallet models/services still exist but wallet UX is intentionally dormant in customer checkout runtime.
2. Purchases currently remain a separate tab (not merged into Orders) by product direction.
