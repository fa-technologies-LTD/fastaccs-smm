# Admin User Management

## Purpose

Manage all registered users, view user details, edit profiles, manage roles, view user activity, handle suspensions, and track user orders and purchases.

## Route

`/admin/users`

## File Structure

- `+page.svelte` - Users list UI
- `+page.ts` - Client-side data loading

## Components Imported

- **Navigation** - Admin navigation
- **Footer** - Site footer

## Icons Used

- `Users`, `Search`, `Filter`, `Eye`, `Edit`, `Ban`, `CheckCircle`, `Mail`, `Calendar`, `ShoppingBag`, `Wallet`, `TrendingUp` from `@lucide/svelte`

## Data Sources

### API Endpoints

**1. GET** `/api/admin/users?page=1&limit=50&role=&status=&search=`
**Returns:**

```typescript
{
  success: boolean;
  data: {
    users: User[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
    stats: {
      totalUsers: number;
      activeUsers: number;
      suspendedUsers: number;
      adminUsers: number;
    };
  };
}
```

**User Interface:**

```typescript
interface User {
	id: string;
	name: string;
	email: string;
	role: 'user' | 'admin';
	status: 'active' | 'suspended' | 'banned';
	emailVerified: boolean;
	whatsapp?: string;
	telegram?: string;
	createdAt: DateTime;
	updatedAt: DateTime;
	lastLogin?: DateTime;
	_count: {
		orders: number;
		sessions: number;
	};
	orders?: Order[];
	walletBalance?: number;
	affiliateData?: AffiliateProgram;
}
```

**2. GET** `/api/admin/users/${userId}` - Get single user details

**3. PUT** `/api/admin/users/${userId}` - Update user info

**4. PUT** `/api/admin/users/${userId}/role` - Change user role

**5. PUT** `/api/admin/users/${userId}/status` - Update status (suspend/activate)

**6. DELETE** `/api/admin/users/${userId}` - Delete user account

**7. GET** `/api/admin/users/${userId}/activity` - User activity log

## Page State

```typescript
let users = $state<User[]>([]);
let loading = $state(true);
let totalCount = $state(0);
let currentPage = $state(1);
let pageSize = $state(50);
let searchQuery = $state('');
let roleFilter = $state<string>('');
let statusFilter = $state<string>('');
let stats = $state<any>(null);
let selectedUser = $state<User | null>(null);
let showDetailsModal = $state(false);
let showEditModal = $state(false);
```

## Key Features

### 1. User Statistics Cards

#### Total Users

- Count of all registered users
- Icon: Users (blue)

#### Active Users

- Users with active status
- Icon: CheckCircle (green)
- Percentage of total

#### Suspended Users

- Suspended/banned accounts
- Icon: Ban (red)
- Click to filter

#### Admin Users

- Users with admin role
- Icon: Shield (purple)

### 2. Filters & Search

#### Role Filter

- All Roles
- User
- Admin
- Affiliate (if has affiliate account)

#### Status Filter

- All Statuses
- Active
- Suspended
- Banned

#### Search

- Search by:
  - Name
  - Email
  - User ID
  - WhatsApp
  - Telegram
- Real-time search (debounced)

### 3. Users Table

**Columns:**

- Avatar/Initials
- Name
- Email
- Role badge
- Status badge
- Orders count
- Total spent
- Member since
- Last login
- Actions

**Role Badges:**

- User: Gray badge
- Admin: Purple badge with shield icon

**Status Badges:**

- Active: Green badge
- Suspended: Orange badge
- Banned: Red badge

### 4. User Details Modal

**Tabs:**

#### Profile Tab

- Full name
- Email (with verified badge)
- Role
- Status
- Member since
- Last login
- WhatsApp
- Telegram
- Edit button

#### Orders Tab

- List of all user orders
- Order number
- Date
- Amount
- Status
- Link to order details page

#### Purchases Tab

- All purchased accounts
- Platform
- Tier
- Quantity
- Purchase date
- Link to view accounts

#### Wallet Tab

- Current balance
- Transaction history
- Recent deposits
- Recent debits
- Adjust balance button (admin)

#### Affiliate Tab (if enrolled)

- Affiliate code
- Referral link
- Total referrals
- Total sales
- Total commission
- Commission rate
- Enable/disable affiliate

#### Activity Tab

- Login history
- IP addresses
- Device info
- Order history
- Account access logs
- Admin actions taken

### 5. Quick Actions per User

**Action Buttons:**

- **View Details** - Open details modal
- **Edit Profile** - Edit user info
- **Suspend/Activate** - Toggle user status
- **Change Role** - Promote to admin or demote
- **View Orders** - Filter orders by user
- **Adjust Wallet** - Add/remove wallet funds
- **Delete User** - Permanently delete (with confirmation)

### 6. Edit User Modal

**Fields:**

- Name
- Email
- Role (dropdown)
- Status (dropdown)
- WhatsApp
- Telegram
- Email verified checkbox

**Actions:**

- Save Changes
- Cancel
- Delete User

### 7. Bulk Operations

- Select multiple users
- Bulk status update
- Bulk role assignment
- Bulk export
- Send bulk email

