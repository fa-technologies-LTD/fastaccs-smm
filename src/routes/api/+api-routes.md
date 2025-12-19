# API Routes Documentation

## Overview

All API routes follow RESTful conventions and return JSON responses. All routes require appropriate authentication unless specified.

---

## Public API Routes

### `/api/categories/+server.ts`

Get all active platforms (categories without parent)

**GET** `/api/categories`

- **Auth:** Not required
- **Returns:** List of platforms with tier counts
- **Used by:** Homepage, Platforms page

### `/api/categories/slug/[slug]/+server.ts`

Get platform details by slug

**GET** `/api/categories/slug/${slug}`

- **Auth:** Not required
- **Params:** `slug` - Platform slug (e.g., "instagram")
- **Returns:** Platform category details

### `/api/categories/tiers/[platformId]/+server.ts`

Get tiers for a platform

**GET** `/api/categories/tiers/${platformId}`

- **Auth:** Not required
- **Params:** `platformId` - UUID of platform
- **Returns:** Array of tiers with pricing and availability

---

## Authentication API Routes

### `/api/auth/login/+server.ts`

User login with email/password

**POST** `/api/auth/login`

- **Auth:** Not required
- **Body:** `{ email: string, password: string }`
- **Returns:** `{ success: boolean, message: string }`
- **Sets:** Session cookie

### `/api/auth/signup/+server.ts`

User registration

**POST** `/api/auth/signup`

- **Auth:** Not required
- **Body:** `{ name: string, email: string, password: string, confirmPassword: string }`
- **Returns:** `{ success: boolean, userId: string }`
- **Sets:** Session cookie

### `/api/auth/logout/+server.ts`

User logout

**POST** `/api/auth/logout`

- **Auth:** Required
- **Returns:** `{ success: boolean }`
- **Clears:** Session cookie

### `/api/auth/google/+server.ts`

Initiate Google OAuth

**GET** `/api/auth/google`

- **Auth:** Not required
- **Redirects:** To Google OAuth consent page

### `/api/auth/google/callback/+server.ts`

Handle Google OAuth callback

**GET** `/api/auth/callback/google`

- **Auth:** Not required
- **Query:** `code` - OAuth authorization code
- **Returns:** Redirect to dashboard
- **Sets:** Session cookie

---

## User API Routes

### `/api/orders/+server.ts`

Get user's orders

**GET** `/api/orders?userId=${userId}&limit=50`

- **Auth:** Required (user or admin)
- **Query:** `userId`, `limit`
- **Returns:** Array of orders with items

### `/api/purchases/+server.ts`

Get user's purchased accounts

**GET** `/api/purchases`

- **Auth:** Required
- **Returns:** Array of delivered accounts with credentials
- **Used by:** Dashboard purchases tab

---

## Checkout & Payment API Routes

### `/api/checkout/wallet/+server.ts`

Process wallet payment

**POST** `/api/checkout/wallet`

- **Auth:** Required
- **Body:**
  ```typescript
  {
    items: CartItem[];
    affiliateCode?: string;
    totalAmount: number;
  }
  ```
- **Returns:**
  ```typescript
  {
  	success: boolean;
  	orderId: string;
  	message: string;
  }
  ```
- **Actions:** Creates order, debits wallet, allocates accounts

### `/api/payments/initialize/+server.ts`

Initialize Korapay payment

**POST** `/api/payments/initialize`

- **Auth:** Required
- **Body:** `{ orderId: string }`
- **Returns:**
  ```typescript
  {
  	success: boolean;
  	authorizationUrl: string;
  	reference: string;
  }
  ```

### `/api/payments/verify/+server.ts`

Verify Korapay payment

**POST** `/api/payments/verify`

- **Auth:** Required
- **Body:** `{ reference: string }`
- **Returns:**
  ```typescript
  {
  	success: boolean;
  	status: 'success' | 'failed' | 'pending';
  	order: Order;
  }
  ```
- **Actions:** Verifies payment, allocates accounts if successful

---

## Wallet API Routes

### `/api/wallet/balance/+server.ts`

Get wallet balance

**GET** `/api/wallet/balance`

- **Auth:** Required
- **Returns:** `{ success: boolean, balance: number }`

### `/api/wallet/transactions/+server.ts`

Get transaction history

**GET** `/api/wallet/transactions?limit=20`

- **Auth:** Required
- **Query:** `limit`
- **Returns:** Array of wallet transactions

### `/api/wallet/fund/+server.ts`

Fund wallet via Korapay

**POST** `/api/wallet/fund`

