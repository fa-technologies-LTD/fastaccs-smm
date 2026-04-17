# API Routes (Current Snapshot)

Last updated: 2026-04-15

This map reflects current handlers under `src/routes/api/**/+server.ts`.

## Auth Legend

- `admin` = explicit admin check (`locals.user.userType === 'ADMIN'`)
- `user` = requires authenticated `locals.user`
- `public` = no explicit auth guard in route handler

## Payments + Webhooks

- `POST /api/payments/initialize` (`user`) - Initialize Monnify hosted checkout
- `POST /api/payments/verify` (`user`) - Verify transaction and finalize fulfillment
- `POST /api/webhooks/monnify` (`public`, signed webhook) - Monnify webhook ingestion
- `POST /api/test/webhook` (`public`) - Test helper for Monnify webhook signature flow

## Dashboard + Customer Data

- `GET /api/dashboard` (`user`) - Aggregated dashboard payload (orders, purchases, wallet snapshot, affiliate snapshot)
- `GET /api/purchases` (`user`) - Delivered/allocated purchase credentials

## Affiliate Routes

- `POST /api/affiliate/enable` (`user`)
- `GET /api/affiliate/stats` (`user`)
- `GET /api/affiliate/validate` (`public`)

## Admin Routes (Explicit Guarded)

- `PATCH /api/admin/affiliates/[userId]/toggle`
- `PATCH /api/admin/affiliates/[id]/commission-rate`
- `POST /api/admin/affiliates/[id]/payouts`
- `GET /api/admin/affiliates/[id]/payouts`
- `POST /api/admin/cleanup/allocated-accounts`
- `GET /api/admin/microcopy`
- `POST /api/admin/microcopy`
- `PATCH /api/admin/microcopy/[id]`
- `DELETE /api/admin/microcopy/[id]`
- `PATCH /api/admin/microcopy/[id]/toggle`

## Public Catalog + Mutation Surfaces

Categories and tiers:

- `GET /api/categories`
- `POST /api/categories`
- `GET /api/categories/[id]`
- `PUT /api/categories/[id]`
- `DELETE /api/categories/[id]`
- `POST /api/categories/[id]/retire`
- `GET /api/categories/[id]/stock`
- `GET /api/categories/slug/[slug]`
- `GET /api/categories/tiers/[platformId]`
- `POST /api/categories/tiers/batch`

Accounts, batches, inventory:

- `GET /api/accounts`
- `POST /api/accounts`
- `PUT /api/accounts/[id]`
- `DELETE /api/accounts/[id]`
- `GET /api/batches`
- `POST /api/batches`
- `GET /api/batches/[id]`
- `PATCH /api/batches/[id]`
- `DELETE /api/batches/[id]`
- `GET /api/inventory`

Orders:

- `GET /api/orders`
- `POST /api/orders`
- `GET /api/orders/[id]`
- `PATCH /api/orders/[id]`
- `DELETE /api/orders/[id]`
- `POST /api/orders/[id]/process`
- `POST /api/orders/[id]/deliver`
- `GET /api/orders/stats`

## Notify + Reviews

- `POST /api/restock-notify` (`public`) - Store notify subscriptions (platform metadata + growth microcopy key)
- `GET /api/reviews/featured` (`public`) - Homepage testimonial feed

## Utility / Debug / Test (Public)

- `POST /api/send-email` - direct email send surface
- `GET /api/test-email` - test helper route that triggers email path
- `GET /api/debug/account-connections` - structural debug data
- `POST /api/debug/account-connections` - migration-style destructive operation

## Security Notes (Current Reality)

1. Public mutation and debug routes are currently open by product decision.
2. `/api/send-email` and `/api/test-email` should be considered high-abuse surfaces if deployed as-is.
3. `/api/debug/account-connections` includes destructive behavior and should be admin-only in hardened environments.
4. `GET /api/orders` is publicly callable and returns sensitive order/account linkage data unless protected upstream.
