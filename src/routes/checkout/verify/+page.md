# Checkout Verify Page

## Route

`/checkout/verify`

## Current Purpose

Handle post-Monnify redirect, verify payment server-side, and finalize order fulfillment.

## Query Parameters Used

- `paymentReference` (Monnify merchant reference, typically `ORD_...`)
- `transactionReference` (Monnify transaction reference, typically `MNFY|...`)
- `orderId` (optional legacy fallback when present)

## Client Behavior

1. On mount, reads `paymentReference`, `transactionReference`, and `orderId` (if present).
2. Sends `POST /api/payments/verify` with callback context keys for diagnostics.
3. Handles 3 outcomes:

- Success: clears cart and redirects to `/dashboard`.
- Pending confirmation (`202`): shows pending UI and retries automatically for up to ~90 seconds.
- Failed: shows error state.

## API Contract (Current)

`POST /api/payments/verify` accepts either:

- `paymentReference`
- `transactionReference`

Optional fallback:

- `orderId`

The endpoint verifies payment with Monnify and only allocates accounts on confirmed success.
If callback references are missing, it returns pending (no auto-cancel) and falls back to stored order `paymentReference` when possible.

## Hardening Note

Order ID is sanitized and UUID-validated before Prisma lookup to prevent malformed callback values from causing runtime errors.
