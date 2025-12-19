# Admin Orders Management

## Purpose

View, manage, and process all customer orders. Monitor order statuses, handle fulfillment, process refunds, view order details, and track delivery.

## Route

`/admin/orders`

## File Structure

- `+page.svelte` - Orders list UI with filters
- `+page.ts` - Client-side data loading

## Components Imported

- **Navigation** - Admin navigation
- **Footer** - Site footer

## Icons Used

- `ShoppingCart`, `Search`, `Filter`, `Eye`, `CheckCircle`, `XCircle`, `Clock`, `Package`, `Download`, `RefreshCw` from `@lucide/svelte`

## Data Sources

### API Endpoints

**1. GET** `/api/admin/orders?page=1&limit=50&status=&search=&startDate=&endDate=`
**Returns:**

```typescript
{
  success: boolean;
  data: {
    orders: Order[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
    stats: {
      totalOrders: number;
      pending: number;
      completed: number;
      failed: number;
      totalRevenue: number;
    };
  };
}
```

**Order Interface:**

```typescript
interface Order {
	id: string;
	userId: string;
	orderNumber: string;
	status: 'pending' | 'pending_payment' | 'processing' | 'completed' | 'failed' | 'refunded';
	totalAmount: number;
	paymentMethod: 'wallet' | 'korapay';
	paymentReference?: string;
	affiliateCode?: string;
	discountAmount?: number;
	deliveryMethod: string;
	estimatedDelivery?: DateTime;
	actualDelivery?: DateTime;
	createdAt: DateTime;
	updatedAt: DateTime;
	user: {
		name: string;
		email: string;
	};
	items: OrderItem[];
}
```

**2. GET** `/api/admin/orders/${orderId}` - Get single order details

**3. PUT** `/api/admin/orders/${orderId}/status` - Update order status

**4. POST** `/api/admin/orders/${orderId}/refund` - Process refund

**5. POST** `/api/admin/orders/${orderId}/fulfill` - Manual fulfillment

## Page State

```typescript
let orders = $state<Order[]>([]);
let loading = $state(true);
let totalCount = $state(0);
let currentPage = $state(1);
let pageSize = $state(50);
let searchQuery = $state('');
let statusFilter = $state<string>('');
let dateRange = $state<{ start?: Date; end?: Date }>({});
let stats = $state<any>(null);
let selectedOrder = $state<Order | null>(null);
let showDetailsModal = $state(false);
```

## Key Features

### 1. Order Statistics Cards

#### Total Orders

- Count of all orders
- Icon: ShoppingCart

#### Pending Orders

- Orders awaiting payment
- Icon: Clock (orange)
- Click to filter

#### Completed Orders

- Successfully delivered
- Icon: CheckCircle (green)

#### Failed Orders

- Payment failed or cancelled
- Icon: XCircle (red)

#### Total Revenue

- Sum of completed orders
- Icon: DollarSign
- Currency formatted

### 2. Filters & Search

#### Status Filter

- All Statuses
- Pending Payment
- Processing
- Completed
- Failed
- Refunded

#### Date Range

- Start date picker
- End date picker
- Quick filters: Today, This Week, This Month, All Time

#### Search

- Search by:
  - Order number
  - Customer name
  - Customer email
  - Payment reference
- Debounced real-time search

### 3. Orders Table

**Columns:**

- Order Number (clickable)
- Customer Name & Email
- Total Amount
- Payment Method badge
- Status badge (color-coded)
- Affiliate Code (if used)
- Date/Time
- Actions

**Status Colors:**

- Pending: Orange
- Pending Payment: Yellow
- Processing: Blue
- Completed: Green
- Failed: Red
- Refunded: Gray

**Payment Method Badges:**

- Wallet: Purple badge
- Korapay: Blue badge

### 4. Order Details Modal

**Sections:**

#### Order Information

- Order number
- Status
- Created date
- Payment method
- Payment reference
- Total amount
- Discount (if affiliate code used)

#### Customer Information

- Name
- Email
- User ID
- Account link to user profile

#### Order Items

Table showing:

- Platform
- Tier name
- Quantity
- Unit price
- Subtotal
- Delivery status
- Allocated accounts (expandable)

#### Delivery Details

- Delivery method
- Estimated delivery
- Actual delivery
- Tracking info

#### Actions Panel

- Mark as Processing
- Mark as Completed
- Process Refund
- View Accounts
- Export Order (PDF/CSV)
- Send Notification

### 5. Quick Actions per Order

**Action Buttons:**

- **View Details** - Open modal with full info
- **Fulfill Order** - Manually allocate accounts (if pending)
- **Refund** - Process refund dialog
- **Resend Email** - Resend order confirmation
- **Copy Order ID** - Quick copy

### 6. Bulk Operations

- Select multiple orders
- Bulk status update
- Bulk export
- Bulk email notifications

### 7. Order Timeline (in Details Modal)

- Order created
- Payment received
- Processing started
- Accounts allocated
- Order delivered
- User accessed accounts

## User Actions

### Viewing

- Filter by status
- Search orders
- Filter by date range
- View order details
- Sort columns
- Paginate results

### Management

- Update order status
- Process refunds
- Manually fulfill orders
- Resend notifications
- Export orders
- View allocated accounts

## API Request Examples

### Get Orders

