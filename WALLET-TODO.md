# Wallet System Implementation

## Goal

Enable users to fund a wallet and use wallet balance for payments instead of direct bank/card payments.

---

## Implementation Steps

### Phase 1: Database Schema

- [ ] Create `Wallet` model in Prisma schema
  - `id` (UUID, primary key)
  - `userId` (UUID, foreign key to User)
  - `balance` (Decimal, default 0)
  - `currency` (String, default "NGN")
  - `status` (String: active/suspended/closed)
  - `createdAt`, `updatedAt`

- [ ] Create `WalletTransaction` model
  - `id` (UUID, primary key)
  - `walletId` (UUID, foreign key to Wallet)
  - `type` (String: credit/debit)
  - `amount` (Decimal)
  - `balanceBefore` (Decimal)
  - `balanceAfter` (Decimal)
  - `reference` (String, unique)
  - `description` (String)
  - `status` (String: pending/completed/failed)
  - `metadata` (JSON)
  - `createdAt`, `updatedAt`

- [ ] Run Prisma migration

### Phase 2: Wallet Service

- [ ] Create `src/lib/services/wallet.ts`
  - `createWallet(userId)` - Auto-create wallet on user registration
  - `getWalletBalance(userId)` - Get current balance
  - `creditWallet(userId, amount, reference, description)` - Add funds
  - `debitWallet(userId, amount, reference, description)` - Deduct funds
  - `getWalletTransactions(userId, limit, offset)` - Transaction history
  - `validateSufficientBalance(userId, amount)` - Check if user can pay

### Phase 3: Wallet Funding (Top-up)

- [ ] Create API endpoint: `POST /api/wallet/fund`
  - Accept: amount, payment method (paystack/korapay)
  - Initialize payment with provider
  - Return authorization URL

- [ ] Create API endpoint: `POST /api/wallet/verify-funding`
  - Verify payment with provider
  - Credit wallet on successful payment
  - Create wallet transaction record

- [ ] Create webhook handler: `POST /api/webhooks/wallet-funding`
  - Handle async payment confirmations
  - Credit wallet automatically

- [ ] Create UI: `src/routes/wallet/fund/+page.svelte`
  - Amount input
  - Payment method selection (Paystack/Korapay)
  - "Fund Wallet" button

### Phase 4: Payment with Wallet

- [ ] Update `src/routes/checkout/+page.svelte`
  - Show wallet balance
  - Add "Pay with Wallet" option
  - Show payment method selection:
    - [ ] Wallet (if sufficient balance)
    - [ ] Paystack (Card/Bank Transfer)
    - [ ] Korapay (Multi-channel)

- [ ] Create API endpoint: `POST /api/payments/wallet`
  - Validate sufficient balance
  - Debit wallet
  - Create order
  - Allocate accounts
  - Complete order

- [ ] Update order model
  - Add `paymentMethod` values: "wallet", "paystack", "korapay"

### Phase 5: Wallet Dashboard

- [ ] Create `src/routes/wallet/+page.svelte`
  - Display current balance
  - "Fund Wallet" button
  - Transaction history table
  - Filter by type (credit/debit)
  - Date range filter

- [ ] Add wallet link to main navigation
- [ ] Add wallet balance indicator in navigation bar

### Phase 6: Auto-create Wallets

- [ ] Update user registration flow
  - Auto-create wallet when user signs up
  - Set initial balance to 0

- [ ] Create migration script for existing users
  - Create wallets for all existing users

### Phase 7: Wallet Security & Validation

- [ ] Add transaction limits
  - Minimum funding amount
  - Maximum wallet balance
  - Daily transaction limits

- [ ] Add concurrency controls
  - Use database transactions for wallet operations
  - Prevent race conditions on balance updates
  - Implement idempotency keys

- [ ] Add wallet PIN/2FA (optional)
  - Require PIN for wallet payments
  - SMS/Email OTP for large amounts

### Phase 8: Additional Features (Optional)

- [ ] Wallet-to-wallet transfers
- [ ] Referral bonuses (credit wallet)
- [ ] Cashback system
- [ ] Withdrawal to bank account
- [ ] Wallet statement export (PDF/CSV)
- [ ] Low balance notifications

---

## Payment Flow Comparison

### Current Flow (Direct Payment)

1. User adds items to cart
2. User goes to checkout
3. User selects Paystack/Korapay
4. Redirected to payment gateway
5. Payment processed
6. Order completed

### New Flow (Wallet Payment)

1. User adds items to cart
2. User goes to checkout
3. User selects "Pay with Wallet"
4. System checks wallet balance
5. If sufficient: Debit wallet immediately
6. Order completed instantly
7. If insufficient: Show "Fund Wallet" option

### Wallet Funding Flow

1. User clicks "Fund Wallet"
2. User enters amount
3. User selects payment method (Paystack/Korapay)
4. Redirected to payment gateway
5. Payment processed
6. Wallet credited automatically
7. User redirected to wallet dashboard

---

## Database Relationships

```
User (1) -----> (1) Wallet
Wallet (1) -----> (Many) WalletTransaction
Order (1) -----> (1) WalletTransaction (optional, if paid with wallet)
```

---

## Benefits

- ✅ Faster checkout (no redirect for wallet payments)
- ✅ Better user experience
- ✅ Encourage repeat purchases
- ✅ Platform loyalty (stored value)
- ✅ Reduced payment gateway fees (one-time charge for funding)
- ✅ Support for promotions/bonuses

---

## Notes

- Wallet balance should be in smallest currency unit (kobo for NGN)
- All wallet operations must be atomic (use database transactions)
- Maintain audit trail for all wallet changes
- Consider rate limiting for funding attempts
- Implement proper error handling and rollback mechanisms
