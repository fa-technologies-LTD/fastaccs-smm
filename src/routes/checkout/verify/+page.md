# Checkout Verification Page

## Purpose

Handles Korapay payment verification after user completes external payment. Validates payment status, updates order, allocates accounts, and provides feedback on transaction success/failure.

## Route

`/checkout/verify`

## Query Parameters

- `reference` - Korapay payment reference (required)
- `transaction_reference` - Alternative reference name

## File Structure

- `+page.svelte` - Verification UI with loading/success/error states
- `+page.ts` - Client-side verification logic

## Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global navigation
- **Footer** (`$lib/components/Footer.svelte`) - Site footer

## Icons Used

- `Loader`, `CheckCircle2`, `XCircle` from `@lucide/svelte`

## Data Sources

### API Endpoint

**POST** `/api/payments/verify`

**Request:**

```typescript
{
	reference: string; // Payment reference from query param
}
```

**Returns:**

```typescript
{
  success: boolean;
  status: 'success' | 'failed' | 'pending';
  message: string;
  order?: {
    id: string;
    status: string;
    totalAmount: number;
    items: OrderItem[];
  };
  error?: string;
}
```

### Data Flow

1. User redirected from Korapay with reference
2. `+page.ts` extracts reference from URL
3. Calls `/api/payments/verify` with reference
4. API verifies with Korapay
5. Updates order status
6. Allocates accounts if successful
7. Returns verification result to UI

## Page State

```typescript
let { data } = $props();
// data contains: { status, message, order, reference }
```

## Verification States

### 1. Loading State

**Shows when:** Initial verification in progress
**Display:**

- Spinning loader animation
- "Verifying payment..." message
- Processing indicator

### 2. Success State

**Shows when:** `data.status === 'success'`
**Display:**

- Green check circle icon
- Success message
- Order summary:
  - Order ID
  - Total amount paid
  - Items purchased
  - Account delivery info
- "View Purchases" button → `/dashboard?tab=purchases`
- "Continue Shopping" button → `/platforms`

### 3. Failed State

**Shows when:** `data.status === 'failed'`
**Display:**

- Red X circle icon
- Failure message
- Error explanation
- Support contact info
- "Try Again" button → `/checkout`
- "Contact Support" button → `/support`

### 4. Pending State

**Shows when:** `data.status === 'pending'`
**Display:**

- Warning icon
- Pending message
- "Payment still processing" explanation
- Reference number for tracking
- "Refresh Status" button
- "Contact Support if delayed"

## Verification Process

### Backend Flow (`/api/payments/verify`)

```
1. Receive reference
2. Find order by payment reference
3. Call Korapay API to verify payment
4. Check payment status:
   - success → Update order, allocate accounts
   - failed → Update order to failed
   - pending → Keep as pending_payment
5. Return status and order details
```

### Account Allocation (Success Only)

```
1. Mark order as completed
2. Query available accounts for each tier
3. Assign accounts to order items
4. Update account status to sold
5. Record delivery in OrderItem
```

## User Actions

### Success State

- View Purchases → `/dashboard?tab=purchases`
- Continue Shopping → `/platforms`

### Failed State

- Try Again → `/checkout` (cart should still be saved)
- Contact Support → `/support`

### Pending State

- Refresh Status → Reload page
- Wait and check dashboard later

## Error Handling

### No Reference

- Redirects to `/checkout`
- Shows error toast

### Invalid Reference

- Shows failed state
- Message: "Payment reference not found"

### API Error

- Shows failed state
- Generic error message
- Suggests contacting support

### Network Error

- Shows pending state
- Suggests refreshing

## SEO Metadata

- **Title**: "Verifying Payment - FastAccs"
- **Description**: "Processing your payment..."
- **Robots**: "noindex, nofollow" (no need to index payment pages)

## Security Considerations

- Reference validated on backend
- Payment status verified with Korapay directly
- No trust in client-side data
- Order ownership verified

## Webhook Backup

Even if verification page fails, webhook at `/api/webhooks/korapay` will process payment when Korapay sends notification.

## Related Pages

- `/checkout` - Return to checkout
- `/dashboard?tab=purchases` - View purchased accounts
- `/platforms` - Continue shopping
- `/support` - Get help with failed payment

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
└── PageData from +page.ts
    ├── status
    ├── message
    ├── order (optional)
    └── reference
```

## Backend Services Used

- `src/lib/services/payment.ts` - Korapay verification
- `src/lib/services/orders.ts` - Order status update
- `src/lib/services/fulfillment.ts` - Account allocation

## Database Operations

1. Find Order by payment reference
2. Update Order status (completed/failed)
3. Query available Accounts
4. Update Account.userId (assign ownership)
5. Update Account.status to 'sold'
6. Create OrderItem delivery records

## Payment Statuses

### Korapay Statuses

- `success` - Payment completed successfully
- `failed` - Payment declined or failed
- `pending` - Still processing
- `expired` - Payment session expired

### Order Statuses

- `pending_payment` - Awaiting payment
- `completed` - Payment confirmed, accounts allocated
- `failed` - Payment failed
- `processing` - Manual review needed

## Timeout Handling

- Payment verification may take 3-30 seconds
- Page shows loading state during this time
- If verification exceeds 30s, shows pending state
- User can refresh to check again

## Notes

- This page is return URL from Korapay
- Korapay appends `?reference=xxx` to URL
- Webhook is authoritative source of truth
- Page provides immediate user feedback
- Account credentials available immediately after success
- Failed payments don't consume inventory
- Reference format: `ref_${orderId}_${timestamp}`