## User Actions

### Viewing

- Filter by role
- Filter by status
- Search users
- Sort columns
- View user details
- Paginate results

### Management

- Edit user profile
- Change user role
- Suspend/activate users
- Delete users
- Adjust wallet balance
- View user activity
- Manage affiliate status

## API Request Examples

### Get Users

```typescript
GET /api/admin/users?page=1&limit=50&role=user&status=active&search=john
```

### Get User Details

```typescript
GET /api/admin/users/${userId}
```

### Update User

```typescript
PUT /api/admin/users/${userId}
{
  name: "John Doe",
  email: "john@example.com",
  whatsapp: "+2348012345678",
  telegram: "@johndoe"
}
```

### Change Role

```typescript
PUT /api/admin/users/${userId}/role
{
  role: "admin"
}
```

### Update Status

```typescript
PUT /api/admin/users/${userId}/status
{
  status: "suspended",
  reason: "Violation of terms"
}
```

### Adjust Wallet

```typescript
POST /api/admin/users/${userId}/wallet/adjust
{
  amount: 5000, // Positive to add, negative to deduct
  description: "Admin adjustment - bonus",
  type: "credit" | "debit"
}
```

### Delete User

```typescript
DELETE /api/admin/users/${userId}
```

## SEO Metadata

- **Title**: "User Management - Admin - FastAccs"
- **Robots**: "noindex, nofollow"

## Security

- Admin role required
- User passwords never shown (hashed)
- Sensitive actions require confirmation
- All admin actions logged
- Cannot delete own admin account
- Cannot demote last admin

## Related Pages

- `/admin` - Dashboard
- `/admin/orders` - View user's orders
- `/admin/wallet-transactions` - View user's wallet activity

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
├── Modal components
└── Users API
```

## Backend Services Used

- `src/lib/auth/user.ts` - User queries and updates
- `src/lib/services/wallet.ts` - Wallet adjustments
- `src/lib/services/affiliate.ts` - Affiliate management
- `src/routes/api/admin/users/+server.ts` - Main endpoint

## Database Operations

### Get Users (with filters)

```typescript
const users = await prisma.user.findMany({
	where: {
		AND: [
			role ? { role } : {},
			status ? { status } : {},
			search
				? {
						OR: [
							{ name: { contains: search, mode: 'insensitive' } },
							{ email: { contains: search, mode: 'insensitive' } },
							{ whatsapp: { contains: search } },
							{ telegram: { contains: search } }
						]
					}
				: {}
		]
	},
	include: {
		_count: {
			select: {
				orders: true,
				sessions: true
			}
		}
	},
	skip: (page - 1) * limit,
	take: limit,
	orderBy: { createdAt: 'desc' }
});
```

### Update User

```typescript
await prisma.user.update({
	where: { id: userId },
	data: {
		name,
		email,
		whatsapp,
		telegram,
		role,
		status
	}
});
```

### Get User Activity

```typescript
// Login history
const sessions = await prisma.session.findMany({
	where: { userId },
	orderBy: { createdAt: 'desc' },
	take: 50
});

// Order history
const orders = await prisma.order.findMany({
	where: { userId },
	include: { items: true },
	orderBy: { createdAt: 'desc' }
});

// Wallet transactions
const transactions = await prisma.walletTransaction.findMany({
	where: { userId },
	orderBy: { createdAt: 'desc' },
	take: 50
});
```

### Adjust Wallet Balance

```typescript
const currentBalance = await getWalletBalance(userId);
const newBalance = currentBalance + amount; // amount can be negative

await prisma.walletTransaction.create({
	data: {
		userId,
		type: amount > 0 ? 'credit' : 'debit',
		amount: Math.abs(amount),
		description,
		balanceAfter: newBalance
	}
});
```

## Performance Considerations

- Paginate users (50 per page)
- Index on email, role, status
- Debounce search (300ms)
- Cache stats for 5 minutes
- Lazy load user details

## User Roles

### User (default)

- Can place orders
- Access dashboard
- Manage profile
- Use wallet
- Become affiliate

### Admin

- All user permissions
- Access admin panel
- Manage inventory
- Manage orders
- Manage users
- View analytics
- Adjust wallets
- Process refunds

## User Status

### Active

- Normal account status
- Full platform access
- Can place orders

### Suspended

- Temporary restriction
- Cannot place orders
- Can view existing purchases
- Can be reactivated

### Banned

- Permanent restriction
- No platform access
- Cannot login
- Requires admin to unban

## Admin Actions Log

Track all admin actions on users:

- User created/updated
- Role changed
- Status changed
- Wallet adjusted
- User deleted
- Logged by admin ID and timestamp

## Error Handling

- Invalid user ID
- Cannot change own role/status
- Cannot delete last admin
- Email already exists
- Invalid role/status value

## Notes

- User deletion should be soft delete (set deletedAt)
- Cannot delete users with pending orders
- Wallet adjustments require reason/description
- Email verification status shown
- Last login time helps identify inactive accounts
- Consider adding bulk import feature
- Consider password reset functionality for users
