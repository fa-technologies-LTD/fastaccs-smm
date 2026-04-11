# Checkout Page

## Route

`/checkout`

## Current Purpose

Collect cart items, apply affiliate discount (optional), create order, and launch Monnify hosted checkout.

## Runtime Flow

1. Load cart from client store (`cart.svelte.ts`).
2. Validate stock per tier with `GET /api/categories/{tierId}/stock`.
3. Create order (`paymentMethod: 'monnify'`).
4. Call `POST /api/payments/initialize` with `orderId`.
5. Redirect browser to Monnify `checkoutUrl`.

## APIs Used

- `GET /api/affiliate/validate?code=...`
- `GET /api/categories/{id}/stock`
- `POST /api/orders`
- `POST /api/payments/initialize`

## Auth Behavior

- Unauthenticated users are redirected to login with a return URL.
- Payment initialization endpoint requires authenticated `locals.user`.

## Notes

- Wallet checkout flow is intentionally archived/disabled in this page.
- Active payment provider is Monnify (not Korapay).
