# API Routes (Current Snapshot)

Last updated: 2026-04-08

This file reflects the current code in `src/routes/api/**/+server.ts`.

## Auth Legend

- `admin` = route performs explicit admin check in handler
- `user` = route requires authenticated `locals.user`
- `public` = no explicit auth guard in handler

## Payment + Webhooks

- `POST /api/payments/initialize` (`user`) - Create Monnify hosted checkout URL
- `POST /api/payments/verify` (`user`) - Verify Monnify transaction and fulfill order
- `POST /api/webhooks/monnify` (`public`, signed webhook) - Monnify event ingestion
- `POST /api/test/webhook` (`public`) - Signature test helper (Monnify header format)

## User-Guarded Routes

- `GET /api/dashboard`
- `POST /api/affiliate/enable`
- `GET /api/affiliate/stats`
- `GET /api/purchases`

## Admin-Guarded Routes

- `PATCH /api/admin/affiliates/[userId]/toggle`
- `PATCH /api/admin/affiliates/[id]/commission-rate`
- `POST /api/admin/affiliates/[id]/payouts`
- `GET /api/admin/affiliates/[id]/payouts`
- `POST /api/admin/cleanup/allocated-accounts`
- `GET /api/admin/microcopy`
- `POST /api/admin/microcopy`
- `PATCH /api/admin/microcopy/[id]`
- `DELETE /api/admin/microcopy/[id]`

## Route To Review

- `PATCH /api/admin/microcopy/[id]/toggle` currently checks `locals.user` but should be verified for consistent admin guard behavior.

## Public Routes (No Explicit Guard)

Catalog/inventory/order surfaces:

- `GET /api/categories`
- `POST /api/categories`
- `GET /api/categories/[id]`
- `PUT /api/categories/[id]`
- `DELETE /api/categories/[id]`
- `GET /api/categories/[id]/stock`
- `GET /api/categories/slug/[slug]`
- `GET /api/categories/tiers/[platformId]`
- `POST /api/categories/tiers/batch`
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
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/orders/[id]`
- `PATCH /api/orders/[id]`
- `DELETE /api/orders/[id]`
- `POST /api/orders/[id]/process`
- `POST /api/orders/[id]/deliver`
- `GET /api/orders/stats`

Utility/debug/test routes:

- `GET /api/affiliate/validate`
- `POST /api/send-email`
- `GET /api/test-email`
- `GET /api/debug/account-connections`
- `POST /api/debug/account-connections`

## Security Note

By product decision, public mutation route hardening is currently deferred.
