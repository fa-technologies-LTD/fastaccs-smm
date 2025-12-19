# User Dashboard

## Purpose

Central hub for authenticated users to manage their account, view orders, access purchased accounts, manage wallet, view affiliate stats, and update profile. Multi-tab interface for comprehensive account management.

## Route

`/dashboard`

## File Structure

- `+page.svelte` - Main page wrapper
- `+page.server.ts` - Server-side data loading with auth check
- Uses `UserDashboard.svelte` component for all functionality

## Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global navigation
- **Footer** (`$lib/components/Footer.svelte`) - Site footer
- **UserDashboard** (`$lib/components/UserDashboard.svelte`) - Main dashboard component

## Data Sources

### Server Load (`+page.server.ts`)

```typescript
export const load: PageServerLoad = async ({ locals, fetch }) => {
	// Auth check
	if (!locals.user) {
		throw redirect(302, '/auth/login?returnUrl=/dashboard');
	}

	// Fetch orders
	const response = await fetch(`/api/orders?userId=${locals.user.id}&limit=50`);

	return {
		user: locals.user,
		orders: orders,
		error: null
	};
};
```

### UserDashboard Component APIs

**1. GET** `/api/orders?userId={userId}&limit=50`
**Returns:** User's order history

**2. GET** `/api/purchases`
**Returns:** Purchased accounts with credentials

**3. GET** `/api/affiliate/stats`
**Returns:** Affiliate performance data

**4. POST** `/api/affiliate/enable`
**Creates affiliate account**

**5. GET** `/api/wallet/balance`
**Returns:** Current wallet balance

**6. GET** `/api/wallet/transactions?limit=20`
**Returns:** Transaction history

**7. POST** `/api/wallet/fund`
**Request:** `{ amount: number }`
**Returns:** Korapay payment URL

## Dashboard Tabs

### 1. Orders Tab

**Purpose:** View order history and status

**Displays:**

- Order ID and date
- Order status (pending, processing, completed, delivered)
- Total amount
- Order items list
- Delivery method
- Estimated/actual delivery date

**Actions:**

- Reorder items (redirects to platforms)
- View order details
- Status indicators with colored badges

### 2. Purchases Tab

**Purpose:** Access delivered account credentials

**Displays:**

- Order number and date
- Platform and tier name
- Quantity purchased
- Account credentials:
  - Username
  - Password (masked/unmaskable)
  - Email
  - Email password (masked/unmaskable)
  - 2FA code (masked/unmaskable)
  - Account link
  - Account stats (followers, following, posts)

**Actions:**

- Copy credentials to clipboard
- Show/hide passwords
- Open account URLs
- View account statistics

**Security:**

- Passwords masked by default
- Toggle visibility per field
- Click-to-copy functionality

### 3. Messages Tab

**Purpose:** Order updates and notifications (placeholder)

**Status:** UI ready, backend not implemented

**Planned Features:**

- Order status updates
- System notifications
- Support messages
- Unread count indicator

### 4. Affiliate Tab

**Purpose:** Manage affiliate earnings and share referral code

**Not Enabled State:**

- "Become an Affiliate" button
- Explanation of program
- Enable affiliate mode API call

**Enabled State:**

- Affiliate code display
- Referral link with copy button
- Performance stats:
  - Total referrals count
  - Total sales amount
  - Total commission earned
- Commission rate display
- How it works explanation

**Actions:**

- Enable affiliate mode
- Copy affiliate code
- Copy referral link

### 5. Wallet Tab

**Purpose:** Manage wallet balance and view transactions

**Displays:**

- Current wallet balance (large display card)
- Fund wallet form (amount input + button)
- Transaction history:
  - Transaction type (deposit, debit, refund)
  - Amount
  - Description
  - Date and time
  - Balance after transaction

**Actions:**

- Fund wallet (min ₦100)
- Redirects to Korapay payment
- View transaction history
- Real-time balance updates

**Transaction Types:**

