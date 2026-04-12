# Monnify Migration Status

Last updated: 2026-04-08

## Outcome

Migration from Korapay to Monnify is active.
Current implementation uses **server-side transaction initialization + hosted redirect checkout**.

## Active Implementation

1. `src/lib/services/monnify.ts`

- Access token retrieval/caching
- Transaction initialization
- Transaction verification
- Webhook signature verification (HMAC-SHA512, raw body)

2. Payment endpoints

- `POST /api/payments/initialize`
- `POST /api/payments/verify`
- `POST /api/webhooks/monnify`

3. Frontend

- `src/routes/checkout/+page.svelte` starts Monnify payment by calling `/api/payments/initialize`
- Browser redirects to Monnify hosted checkout URL
- User returns to `src/routes/checkout/verify/+page.svelte`
- Redirect target is `/checkout/verify` (no `orderId` in query by default)

## Important Behavior Notes

1. `paymentReference` format is merchant-defined (`ORD_...`).
2. Monnify may return either `paymentReference` or `transactionReference`; verification flow supports both.
3. Account allocation happens only after successful verification.
4. Webhook endpoint is a backstop and should remain configured in Monnify dashboard.
5. If callback references are missing, verify flow now returns `pending` (no automatic cancellation) and retries confirmation.

## Legacy / Archived Artifacts

1. Korapay service files remain as legacy references (`src/lib/services/korapay.ts`, `src/lib/services/_archive/korapay.ts`).
2. They are not the active checkout/payment runtime.

## Required Env Variables

- `MONNIFY_API_KEY`
- `MONNIFY_SECRET_KEY`
- `MONNIFY_CONTRACT_CODE`
- `MONNIFY_BASE_URL`

## Dashboard Configuration Checklist

1. Monnify webhook URL points to `/api/webhooks/monnify`.
2. Contract code matches environment (test vs live).
3. API credentials are set in runtime environment.