```typescript
GET /api/admin/orders?page=1&limit=50&status=completed&search=john&startDate=2024-01-01&endDate=2024-12-31
```

### Get Order Details

```typescript
GET /api/admin/orders/${orderId}
```

### Update Status

```typescript
PUT /api/admin/orders/${orderId}/status
{
  status: "completed"
}
```

### Process Refund

```typescript
POST /api/admin/orders/${orderId}/refund
{
  reason: "Customer request",
  amount: 15000, // Full or partial
  refundToWallet: true
}
```

### Manual Fulfillment

```typescript
POST /api/admin/orders/${orderId}/fulfill
{
  items: [
    {
      orderItemId: "uuid",
      accountIds: ["acc1", "acc2"]
    }
  ]
}
```

## SEO Metadata

- **Title**: "Orders Management - Admin - FastAccs"
- **Robots**: "noindex, nofollow"

## Security

- Admin role required
- Sensitive data (passwords) masked in UI
- Refunds require confirmation
- Status changes logged

## Related Pages

- `/admin` - Dashboard
- `/admin/users/${userId}` - Customer profile
- `/admin/inventory` - Check stock for manual fulfillment

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
├── Modal components (inline)
├── DatePicker
└── Orders API
```

## Backend Services Used

- `src/lib/services/orders.ts` - Order queries and updates
- `src/lib/services/fulfillment.ts` - Account allocation
- `src/lib/services/wallet.ts` - Refund processing
- `src/routes/api/admin/orders/+server.ts` - Main endpoint

## Database Operations

### Get Orders (with filters)

```typescript
const orders = await prisma.order.findMany({
	where: {
		AND: [
			status ? { status } : {},
			search
				? {
						OR: [
							{ orderNumber: { contains: search } },
							{ user: { name: { contains: search, mode: 'insensitive' } } },
							{ user: { email: { contains: search, mode: 'insensitive' } } },
							{ paymentReference: { contains: search } }
						]
					}
				: {},
			dateRange.start ? { createdAt: { gte: dateRange.start } } : {},
			dateRange.end ? { createdAt: { lte: dateRange.end } } : {}
		]
	},
	include: {
		user: {
			select: { name: true, email: true }
		},
		items: {
			include: {
				category: {
					include: {
						parent: true
					}
				}
			}
		}
	},
	skip: (page - 1) * limit,
	take: limit,
	orderBy: { createdAt: 'desc' }
});
```

### Update Order Status

```typescript
await prisma.order.update({
	where: { id: orderId },
	data: {
		status,
		actualDelivery: status === 'completed' ? new Date() : undefined
	}
});
```

### Process Refund

```typescript
// 1. Update order status
await prisma.order.update({
	where: { id: orderId },
	data: { status: 'refunded' }
});

// 2. Return accounts to inventory
await prisma.account.updateMany({
	where: { userId: order.userId /* filter by order */ },
	data: {
		status: 'available',
		userId: null
	}
});

// 3. Credit wallet if applicable
if (refundToWallet) {
	await prisma.walletTransaction.create({
		data: {
			userId: order.userId,
			type: 'credit',
			amount: refundAmount,
			description: `Refund for order ${order.orderNumber}`,
			balanceAfter: newBalance
		}
	});
}
```

## Performance Considerations

- Paginate orders (50 per page)
- Index on status, createdAt, userId
- Debounce search (300ms)
- Cache stats for 5 minutes
- Lazy load order items

## Order Status Flow

```
pending_payment → processing → completed
       ↓              ↓           ↓
    failed        failed      refunded
```

**Status Definitions:**

- **pending**: Order created, no payment yet (shouldn't happen in current flow)
- **pending_payment**: Awaiting payment confirmation from Korapay
- **processing**: Payment received, allocating accounts
- **completed**: Accounts allocated and delivered
- **failed**: Payment failed or cancelled
- **refunded**: Order refunded, accounts returned

## Fulfillment Logic

### Automatic (Normal Flow)

1. Payment confirmed via webhook
2. Order status → processing
3. System allocates available accounts
4. Order status → completed
5. User can access accounts

### Manual (Admin Intervention)

1. Admin opens order
2. Clicks "Fulfill Order"
3. System shows available accounts
4. Admin selects specific accounts
5. Accounts assigned to customer
6. Order status → completed

## Refund Logic

### Full Refund

- All order items returned
- Full amount credited
- All accounts returned to inventory

### Partial Refund

- Specific items returned
- Proportional amount credited
- Only those accounts returned

### Refund Destinations

- **Wallet**: Credit user's FastAccs wallet
- **Original Method**: Return to card/bank (via Korapay API)

## Notifications

### Order Confirmation

- Sent on order creation
- Includes order details

### Payment Received

- Sent when payment confirmed
- Includes estimated delivery

### Order Delivered

- Sent when completed
- Includes account access instructions

### Refund Processed

- Sent when refund completed
- Includes refund amount and method

## Error Handling

- Invalid order ID
- Insufficient permissions
- Order already refunded
- No accounts available for fulfillment
- Payment gateway errors

## Notes

- Orders cannot be deleted, only marked as failed/refunded
- All status changes should be logged for audit
- Refunds may take 3-5 business days for card/bank
- Wallet refunds are instant
- Consider adding order notes/comments feature
- Export should include all order details and allocated accounts