- **Deposit**: Green icon, money in (wallet funding)
- **Debit**: Red icon, money out (purchases)
- **Refund**: Blue icon, money in (order refunds)

### 6. Profile Settings Tab

**Purpose:** Update user profile information

**Fields:**

- Full name
- Email address
- WhatsApp number
- Telegram username

**Actions:**

- Save changes (not yet implemented)
- Cancel (clears form)

## Page State (UserDashboard Component)

```typescript
let activeTab = $state('orders'); // Current active tab
let isLoadingAffiliate = $state(false);
let affiliateData = $state<any>(null);
let walletBalance = $state<number>(0);
let walletTransactions = $state<any[]>([]);
let loadingWallet = $state(false);
let fundAmount = $state<string>('');
let purchases = $state<any[]>([]);
let loadingPurchases = $state(false);
let maskedFields = $state<Record<string, boolean>>({});
let loading = $state(false);
```

## Data Loading Strategy

Uses `$effect()` to load data when tab becomes active:

```typescript
$effect(() => {
	if (activeTab === 'affiliate') {
		loadAffiliateStats();
	} else if (activeTab === 'wallet') {
		loadWalletData();
	} else if (activeTab === 'purchases') {
		loadPurchases();
	}
});
```

## Key Features

### Dynamic Tab Switching

- Tabs: Orders, Purchases, Messages, Affiliate, Wallet, Profile
- Lazy loading of tab content
- URL query param support (e.g., `?tab=purchases`)

### Stats Cards

- Total Orders
- Completed Orders
- In Progress Orders

### User Profile Header

- Avatar with initials
- Welcome message
- Member since date
- Total spent

### Clipboard Operations

All sensitive data has copy-to-clipboard functionality with toast notifications.

### Password Masking

- Default: All passwords masked
- Toggle per-field visibility
- Uses bullet characters (•) for masking

## Authentication

- Protected route via `+page.server.ts`
- Redirects to login if not authenticated
- Preserves return URL

## User Actions

### Orders Tab

- Reorder items → Navigate to `/platforms`
- View details → (not implemented)

### Purchases Tab

- Copy username/email/password/2FA/link
- Toggle password visibility
- Open account URL (new tab)

### Affiliate Tab

- Enable affiliate mode
- Copy affiliate code
- Copy referral link

### Wallet Tab

- Enter funding amount
- Fund wallet → Redirect to Korapay
- View transaction details

### Profile Tab

- Edit profile fields
- Save changes (not implemented)

## SEO Metadata

- **Title**: "Dashboard - FastAccs"
- **Description**: "Manage your FastAccs account"

## Error Handling

- API failures show error toasts
- Empty states for:
  - No orders
  - No purchases
  - No transactions
  - Affiliate not enabled
- Loading states for async operations

## Security Considerations

- Server-side authentication check
- Protected API endpoints require auth
- Passwords masked by default
- Session-based access control

## Related Pages

- `/auth/login` - If not authenticated
- `/platforms` - From reorder button
- `/checkout` - For new purchases
- External: Korapay payment page (wallet funding)

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
└── UserDashboard
    ├── Icons (lucide-svelte)
    ├── toast store
    └── API endpoints (multiple)
```

## Backend Services Used

- `src/lib/services/orders.ts` - Order queries
- `src/lib/services/wallet.ts` - Balance and transactions
- `src/lib/services/affiliate.ts` - Affiliate stats and enable
- `src/routes/api/purchases/+server.ts` - Delivered accounts

## Database Tables Involved

- `User` - User profile
- `Order` - Order history
- `OrderItem` - Order line items
- `Account` - Purchased accounts with credentials
- `WalletTransaction` - Transaction history
- `AffiliateProgram` - Affiliate data
- `Commission` - Earnings tracking

## Notes

- Messages tab is placeholder (no backend)
- Profile save not implemented
- Reorder creates new cart (doesn't preserve items)
- Wallet minimum funding: ₦100
- Affiliate code format: INITIALS + running number (e.g., "JD001")
- All amounts displayed in Naira (₦)
- Transaction history limited to 20 records
