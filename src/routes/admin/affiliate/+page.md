# Admin Affiliate Management

## Purpose

Manage affiliate program, view affiliate stats, approve/reject affiliates, set commission rates, track referrals, and process commission payouts.

## Route

`/admin/affiliate`

## File Structure

- `+page.svelte` - Affiliate management UI
- `+page.ts` - Client-side data loading

## Components Imported

- **Navigation** - Admin navigation
- **Footer** - Site footer

## Icons Used

- `Users`, `TrendingUp`, `DollarSign`, `PercentCircle`, `CheckCircle`, `XCircle`, `Eye`, `Download`, `Send` from `@lucide/svelte`

## Data Sources

### API Endpoints

**1. GET** `/api/admin/affiliate?page=1&limit=50&status=`
**Returns:**

```typescript
{
  success: boolean;
  data: {
    affiliates: AffiliateProgram[];
    totalCount: number;
    stats: {
      totalAffiliates: number;
      activeAffiliates: number;
      totalReferrals: number;
      totalSales: number;
      totalCommissions: number;
      unpaidCommissions: number;
    };
  };
}
```

**AffiliateProgram Interface:**

```typescript
interface AffiliateProgram {
	id: string;
	userId: string;
	affiliateCode: string;
	commissionRate: number; // Percentage (e.g., 10 for 10%)
	isEnabled: boolean;
	createdAt: DateTime;
	user: {
		name: string;
		email: string;
	};
	_count: {
		referrals: number;
	};
	totalSales: number;
	totalCommission: number;
	unpaidCommission: number;
}
```

**2. GET** `/api/admin/affiliate/${affiliateId}/details` - Detailed stats

**3. PUT** `/api/admin/affiliate/${affiliateId}/rate` - Update commission rate

**4. PUT** `/api/admin/affiliate/${affiliateId}/status` - Enable/disable

**5. POST** `/api/admin/affiliate/${affiliateId}/payout` - Process payout

**6. GET** `/api/admin/affiliate/payouts?page=1&limit=50` - Payout history

## Page State

```typescript
let affiliates = $state<AffiliateProgram[]>([]);
let loading = $state(true);
let stats = $state<any>(null);
let currentPage = $state(1);
let statusFilter = $state<string>('');
let selectedAffiliate = $state<AffiliateProgram | null>(null);
let showDetailsModal = $state(false);
let showPayoutModal = $state(false);
```

## Key Features

### 1. Affiliate Statistics Cards

#### Total Affiliates

- Count of all enrolled affiliates
- Icon: Users (blue)

#### Active Affiliates

- Enabled affiliate accounts
- Icon: CheckCircle (green)

#### Total Referrals

- All referred customers
- Icon: TrendingUp (purple)

#### Total Sales

- Revenue from referrals
- Icon: DollarSign (green)
- Currency formatted

#### Total Commissions

- All-time commissions earned
- Icon: PercentCircle (purple)

#### Unpaid Commissions

- Pending payouts
- Icon: Clock (orange)
- Clickable to view list

### 2. Affiliates Table

**Columns:**

- Affiliate name
- Email
- Affiliate code
- Commission rate
- Status badge (Active/Inactive)
- Referrals count
- Total sales
- Total commission
- Unpaid commission
- Joined date
- Actions

**Status Badges:**

- Active: Green badge
- Inactive: Gray badge

### 3. Affiliate Details Modal

**Overview:**

- Affiliate info (name, email, code)
- Commission rate
- Status
- Joined date
- Total stats

**Referrals Tab:**

- List of referred users
- User name and email
- Registration date
- Orders placed
- Total spent
- Commission earned

**Sales Tab:**

- Orders from referrals
- Order number
- Customer name
- Order amount
- Commission amount
- Order date
- Status

**Payouts Tab:**

- Payout history
- Payout amount
- Date processed
- Payment method
- Reference number
- Status

**Actions:**

- Edit commission rate
- Enable/disable affiliate
- Process payout
- View referrals
- Export data

### 4. Commission Rate Management

**Edit Rate Modal:**

- Current rate display
- New rate input (percentage)
- Apply to: Future orders only / All unpaid
- Reason for change (optional)
- Save button

**Default Rate:**

- Set platform-wide default (e.g., 10%)
- Applied to new affiliates

### 5. Payout Processing

**Payout Modal:**

- Affiliate name
- Unpaid commission amount
- Payment method:
  - Credit to wallet
  - Bank transfer
  - Manual (mark as paid)
- Reference number input
- Notes
- Process button

**Payout Flow:**

1. Select affiliate
2. Confirm unpaid amount
3. Choose payment method
4. Enter reference/details
5. Process payout
6. Create CommissionPayout record
7. Reset unpaid commission to 0

### 6. Payout History

**Separate view or tab:**

- All processed payouts
- Affiliate name
- Amount
- Date
- Payment method
- Reference
- Status
- Admin who processed

### 7. Filters

- All Affiliates
- Active only
- Inactive only
- Has unpaid commission
- By commission rate range

### 8. Bulk Actions

- Select multiple affiliates
- Bulk enable/disable
- Bulk rate update
- Bulk payout processing
- Export selected

