# Monnify Migration Plan (Replacing Korapay)

## Overview

Replace Korapay as the payment provider with Monnify.
Use the **Monnify JS SDK popup** — users pay via card, bank transfer, or USSD directly on your page
without being redirected away. The wallet system is **disabled** (not deleted — code is archived for
potential future use).

## Archiving Policy

> Nothing is deleted. Files/code that are no longer active are **moved to an `_archive/` folder**
> or wrapped with a clear `// ARCHIVED` comment. Routes are disabled by returning `410 Gone`.

---

## Steps

### 1. Environment Variables

- Disable: `KORAPAY_SECRET_KEY` (comment out, do not delete)
- Add: `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE`, `MONNIFY_BASE_URL`
  - Sandbox: `https://sandbox.monnify.com`
  - Live: `https://api.monnify.com`

---

### 2. Archive `src/lib/services/korapay.ts`

- Move to `src/lib/services/_archive/korapay.ts`
- No code changes inside it

---

### 3. Create `src/lib/services/monnify.ts`

New service file. Implements:

- `getAccessToken()` — POST `/api/v1/auth/login` with `Basic base64(apiKey:secretKey)` → returns Bearer JWT. Re-fetches when expired (tokens last 1 hour).
- `verifyTransaction(transactionReference)` — GET `/api/v2/transactions/{transactionReference}` with Bearer token → returns status, amount, metadata
- `verifyWebhookSignature(signature, rawBody)` — HMAC-SHA512 of the **full raw request body** using the secret key

> **Amount note:** Monnify works in whole **Naira**, not kobo. No conversion needed.

---

### 4. Update `src/lib/services/payment.ts`

- Swap imports from `./korapay` → `./monnify`
- Remove `initializePayment` (no longer needed — SDK handles it client-side)
- Keep `verifyPayment` and `verifyWebhookSignature`
- Update field mappings to Monnify response shape:
  - `paymentStatus: "PAID"` (Monnify) vs `status: "success"` (Korapay)
  - `amountPaid` vs `amount`
  - Metadata is under `metaData` in Monnify response

---

### 5. Archive `/api/payments/initialize/+server.ts`

- Move to `src/routes/api/payments/_archive/initialize/+server.ts`
- No longer needed (SDK initializes payment client-side)

---

### 6. Update `/api/payments/verify/+server.ts`

- Route stays the same
- Now receives `transactionReference` from client (fired by `MonnifySDK.onComplete` callback)
- Update `verifyPayment()` call to use Monnify field names
- Remove any kobo ↔ naira conversion

---

### 7. Update `src/app.html`

- Add Monnify JS SDK script tag:
  `<script src="https://sdk.monnify.com/plugin/monnify.js"></script>`

---

### 8. Update `/checkout/+page.svelte`

- **Disable** wallet balance display and wallet payment flow (`processCheckout` function) — wrap in `<!-- ARCHIVED -->` comment block
- **Remove** `payWithKorapay()` — replace with `payWithMonnify()`
- New `payWithMonnify()` flow:
  1. Create order via existing `createOrder()`
  2. Call `MonnifySDK.initialize({ amount, customerEmail, customerFullName, apiKey, contractCode, reference, paymentDescription })`
  3. `onComplete(response)` → POST `response.transactionReference` to `/api/payments/verify`
  4. On success → clear cart → redirect to `/dashboard`
  5. `onClose()` → leave order as pending (user can retry)
- Remove wallet-related imports (`Wallet` icon, `loadWalletBalance`, etc.)

---

### 9. Archive `/checkout/verify/+page.svelte`

- Keep the file but mark it archived at the top
- Was only needed for the redirect flow which is no longer the primary path

---

### 10. Disable Wallet-Facing Routes

Return `410 Gone` from these routes (do not delete the files):

- `src/routes/api/wallet/fund/+server.ts`

---

### 11. Replace Korapay Webhook with Monnify Webhook

#### a. Create `/api/webhooks/monnify/+server.ts`

- Verify signature: HMAC-SHA512 of raw request body, header: `monnify-signature`
- Handle events:
  - `SUCCESSFUL_TRANSACTION` → mark order paid → allocate accounts
  - `FAILED_TRANSACTION` → mark order/payment as failed
- Remove wallet-funding branch (`WLT_` reference prefix logic) — wallet is disabled

#### b. Archive `/api/webhooks/korapay/+server.ts`

- Move to `src/routes/api/webhooks/_archive/korapay/+server.ts`

---

### 12. Update `.env`

- Comment out `KORAPAY_SECRET_KEY`
- Add `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE`, `MONNIFY_BASE_URL`

---

### 13. Update Monnify Dashboard Settings

- Set webhook URL to: `https://yourdomain.com/api/webhooks/monnify`
- No redirect URL needed (SDK popup, not redirect flow)

---

## Notes

- The Monnify JS SDK fires `onComplete(response)` with `transactionReference` — always verify server-side before fulfilling the order. Never trust the client's `paymentStatus`.
- `transactionReference` (e.g. `MNFY|67|...`) is Monnify's internal ref. `paymentReference` is the merchant-supplied ref. `/api/payments/verify` uses `transactionReference`.
- Access tokens expire in 1 hour — `getAccessToken()` must handle refresh logic.
- Webhook signature: HMAC-SHA512 of the **full raw body** (unlike Korapay which only signed `data`).
- Wallet code (service, routes, schema) is left intact — just inaccessible to users.