- **Auth:** Required
- **Body:** `{ amount: number }` (minimum 100)
- **Returns:**
  ```typescript
  {
  	success: boolean;
  	authorizationUrl: string;
  	reference: string;
  }
  ```
- **Redirects:** To Korapay payment page

---

## Affiliate API Routes

### `/api/affiliate/validate/+server.ts`

Validate affiliate code

**POST** `/api/affiliate/validate`

- **Auth:** Not required
- **Body:** `{ affiliateCode: string }`
- **Returns:**
  ```typescript
  {
  	success: boolean;
  	valid: boolean;
  	discountPercentage: number;
  	affiliateCode: string;
  }
  ```

### `/api/affiliate/enable/+server.ts`

Enable affiliate for user

**POST** `/api/affiliate/enable`

- **Auth:** Required
- **Returns:**
  ```typescript
  {
  	success: boolean;
  	affiliateCode: string;
  	commissionRate: number;
  }
  ```

### `/api/affiliate/stats/+server.ts`

Get affiliate statistics

**GET** `/api/affiliate/stats`

- **Auth:** Required (must be affiliate)
- **Returns:**
  ```typescript
  {
  	success: boolean;
  	data: {
  		affiliateCode: string;
  		commissionRate: number;
  		totalReferrals: number;
  		totalSales: number;
  		totalCommission: number;
  	}
  }
  ```

---

## Webhook API Routes

### `/api/webhooks/korapay/+server.ts`

Receive Korapay payment webhooks

**POST** `/api/webhooks/korapay`

- **Auth:** Korapay signature verification
- **Body:** Korapay webhook payload
- **Returns:** `{ success: boolean }`
- **Actions:** Verifies payment, updates order, allocates accounts

---

## Admin API Routes

### `/api/admin/stats/overview/+server.ts`

Get dashboard statistics

**GET** `/api/admin/stats/overview`

- **Auth:** Required (admin only)
- **Returns:**
  ```typescript
  {
    success: boolean;
    data: {
      totalUsers: number;
      totalOrders: number;
      totalRevenue: number;
      pendingOrders: number;
      totalAccounts: number;
      availableAccounts: number;
      soldAccounts: number;
      reservedAccounts: number;
      recentOrders: Order[];
      lowStockCategories: Category[];
    };
  }
  ```

### `/api/admin/inventory/+server.ts`

Manage inventory

**GET** `/api/admin/inventory`

- **Auth:** Required (admin)
- **Query:** `page`, `limit`, `platform`, `status`, `search`
- **Returns:** Paginated accounts list

**POST** `/api/admin/inventory`

- **Auth:** Required (admin)
- **Body:** Account data
- **Returns:** Created account

**PUT** `/api/admin/inventory/${id}`

- **Auth:** Required (admin)
- **Body:** Updated account data
- **Returns:** Updated account

**DELETE** `/api/admin/inventory/${id}`

- **Auth:** Required (admin)
- **Returns:** Success message

### `/api/admin/orders/+server.ts`

Manage orders

**GET** `/api/admin/orders`

- **Auth:** Required (admin)
- **Query:** `page`, `limit`, `status`, `search`, `startDate`, `endDate`
- **Returns:** Paginated orders list with stats

**GET** `/api/admin/orders/${id}`

- **Auth:** Required (admin)
- **Returns:** Detailed order information

**PUT** `/api/admin/orders/${id}/status`

- **Auth:** Required (admin)
- **Body:** `{ status: string }`
- **Returns:** Updated order

**POST** `/api/admin/orders/${id}/refund`

- **Auth:** Required (admin)
- **Body:**
  ```typescript
  {
  	reason: string;
  	amount: number;
  	refundToWallet: boolean;
  }
  ```
- **Returns:** Success message

**POST** `/api/admin/orders/${id}/fulfill`

- **Auth:** Required (admin)
- **Body:**
  ```typescript
  {
  	items: Array<{
  		orderItemId: string;
  		accountIds: string[];
  	}>;
  }
  ```
- **Returns:** Success message

### `/api/admin/users/+server.ts`

Manage users

**GET** `/api/admin/users`

- **Auth:** Required (admin)
- **Query:** `page`, `limit`, `role`, `status`, `search`
- **Returns:** Paginated users list

**GET** `/api/admin/users/${id}`

- **Auth:** Required (admin)
- **Returns:** Detailed user information

**PUT** `/api/admin/users/${id}`

- **Auth:** Required (admin)
- **Body:** Updated user data
- **Returns:** Updated user

