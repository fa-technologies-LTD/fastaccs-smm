# Wallet System Implementation - COMPLETED ✅

## Goal

Enable users to fund a wallet and use wallet balance for payments instead of direct bank/card payments.

**Status**: Fully implemented and integrated with Korapay payment gateway.

---

## System Architecture

### Payment Gateway Integration

- **Primary Gateway**: Korapay API v1 (https://api.korapay.com/merchant/api/v1)
- **Authentication**: Bearer token using `KORAPAY_SECRET_KEY` from environment
- **Webhook Security**: HMAC SHA256 signature verification on `data` object only
- **Amount Format**: Kobo (smallest currency unit) for API, Naira in database
- **Channels Supported**: Card, Bank Transfer, Pay with Bank, Mobile Money

### Korapay API Endpoints Used

1. **POST /charges/initialize** - Initialize payment charges (wallet funding & order payments)
2. **GET /charges/{reference}** - Verify payment status
3. **Webhook Events**:
   - `charge.success` - Payment completed successfully
   - `charge.failed` - Payment failed

### Reference Patterns

- **Wallet Funding**: `wallet_{userId}_{timestamp}`
- **Order Payment**: `ORDER-{orderId}-{timestamp}`
- Used to distinguish payment types in webhook handler

---

## Implementation Status

### Phase 1: Database Schema ✅ COMPLETE

- ✅ **Wallet Model** (`prisma/schema.prisma`)
  - `id` (UUID, primary key, auto-generated)
  - `userId` (UUID, unique, foreign key to User with CASCADE delete)
  - `balance` (Decimal(10,2), default 0) - stored in Naira
  - `currency` (String, default "NGN")
  - `isActive` (Boolean, default true) - replaces status field
  - `createdAt`, `updatedAt` (auto-managed timestamps)
  - **Database table**: `wallets`

- ✅ **WalletTransaction Model** (`prisma/schema.prisma`)
  - `id` (UUID, primary key, auto-generated)
  - `walletId` (UUID, foreign key to Wallet with CASCADE delete)
  - `userId` (UUID, foreign key to User with CASCADE delete)
  - `type` (String: 'deposit', 'debit', 'refund')
  - `amount` (Decimal(10,2)) - transaction amount in Naira
  - `balanceBefore` (Decimal(10,2)) - balance before transaction
  - `balanceAfter` (Decimal(10,2)) - balance after transaction
  - `description` (String) - human-readable description
  - `reference` (String, unique, nullable) - payment reference or order ID
  - `paymentMethod` (String, nullable) - 'korapay' for funded transactions
  - `status` (String, default "pending") - 'pending', 'completed', 'failed'
  - `metadata` (JSON, default {}) - additional transaction data
  - `createdAt`, `updatedAt` (auto-managed timestamps)
  - **Database table**: `wallet_transactions`

- ✅ **Database Relations**:
  - User → Wallet (one-to-one, optional on User side)
  - User → WalletTransaction[] (one-to-many)
  - Wallet → WalletTransaction[] (one-to-many, cascade delete)

- ✅ Migration executed: `20251203140949_add_wallet_system`

### Phase 2: Wallet Service ✅ COMPLETE

- ✅ **Service Layer**: `src/lib/services/wallet.ts`

  **Core Functions**:
  - `getOrCreateWallet(userId)` - Auto-creates wallet if doesn't exist, returns existing wallet
  - `getWalletBalance(userId)` - Returns balance in Naira, currency, and success status
  - `fundWallet(userId, amount, reference, paymentMethod='korapay')` - Credits wallet after successful payment
    - Uses atomic Prisma transaction
    - Creates WalletTransaction record with type='deposit'
    - Updates wallet balance
    - Default payment method changed to 'korapay'
  - `debitWallet(userId, amount, orderId, description)` - Deducts funds for order payment
    - Validates sufficient balance before debit
    - Uses atomic Prisma transaction
    - Creates WalletTransaction record with type='debit'
    - Returns detailed error messages
  - `refundWallet(userId, amount, orderId, description)` - Adds funds back for refunds
    - Uses atomic Prisma transaction
    - Creates WalletTransaction record with type='refund'
  - `getWalletTransactions(userId, options)` - Retrieves transaction history
    - Options: limit (default 50), offset (default 0), type filter
    - Ordered by createdAt DESC
    - Returns transactions array and total count
  - `getTransactionByReference(reference)` - Finds transaction by unique reference
    - Used to prevent duplicate wallet credits from webhooks

  **Concurrency Safety**:
  - All balance modifications wrapped in Prisma `$transaction`
  - Atomic operations prevent race conditions
  - Balance validation inside transaction scope

### Phase 3: Wallet Funding (Top-up) ✅ COMPLETE

- ✅ **API Endpoint**: `POST /api/wallet/fund`
  - **Location**: `src/routes/api/wallet/fund/+server.ts`
  - **Authentication**: Requires logged-in user (checks `locals.user`)
  - **Input**: `{ amount: number }` (minimum ₦100 enforced in UI)
  - **Process**:
    1. Validates user authentication
    2. Validates amount > 0
    3. Generates reference: `wallet_{userId}_{timestamp}`
    4. Calls `initializePayment()` with metadata containing userId and amount
    5. Returns authorization URL for Korapay checkout
  - **Response**: `{ success, authorizationUrl, reference }`

- ✅ **Webhook Handler**: `POST /api/webhooks/korapay`
  - **Location**: `src/routes/api/webhooks/korapay/+server.ts`
  - **Security**: Verifies `x-korapay-signature` header using HMAC SHA256
  - **Process**:
    1. Extracts signature from headers
    2. Verifies signature against webhook payload's `data` object (NOT full body)
    3. Handles events:
       - **charge.success**:
         - Verifies payment with Korapay API
         - Checks reference pattern (wallet\_ = funding, ORDER- = order payment)
         - For wallet funding:
           - Extracts userId from metadata
           - Checks for duplicate processing using `getTransactionByReference()`
           - Calls `fundWallet()` to credit balance
         - For order payment:
           - Updates order status to 'paid'
           - Allocates accounts via `allocateAccountsForOrder()`
           - Marks order as 'completed'
       - **charge.failed**:
         - Marks order as 'cancelled' if order payment failed
    4. Returns `{ success: true }` to acknowledge webhook
  - **Idempotency**: Prevents duplicate credits by checking existing transactions

- ✅ **Payment Verification**: Handled asynchronously via webhook
  - Wallet credited automatically when payment succeeds
  - No manual verification endpoint needed for wallet funding
  - Order payment verification in `POST /api/payments/verify`

- ✅ **UI Component**: Wallet tab in User Dashboard
  - **Location**: `src/lib/components/UserDashboard.svelte`
  - **Features**:
    - Displays current balance with loading state
    - Amount input field for funding (validates ₦100 minimum)
    - "Fund Wallet" button triggers Korapay payment
    - Transaction history table showing:
      - Type (deposit/debit/refund) with icons
      - Amount (formatted as ₦X,XXX)
      - Description
      - Date (formatted)
      - Balance before/after
    - Auto-loads data when tab becomes active
  - **Flow**:
    1. User enters amount
    2. Clicks "Fund Wallet"
    3. Redirects to Korapay checkout
    4. Completes payment
    5. Webhook credits wallet
    6. User returns to dashboard to see updated balance

### Phase 4: Payment with Wallet ✅ COMPLETE

- ✅ **Checkout UI**: `src/routes/checkout/+page.svelte`
  - **Location**: Main checkout page
  - **Features**:
    - Displays wallet balance at top of page (loads on mount)
    - Loading indicator while fetching balance
    - Shows balance in Naira: "Wallet Balance: ₦X,XXX"
    - Two payment method buttons:
      - **"Pay with Wallet"** (primary) - instant payment if sufficient balance
      - **"Pay with Card/Bank"** (secondary) - redirects to Korapay checkout
    - Divider text: "or pay with" between buttons
    - Real-time balance validation before wallet payment
  - **Wallet Payment Flow** (`processCheckout()`):
    1. Validates user authentication (redirects to login if needed)
    2. Calculates final total with affiliate discount if applicable
    3. Checks wallet balance >= final total
    4. Shows error if insufficient: "Your wallet balance (₦X) is insufficient. Please fund your wallet first."
    5. Validates stock availability for all items
    6. Creates order with `paymentMethod: 'wallet'`
    7. Calls `POST /api/wallet/debit` to deduct funds
    8. On success: clears cart, shows success toast, redirects to dashboard
    9. Accounts allocated and delivered immediately (no webhook delay)

  - **Korapay Payment Flow** (`payWithKorapay()`):
    1. Validates user authentication
    2. Validates stock availability
    3. Creates order with `paymentMethod: 'korapay'`
    4. Calls `POST /api/payments/initialize` to get checkout URL
    5. Redirects to Korapay payment page
    6. After payment: redirects to `/checkout/verify?reference={ref}`
    7. Webhook processes payment asynchronously

- ✅ **Wallet Debit Endpoint**: `POST /api/wallet/debit`
  - **Location**: `src/routes/api/wallet/debit/+server.ts`
  - **Authentication**: Requires logged-in user
  - **Input**: `{ amount: number, orderId: string }`
  - **Process**:
    1. Validates amount > 0
    2. Validates orderId provided
    3. Calls `debitWallet()` service function
    4. Returns transaction details or error
  - **Response**: `{ success, transaction?, error? }`

- ✅ **Payment Service**: `src/lib/services/payment.ts`
  - Delegates to Korapay service layer
  - **Functions**:
    - `initializePayment()` - Wraps `initializeCharge()`
    - `verifyPayment()` - Wraps `verifyCharge()`
    - `verifyWebhookSignature()` - Wraps Korapay signature verification
    - `nairaToKobo()` / `koboToNaira()` - Currency conversion helpers

- ✅ **Korapay Service**: `src/lib/services/korapay.ts`
  - **Location**: Core payment gateway integration
  - **Functions**:
    - `initializeCharge(params)` - Creates payment charge
      - Converts amount to kobo
      - Sets redirect URL to `/checkout/verify`
      - Sets notification URL to `/api/webhooks/korapay`
      - Includes metadata for tracking
      - Returns checkout URL
    - `verifyCharge(reference)` - Verifies payment status
      - Queries Korapay API
      - Converts amount from kobo to naira
      - Returns payment details
    - `verifyWebhookSignature(signature, dataObject)` - Security verification
      - Uses HMAC SHA256
      - Signs only the `data` object (critical difference from Paystack)
      - Returns boolean validity
    - `nairaToKobo()` - Multiply by 100, rounded
    - `koboToNaira()` - Divide by 100

- ✅ **Order Payment Initialization**: `POST /api/payments/initialize`
  - **Location**: `src/routes/api/payments/initialize/+server.ts`
  - **Authentication**: Requires logged-in user
  - **Input**: `{ orderId: string }`
  - **Process**:
    1. Fetches order with items and user details
    2. Verifies order belongs to authenticated user
    3. Checks order not already paid
    4. Generates reference: `ORDER-{orderId}-{timestamp}`
    5. Converts total amount to kobo
    6. Initializes Korapay payment with order metadata
    7. Updates order status to 'pending_payment'
  - **Response**: `{ success, authorizationUrl, reference }`

- ✅ **Payment Verification**: `POST /api/payments/verify`
  - **Location**: `src/routes/api/payments/verify/+server.ts`
  - **Authentication**: Requires logged-in user
  - **Process**:
    1. Verifies payment with Korapay API
    2. Extracts orderId from payment metadata
    3. Verifies order belongs to user
    4. Updates order with payment details
    5. Allocates accounts from inventory
    6. Marks order as completed
  - **Used by**: `/checkout/verify` page after Korapay redirect

- ✅ **Order Model Updates**:
  - `paymentMethod` field supports: 'wallet', 'korapay'
  - Order creation service accepts paymentMethod parameter

### Phase 5: Wallet Dashboard ✅ COMPLETE

- ✅ **Dashboard Tab**: Integrated into User Dashboard
  - **Location**: `src/lib/components/UserDashboard.svelte` (activeTab='wallet')
  - **Features**:
    - **Balance Display**:
      - Large formatted amount: ₦X,XXX.XX
      - Currency indicator (NGN)
      - Real-time loading state
    - **Fund Wallet Section**:
      - Amount input with ₦ placeholder
      - Minimum ₦100 validation
      - "Fund Wallet" button
    - **Transaction History**:
      - Table with columns: Type, Amount, Description, Date, Balance
      - Type indicators:
        - Deposit: ↑ green icon
        - Debit: ↓ red icon
        - Refund: ↩ blue icon
      - Formatted amounts with ₦ symbol
      - Date/time display
      - Shows last 20 transactions
      - Empty state if no transactions
    - **Auto-refresh**: Loads data when tab activated

- ✅ **Balance API**: `GET /api/wallet/balance`
  - **Location**: `src/routes/api/wallet/balance/+server.ts`
  - **Authentication**: Required
  - **Response**: `{ success, balance, currency }`

- ✅ **Transactions API**: `GET /api/wallet/transactions`
  - **Location**: `src/routes/api/wallet/transactions/+server.ts`
  - **Authentication**: Required
  - **Query Params**: limit (default 50), offset (default 0), type (optional filter)
  - **Response**: `{ success, transactions[], total }`

- ✅ **Navigation Integration**:
  - Wallet tab visible in dashboard navigation
  - Accessible via activeTab state management
  - Icon: Wallet (Lucide icon)

- ⬜ **Future Enhancement**: Balance indicator in main navigation bar
  - Would require global state management
  - Could use stores to share balance across components

### Phase 6: Auto-create Wallets ✅ COMPLETE

- ✅ **Auto-creation Logic**: Implemented in `getOrCreateWallet()`
  - **Location**: `src/lib/services/wallet.ts`
  - **Behavior**:
    1. Checks if user has wallet (`findUnique`)
    2. If not found: creates wallet with balance=0, currency='NGN'
    3. Returns existing or newly created wallet
  - **Called by**: All wallet service functions automatically

- ✅ **Integration Points**:
  - Wallet funding: Creates wallet on first fund attempt
  - Wallet debit: Creates wallet (with 0 balance) if user tries to pay
  - Balance check: Creates wallet when balance viewed
  - No explicit registration hook needed - lazy initialization pattern

- ⬜ **Migration Script**: Not required
  - Wallets created on-demand for existing users
  - No batch processing needed

### Phase 7: Wallet Security & Validation ✅ COMPLETE

- ✅ **Transaction Limits**:
  - Minimum funding: ₦100 (enforced in UI)
  - Balance checks before debit operations
  - Insufficient balance errors returned with clear messages

- ✅ **Concurrency Controls**: IMPLEMENTED
  - **Atomic Transactions**: All balance modifications use Prisma `$transaction()`
    - `fundWallet()`: Updates balance + creates transaction atomically
    - `debitWallet()`: Validates balance + updates + creates transaction atomically
    - `refundWallet()`: Updates balance + creates transaction atomically
  - **Race Condition Prevention**: Database-level transaction isolation
  - **Audit Trail**: Every balance change logged in WalletTransaction with before/after snapshots

- ✅ **Idempotency**:
  - Webhook processing checks for duplicate transactions using `getTransactionByReference()`
  - Prevents double-crediting from webhook retries
  - Order payment checks prevent duplicate processing (status validation)

- ✅ **Security Measures**:
  - Authentication required for all wallet endpoints
  - User can only access their own wallet (userId validation)
  - Order ownership verified before debit
  - Webhook signature verification using HMAC SHA256
  - Environment variables for sensitive keys

- ⬜ **Future Enhancements**:
  - Maximum wallet balance limit
  - Daily transaction limits
  - Wallet PIN/2FA for payments
  - Rate limiting on funding attempts

### Phase 8: Additional Features (Future)

- ⬜ Wallet-to-wallet transfers
- ⬜ Referral bonuses (credit wallet)
- ⬜ Cashback system
- ⬜ Withdrawal to bank account (requires KYC)
- ⬜ Wallet statement export (PDF/CSV)
- ⬜ Low balance notifications
- ⬜ Scheduled/recurring wallet funding

---

## Payment Flow Documentation

### Flow 1: Wallet Funding (Async via Webhook)

```
1. User navigates to Dashboard → Wallet tab
2. User enters amount (₦100+) and clicks "Fund Wallet"
3. Frontend calls POST /api/wallet/fund with amount
4. Backend generates reference: wallet_{userId}_{timestamp}
5. Backend calls Korapay API to initialize charge
6. User redirected to Korapay checkout page
7. User completes payment on Korapay
8. Korapay sends webhook to POST /api/webhooks/korapay
9. Webhook verifies signature and payment
10. Webhook calls fundWallet() to credit balance
11. WalletTransaction created with type='deposit'
12. User sees updated balance on return to dashboard
```

**Korapay API Calls**:

- `POST /charges/initialize` - Step 5
- Webhook receives `charge.success` event - Step 8
- `GET /charges/{reference}` - Step 9 (verification)

### Flow 2: Order Payment with Wallet (Instant)

```
1. User adds items to cart and goes to checkout
2. Frontend loads wallet balance via GET /api/wallet/balance
3. User clicks "Pay with Wallet"
4. Frontend validates balance >= order total
5. Frontend creates order via POST /api/orders (paymentMethod='wallet')
6. Frontend calls POST /api/wallet/debit with orderId
7. Backend validates balance and debits wallet atomically
8. WalletTransaction created with type='debit'
9. Order status set to 'completed'
10. Accounts allocated immediately
11. Cart cleared, user redirected to dashboard
```

**No Korapay involved** - instant settlement using existing balance.

### Flow 3: Order Payment with Card/Bank (Async via Webhook)

```
1. User adds items to cart and goes to checkout
2. User clicks "Pay with Card/Bank"
3. Frontend creates order via POST /api/orders (paymentMethod='korapay')
4. Frontend calls POST /api/payments/initialize with orderId
5. Backend generates reference: ORDER-{orderId}-{timestamp}
6. Backend calls Korapay API to initialize charge
7. User redirected to Korapay checkout page
8. User completes payment
9. User redirected to /checkout/verify?reference={ref}
10. Frontend calls POST /api/payments/verify
11. Backend verifies with Korapay API
12. Backend updates order status to 'paid'
13. Backend allocates accounts
14. Alternatively: Webhook processes payment asynchronously (steps 15-17)
15. Korapay sends webhook POST /api/webhooks/korapay
16. Webhook verifies payment and order
17. Webhook allocates accounts and marks order 'completed'
18. User sees order in dashboard
```

**Korapay API Calls**:

- `POST /charges/initialize` - Step 6
- `GET /charges/{reference}` - Step 11 (frontend verification)
- Webhook receives `charge.success` event - Step 15
- `GET /charges/{reference}` - Step 16 (webhook verification)

---

## Database Schema Details

### Wallet Table

```sql
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) DEFAULT 0 NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### WalletTransaction Table

```sql
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- 'deposit', 'debit', 'refund'
  amount DECIMAL(10,2) NOT NULL,
  balance_before DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  description TEXT NOT NULL,
  reference VARCHAR(255) UNIQUE, -- nullable
  payment_method VARCHAR(50), -- nullable, 'korapay' for deposits
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  metadata JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### Relationships

```
User (1) ←→ (1) Wallet  [one-to-one, cascade delete]
User (1) → (∞) WalletTransaction  [one-to-many, cascade delete]
Wallet (1) → (∞) WalletTransaction  [one-to-many, cascade delete]
Order (1) ⇢ (0-1) WalletTransaction  [via reference field]
```

---

## Testing Checklist

### ✅ Completed Tests

- [x] Wallet auto-creation on first access
- [x] Balance retrieval for new users (returns 0)
- [x] Transaction history for empty wallet
- [x] Fund wallet UI integration

### ⬜ Pending Tests (Requires Webhook URL)

**Wallet Funding Flow**:

- [ ] Fund wallet with ₦100 using Korapay test card
- [ ] Verify webhook receives charge.success event
- [ ] Verify wallet balance increases
- [ ] Verify WalletTransaction created with type='deposit'
- [ ] Verify duplicate webhook doesn't double-credit
- [ ] Test failed payment webhook (charge.failed)

**Order Payment Flows**:

- [ ] Pay for order with sufficient wallet balance
  - Verify instant completion
  - Verify balance debited
  - Verify WalletTransaction created with type='debit'
  - Verify accounts allocated
- [ ] Attempt order payment with insufficient balance
  - Verify error message displays
  - Verify no transaction created
- [ ] Pay for order with card/bank via Korapay
  - Verify redirect to Korapay
  - Complete test payment
  - Verify webhook processes order
  - Verify order marked completed
  - Verify accounts allocated

**Edge Cases**:

- [ ] Test concurrent wallet debits (race condition)
- [ ] Test webhook signature rejection (invalid signature)
- [ ] Test payment verification with invalid reference
- [ ] Test order payment when order already completed

**Setup Required**:

1. Install LocalTunnel: `npx localtunnel --port 5173`
2. Copy public URL (e.g., https://xyz.loca.lt)
3. Configure webhook in Korapay dashboard:
   - URL: `https://xyz.loca.lt/api/webhooks/korapay`
   - Events: All charge events
4. Use Korapay test cards from documentation
5. Monitor webhook logs in terminal

---

## Benefits Achieved ✅

- ✅ **Faster checkout**: Wallet payments complete instantly without redirect
- ✅ **Better UX**: Users see balance immediately, choose payment method freely
- ✅ **Repeat purchases**: Stored balance encourages return visits
- ✅ **Platform loyalty**: Pre-funded accounts create commitment
- ✅ **Reduced fees**: One funding transaction instead of per-order gateway fees
- ✅ **Dual payment options**: Flexibility for users (wallet OR card/bank)
- ✅ **Audit trail**: Complete transaction history with before/after snapshots
- ✅ **Atomic operations**: No race conditions or partial updates
- ✅ **Security**: Webhook signature verification, authentication on all endpoints

---

## Technical Notes

### Currency Handling

- **Storage**: Decimal(10,2) in database - stores Naira with 2 decimal places
- **API Boundary**: Convert to Kobo (multiply by 100) when calling Korapay
- **Display**: Format as ₦X,XXX.XX using Intl.NumberFormat or toLocaleString()
- **Calculations**: Perform in Naira, convert at API boundary only

### Webhook Signature Verification (Critical)

```typescript
// Korapay signs ONLY the 'data' object, not the entire payload
const hash = createHmac('sha256', KORAPAY_SECRET_KEY)
	.update(JSON.stringify(dataObject)) // NOT the full body!
	.digest('hex');

return hash === signature;
```

### Reference Patterns

- **Wallet Funding**: `wallet_{userId}_{timestamp}`
  - Example: `wallet_123e4567-e89b-12d3-a456-426614174000_1702123456789`
- **Order Payment**: `ORDER-{orderId}-{timestamp}`
  - Example: `ORDER-abcd1234-5678-90ef-ghij-klmnopqrstuv-1702123456789`
- Used in webhook to determine payment type

### Atomic Transaction Pattern

```typescript
const result = await prisma.$transaction(async (tx) => {
	// 1. Update wallet balance
	const updatedWallet = await tx.wallet.update({
		where: { id: walletId },
		data: { balance: newBalance }
	});

	// 2. Create transaction record
	const transaction = await tx.walletTransaction.create({
		data: { ...transactionData }
	});

	return { wallet: updatedWallet, transaction };
});
```

If any step fails, entire transaction rolls back.

### Environment Variables

```env
KORAPAY_SECRET_KEY=sk_test_xxx  # Backend operations
KORAPAY_PUBLIC_KEY=pk_test_xxx  # Not currently used (frontend could use for SDK)
```

---

## Future Improvements

### Priority 1 (Security & Limits)

- [ ] Add maximum wallet balance limit (e.g., ₦1,000,000)
- [ ] Add daily funding limit
- [ ] Add minimum order amount for wallet payment
- [ ] Rate limiting on funding endpoint

### Priority 2 (User Experience)

- [ ] Wallet balance in navigation bar
- [ ] Low balance notification system
- [ ] Wallet statement download (PDF/CSV)
- [ ] Email notifications for transactions

### Priority 3 (Advanced Features)

- [ ] Wallet withdrawal to bank account (requires Korapay disbursement API + KYC)
- [ ] Wallet-to-wallet transfers between users
- [ ] Scheduled auto-funding
- [ ] Cashback on purchases
- [ ] Referral bonuses credited to wallet

### Priority 4 (Analytics)

- [ ] Wallet usage analytics dashboard
- [ ] Average wallet balance tracking
- [ ] Funding vs spending patterns
- [ ] Conversion rate: wallet users vs non-wallet users