## User Actions

### Viewing

- Filter by status
- View affiliate details
- View referral list
- View sales history
- View payout history

### Management

- Update commission rates
- Enable/disable affiliates
- Process payouts
- Export affiliate data
- Set default commission rate

## API Request Examples

### Get Affiliates

```typescript
GET /api/admin/affiliate?page=1&limit=50&status=enabled
```

### Get Affiliate Details

```typescript
GET /api/admin/affiliate/${affiliateId}/details

Response:
{
  success: boolean;
  data: {
    affiliate: AffiliateProgram;
    referrals: User[];
    sales: Order[];
    payouts: CommissionPayout[];
  }
}
```

### Update Commission Rate

```typescript
PUT /api/admin/affiliate/${affiliateId}/rate
{
  newRate: 15,
  applyTo: "future" | "all_unpaid",
  reason: "Performance bonus"
}
```

### Enable/Disable Affiliate

```typescript
PUT /api/admin/affiliate/${affiliateId}/status
{
  isEnabled: true
}
```

### Process Payout

```typescript
POST /api/admin/affiliate/${affiliateId}/payout
{
  amount: 50000,
  method: "wallet" | "bank_transfer" | "manual",
  reference: "TXN123456",
  notes: "Monthly payout"
}
```

## SEO Metadata

- **Title**: "Affiliate Management - Admin - FastAccs"
- **Robots**: "noindex, nofollow"

## Security

- Admin role required
- Validate commission rates (0-100%)
- Verify unpaid amounts before payout
- Log all rate changes
- Log all payouts

## Related Pages

- `/admin/users/${userId}` - View affiliate user profile
- `/admin/orders` - View referred orders

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
├── Modal components
└── Affiliate API
```

## Backend Services Used

- `src/lib/services/affiliate.ts` - Affiliate operations
- `src/routes/api/admin/affiliate/+server.ts` - Main endpoint

## Database Operations

### Get Affiliates

```typescript
const affiliates = await prisma.affiliateProgram.findMany({
	where: {
		isEnabled: statusFilter === 'active' ? true : undefined
	},
	include: {
		user: {
			select: { name: true, email: true }
		},
		_count: {
			select: { commissions: true }
		}
	}
});

// Calculate totals
for (const affiliate of affiliates) {
	const orders = await prisma.order.findMany({
		where: { affiliateCode: affiliate.affiliateCode }
	});

	affiliate.totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
	affiliate.totalCommission = (affiliate.totalSales * affiliate.commissionRate) / 100;
	affiliate.unpaidCommission = await getUnpaidCommission(affiliate.id);
}
```

### Update Commission Rate

```typescript
await prisma.affiliateProgram.update({
	where: { id: affiliateId },
	data: { commissionRate: newRate }
});

// Log change
await prisma.affiliateRateChange.create({
	data: {
		affiliateId,
		oldRate,
		newRate,
		reason,
		changedBy: adminUserId
	}
});
```

### Process Payout

```typescript
// Create payout record
await prisma.commissionPayout.create({
	data: {
		affiliateId,
		amount,
		method,
		reference,
		notes,
		status: 'completed',
		processedBy: adminUserId
	}
});

// If wallet payout
if (method === 'wallet') {
	await creditWallet(affiliate.userId, amount, 'Affiliate commission payout');
}

// Mark commissions as paid
await prisma.commission.updateMany({
	where: {
		affiliateId,
		status: 'pending'
	},
	data: {
		status: 'paid',
		paidAt: new Date()
	}
});
```

## Commission Calculation

### Per Order

```typescript
// When order is completed
const commission = {
	affiliateId: affiliate.id,
	orderId: order.id,
	amount: (order.totalAmount * affiliate.commissionRate) / 100,
	status: 'pending',
	createdAt: new Date()
};

await prisma.commission.create({ data: commission });
```

### Unpaid Total

```typescript
const unpaid = await prisma.commission.aggregate({
	where: {
		affiliateId,
		status: 'pending'
	},
	_sum: { amount: true }
});

return unpaid._sum.amount || 0;
```

## Affiliate Code Format

- Format: User initials + sequential number
- Example: JD001, JD002, SM001
- Unique constraint on affiliateCode

## Performance Considerations

- Cache affiliate stats for 5 minutes
- Paginate affiliates list
- Index on affiliateCode, isEnabled
- Aggregate commissions efficiently

## Payout Methods

### Wallet Credit

- Instant credit to user's FastAccs wallet
- Can be used for purchases
- No fees

### Bank Transfer

- Manual bank transfer by admin
- Enter reference number after processing
- May take 1-3 business days

### Manual

- For cash payments or other methods
- Mark as paid with reference
- For record keeping

## Error Handling

- Invalid commission rate
- Insufficient unpaid balance
- Affiliate not found
- Duplicate payout
- Invalid payment method

## Notes

- Commissions generated when order status = 'completed'
- Commission rate can be individual or default
- Unpaid commissions accumulate until payout
- Minimum payout threshold could be added (e.g., ₦5,000)
- Export includes all affiliate data and earnings
- Consider adding monthly auto-payouts
- Consider email notifications for payouts