**PUT** `/api/admin/users/${id}/role`

- **Auth:** Required (admin)
- **Body:** `{ role: string }`
- **Returns:** Updated user

**PUT** `/api/admin/users/${id}/status`

- **Auth:** Required (admin)
- **Body:** `{ status: string, reason?: string }`
- **Returns:** Updated user

**DELETE** `/api/admin/users/${id}`

- **Auth:** Required (admin)
- **Returns:** Success message

**GET** `/api/admin/users/${id}/activity`

- **Auth:** Required (admin)
- **Returns:** User activity logs

**POST** `/api/admin/users/${id}/wallet/adjust`

- **Auth:** Required (admin)
- **Body:**
  ```typescript
  {
  	amount: number;
  	description: string;
  	type: 'credit' | 'debit';
  }
  ```
- **Returns:** Updated wallet balance

### `/api/admin/categories/+server.ts`

Manage categories

**POST** `/api/admin/categories`

- **Auth:** Required (admin)
- **Body:** Category data
- **Returns:** Created category

**PUT** `/api/admin/categories/${id}`

- **Auth:** Required (admin)
- **Body:** Updated category data
- **Returns:** Updated category

**DELETE** `/api/admin/categories/${id}`

- **Auth:** Required (admin)
- **Returns:** Success message

**PUT** `/api/admin/categories/${id}/reorder`

- **Auth:** Required (admin)
- **Body:** `{ displayOrder: number }`
- **Returns:** Updated category

### `/api/admin/batches/+server.ts`

Manage bulk uploads

**GET** `/api/admin/batches`

- **Auth:** Required (admin)
- **Query:** `page`, `limit`
- **Returns:** Paginated batches list

**POST** `/api/admin/batches/upload`

- **Auth:** Required (admin)
- **Content-Type:** multipart/form-data
- **Body:** CSV file, platform, tier, columnMapping
- **Returns:** Created batch

**POST** `/api/admin/batches/${id}/process`

- **Auth:** Required (admin)
- **Returns:** Processing status

**GET** `/api/admin/batches/${id}`

- **Auth:** Required (admin)
- **Returns:** Batch details with errors

**DELETE** `/api/admin/batches/${id}`

- **Auth:** Required (admin)
- **Returns:** Success message

**GET** `/api/admin/batches/${id}/download-errors`

- **Auth:** Required (admin)
- **Returns:** CSV file with errors

**GET** `/api/admin/batches/template`

- **Auth:** Required (admin)
- **Returns:** CSV template file

### `/api/admin/affiliate/+server.ts`

Manage affiliates

**GET** `/api/admin/affiliate`

- **Auth:** Required (admin)
- **Query:** `page`, `limit`, `status`
- **Returns:** Paginated affiliates list with stats

**GET** `/api/admin/affiliate/${id}/details`

- **Auth:** Required (admin)
- **Returns:** Detailed affiliate information

**PUT** `/api/admin/affiliate/${id}/rate`

- **Auth:** Required (admin)
- **Body:**
  ```typescript
  {
    newRate: number;
    applyTo: 'future' | 'all_unpaid';
    reason?: string;
  }
  ```
- **Returns:** Updated affiliate

**PUT** `/api/admin/affiliate/${id}/status`

- **Auth:** Required (admin)
- **Body:** `{ isEnabled: boolean }`
- **Returns:** Updated affiliate

**POST** `/api/admin/affiliate/${id}/payout`

- **Auth:** Required (admin)
- **Body:**
  ```typescript
  {
    amount: number;
    method: 'wallet' | 'bank_transfer' | 'manual';
    reference?: string;
    notes?: string;
  }
  ```
- **Returns:** Payout record

**GET** `/api/admin/affiliate/payouts`

- **Auth:** Required (admin)
- **Query:** `page`, `limit`
- **Returns:** Paginated payout history

---

## Response Format

### Success Response

```typescript
{
  success: true,
  data: any,
  message?: string
}
```

### Error Response

```typescript
{
  success: false,
  error: string,
  message?: string
}
```

## HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

## Authentication

- Session-based using cookies
- Session ID stored in `session` cookie
- Admin endpoints check `user.role === 'admin'`
- User endpoints check `user` exists in session

## Rate Limiting

Consider implementing:

- Login: 5 attempts per 15 minutes
- API calls: 100 requests per minute
- Webhook: No limit (trusted source)

## Notes

- All dates in ISO 8601 format
- All amounts in kobo (₦100 = 10000)
- All responses are JSON
- CORS enabled for same-origin only
