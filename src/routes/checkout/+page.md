# Checkout Page

## Purpose

Complete purchase flow where users review cart items, apply affiliate codes, select payment method (wallet or Korapay), and place orders. Handles both wallet-based and external payment gateway transactions.

## Route

`/checkout`

## File Structure

- `+page.svelte` - Main checkout UI
- `+page.server.ts` - Server-side data loading (user info)

## Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global navigation
- **Footer** (`$lib/components/Footer.svelte`) - Site footer

## Icons Used

- `ArrowLeft`, `ShoppingBag`, `CreditCard`, `Mail`, `Check`, `Lock`, `Tag`, `Wallet` from `@lucide/svelte`

## Data Sources

### Server Load (`+page.server.ts`)

```typescript
export const load: PageServerLoad = async ({ locals }) => {
	return {
		user: locals.user // From hooks.server.ts session
	};
};
```

### API Endpoints Used

**1. POST** `/api/affiliate/validate`
**Request:**

```typescript
{
	affiliateCode: string;
}
```

**Returns:**

```typescript
{
  success: boolean;
  valid: boolean;
  discountPercentage: number;
  affiliateCode: string;
  error?: string;
}
```

**2. POST** `/api/checkout/wallet`
**Request:**

```typescript
{
  items: CartItem[];
  affiliateCode?: string;
  totalAmount: number;
}
```

**Returns:**

```typescript
{
  success: boolean;
  orderId: string;
  message: string;
  error?: string;
}
```

**3. POST** `/api/payments/initialize`
**Request:**

```typescript
{
	orderId: string;
}
```

**Returns:**

```typescript
{
  success: boolean;
  authorizationUrl: string;
  reference: string;
  error?: string;
}
```

**4. GET** `/api/wallet/balance`
**Returns:**

```typescript
{
	success: boolean;
	balance: number;
}
```

## Page State

### Reactive State

```typescript
let loading = $state(false);
let processingPayment = $state(false);
let currentOrderId = $state<string | null>(null);
let affiliateCode = $state<string | null>(null);
let affiliateDiscount = $state<number>(0);
let validatingAffiliate = $state(false);
let walletBalance = $state<number>(0);
let loadingBalance = $state(false);
```

### Computed Values

```typescript
let subtotal = $derived(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
let discountAmount = $derived(affiliateCode ? (subtotal * affiliateDiscount) / 100 : 0);
let total = $derived(subtotal - discountAmount);
let hasEnoughBalance = $derived(walletBalance >= total);
```

## Key Features

### 1. Cart Review

- Display all cart items
- Show tier name, quantity, unit price
- Allow quantity adjustment
- Remove item option
- Real-time subtotal calculation

### 2. Affiliate Code System

- Input field for affiliate code
- "Validate" button
- Real-time validation via API
- Shows discount percentage on success
- Visual feedback (green badge, discount amount)
- Discount applied to subtotal

### 3. Payment Method Selection

#### Option A: Pay with Wallet

- Shows current wallet balance
- Validates sufficient funds
- Instant order creation and fulfillment
- Redirects to dashboard on success
- Requires authentication

#### Option B: Pay with Card/Bank (Korapay)

- External payment gateway
- Redirects to Korapay checkout
- Returns to `/checkout/verify` after payment
- Supports cards, bank transfer, mobile money

### 4. Order Summary Panel

- Subtotal calculation
- Affiliate discount (if applied) - highlighted in green
- Total amount
- Items count
- Sticky on desktop

### 5. Authentication Gate

- Shows login status
- Requires login to checkout
- Displays user name/email if logged in
- "Login to Continue" button if not authenticated
- Preserves cart on login redirect

## User Flow

### Wallet Payment Flow

```
1. User on checkout page
2. Validates affiliate code (optional)
3. Clicks "Pay with Wallet"
4. System checks wallet balance
5. Creates order via API
6. Debits wallet
7. Allocates accounts
8. Redirects to /dashboard (purchases tab)
```

### Korapay Payment Flow

```
1. User on checkout page
2. Validates affiliate code (optional)
3. Clicks "Pay with Card/Bank"
4. Creates order (status: pending_payment)
5. Initializes Korapay payment
6. Redirects to Korapay (external)
7. User completes payment
8. Korapay webhook hits /api/webhooks/korapay
9. System verifies payment
10. Allocates accounts
11. Redirects to /checkout/verify
```

## Price Calculations

```typescript
// Subtotal
items.reduce(
	(sum, item) => sum + item.price * item.quantity,
	0
)(
	// Discount
	subtotal * discountPercentage
) / 100;

// Total
subtotal - discountAmount;
```

## Cart Integration

```typescript
import { cart } from '$lib/stores/cart.svelte';

// Cart operations
cart.items; // Array of cart items
cart.clear(); // Empty cart after successful order
cart.itemCount; // Total items
```

## Authentication Handling

```typescript
let { data } = $props();
const user = $derived(data.user);

// Show login gate if no user
{#if !user}
  <div>Login Required</div>
{/if}
```

## Error Handling

- Wallet insufficient funds → Show error toast
- API failures → Show error toast with message
- Affiliate code invalid → Show error, clear code
- Empty cart → Redirect to platforms
- Payment initialization failed → Show error

## Success Handling

- **Wallet payment**:
  - Clear cart
  - Show success toast
  - Redirect to `/dashboard?tab=purchases`
- **Korapay payment**:
  - Store order ID
  - Clear cart
  - Redirect to Korapay URL (external)
  - User returns to `/checkout/verify` after payment

## SEO Metadata

- **Title**: "Checkout - FastAccs"
- **Description**: "Complete your purchase securely"

## Security Considerations

- Requires authentication for checkout
- Server-side order validation
- Wallet balance checked on backend
- Payment reference validation
- Webhook signature verification (Korapay)

## Related Pages

- `/platforms` - Continue shopping
- `/dashboard` - After successful wallet payment
- `/checkout/verify` - After Korapay payment
- `/auth/login` - If not authenticated

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
├── cart store (reactive)
├── toast store (notifications)
└── PageData from +page.server.ts
    └── user (from session)
```

## Backend Services Used

- `src/lib/services/orders.ts` - Order creation
- `src/lib/services/wallet.ts` - Balance check, debit
- `src/lib/services/payment.ts` - Korapay initialization
- `src/lib/services/affiliate.ts` - Code validation
- `src/lib/services/fulfillment.ts` - Account allocation

## Database Operations

1. Create Order record (status: pending or pending_payment)
2. Create OrderItem records
3. Debit wallet (if wallet payment)
4. Allocate accounts from inventory
5. Update order status to completed
6. Record affiliate commission (if applicable)

## Notes

- Wallet payment is instant and auto-fulfills
- Korapay payment requires webhook confirmation
- Affiliate discount shown prominently in green
- Cart persists across page refreshes (localStorage)
- Order minimum: 1 item
- All amounts stored in kobo (₦100 = 10000 kobo)
