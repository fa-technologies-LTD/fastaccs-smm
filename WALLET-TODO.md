# Wallet System Status (Dormant)

Last updated: 2026-04-08

## Current State

The wallet subsystem is **not the active checkout path**.
Current customer payment flow is Monnify hosted checkout (`/api/payments/initialize` -> Monnify -> `/checkout/verify`).

Wallet-related Prisma models and service code are still present for possible future reactivation:

- `Wallet`
- `WalletTransaction`
- `src/lib/services/wallet.ts`
- Admin wallet views/routes

## What Is Retired Right Now

1. User-facing wallet API routes under `/api/wallet/*` are not active in current runtime.
2. Korapay is not the active payment provider.
3. Checkout does not use wallet deduction flow.

## Why Wallet Code Is Kept

1. Product may switch back to wallet mode later.
2. Keeping schema/service code reduces future reactivation effort.
3. Historical transaction logic may still be useful for reporting/migration.

## If We Reactivate Wallet Later

1. Reintroduce authenticated `/api/wallet/*` endpoints.
2. Decide payment-provider path for wallet funding (Monnify or alternative).
3. Reconnect user dashboard wallet tab and checkout wallet option.
4. Add explicit test coverage for funding, debit, refund, and concurrency.

## Decision Log

- 2026-04-08: Wallet kept dormant by product decision; no deletion requested.
