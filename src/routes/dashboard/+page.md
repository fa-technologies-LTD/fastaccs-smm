# Dashboard Page

## Route

`/dashboard`

## Current Purpose

Authenticated customer hub for orders and delivered purchases.

## Data Source

- `+page.server.ts` enforces auth and loads:
- user profile basics
- order history
- purchase data
- affiliate data snapshot

## UI State (Current)

In `UserDashboard.svelte`, active tabs are:

1. `orders`
2. `purchases`
3. `affiliate` (currently disabled in UI)

Wallet tab and profile settings tab are intentionally commented out in the current runtime.

## APIs Used by Dashboard

- `GET /api/orders`
- `GET /api/purchases`
- `GET /api/affiliate/stats`
- `POST /api/affiliate/enable`

## Notes

- Wallet models/services still exist in backend, but wallet user flow is not currently active in dashboard checkout UX.
- Primary support CTA from dashboard points to `/support`.
