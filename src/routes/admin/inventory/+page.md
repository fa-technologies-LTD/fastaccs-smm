# Admin Inventory Management

## Purpose

Manage account inventory across all platforms and tiers. View stock levels, add/edit/delete accounts, bulk operations, filter and search inventory, handle account status changes.

## Route

`/admin/inventory`

## File Structure

- `+page.svelte` - Inventory UI with filters and table
- `+page.ts` - Client-side data loading

## Components Imported

- **Navigation** - Admin navigation
- **Footer** - Site footer

## Icons Used

- `Package`, `Plus`, `Edit`, `Trash2`, `Search`, `Filter`, `Upload`, `Download`, `Eye`, `EyeOff`, `AlertCircle`, `CheckCircle` from `@lucide/svelte`

## Data Sources

### API Endpoints

**1. GET** `/api/admin/inventory?page=1&limit=50&platform=&status=&search=`
**Returns:**

```typescript
{
  success: boolean;
  data: {
    accounts: Account[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
    filters: {
      platforms: Platform[];
      tiers: Tier[];
      statuses: string[];
    };
  };
}
```

**Account Interface:**

```typescript
interface Account {
	id: string;
	productId: string;
	username: string;
	email: string;
	emailPassword?: string;
	password: string;
	twoFactorCode?: string;
	accountLink?: string;
	stats?: {
		followers?: number;
		following?: number;
		posts?: number;
	};
	status: 'available' | 'reserved' | 'sold';
	userId?: string;
	createdAt: DateTime;
	updatedAt: DateTime;
	product: {
		category: {
			name: string; // Tier name
			parent: {
				name: string; // Platform name
			};
		};
	};
}
```

**2. POST** `/api/admin/inventory` - Add single account

**3. PUT** `/api/admin/inventory/${id}` - Update account

**4. DELETE** `/api/admin/inventory/${id}` - Delete account

**5. POST** `/api/admin/inventory/bulk` - Bulk operations

## Page State

```typescript
let accounts = $state<Account[]>([]);
let loading = $state(true);
let totalCount = $state(0);
let currentPage = $state(1);
let pageSize = $state(50);
let searchQuery = $state('');
let platformFilter = $state<string>('');
let statusFilter = $state<string>('');
let selectedAccounts = $state<Set<string>>(new Set());
let showAddModal = $state(false);
let editingAccount = $state<Account | null>(null);
```

## Key Features

### 1. Filters & Search

#### Platform Filter

- Dropdown of all platforms
- "All Platforms" option
- Updates results instantly

#### Status Filter

- Options:
  - All Statuses
  - Available (ready to sell)
  - Reserved (in cart/checkout)
  - Sold (delivered to customer)
- Color-coded badges

#### Search

- Search by:
  - Username
  - Email
  - Account link
- Real-time search (debounced)

### 2. Inventory Table

**Columns:**

- Checkbox (bulk select)
- Platform icon
- Tier name
- Username
- Email
- Status badge
- Stock count (for that tier)
- Created date
- Actions (Edit, Delete, View)

**Actions per Row:**

- **View** - Show full account details in modal
- **Edit** - Open edit form
- **Delete** - Confirm and delete

### 3. Bulk Operations

**Toolbar appears when items selected:**

- Selected count display
- Bulk actions dropdown:
  - Mark as Available
  - Mark as Reserved
  - Delete Selected
  - Export Selected
  - Assign to Tier
- "Select All" checkbox
- "Clear Selection" button

### 4. Add Account Modal

**Fields:**

- Platform (dropdown)
- Tier (dropdown, filtered by platform)
- Username (required)
- Email (required)
- Email Password
- Account Password (required)
- 2FA Code
- Account Link
- Followers count
- Following count
- Posts count
- Status (default: available)

**Actions:**

- Save & Add Another
- Save & Close
- Cancel

### 5. Edit Account Modal

Same fields as Add, pre-populated with account data.

### 6. Stock Indicators

**Status Badges:**

- **Available**: Green badge, ready to sell
- **Reserved**: Yellow badge, temporarily held
- **Sold**: Gray badge, delivered to customer

**Low Stock Warning:**

- Orange alert icon if tier has < 10 available
- Shows in table row

### 7. Pagination

- Previous/Next buttons
- Page number input
- Page size selector (25, 50, 100, 200)
- Total count display

## User Actions

### View Operations

- Filter by platform
- Filter by status
- Search accounts
- Sort columns
- Change page size
- Navigate pages

### CRUD Operations

- Add new account
- Edit existing account
- Delete account (with confirmation)
- View account details

### Bulk Operations

- Select multiple accounts
- Change status in bulk
- Delete multiple accounts
- Export to CSV

## API Request Examples

### Get Inventory

```typescript
GET /api/admin/inventory?page=1&limit=50&platform=instagram&status=available&search=john
```

### Add Account

```typescript
POST /api/admin/inventory
{
  productId: "uuid",
  username: "example_user",
  email: "user@example.com",
  emailPassword: "emailpass123",
  password: "accountpass123",
  twoFactorCode: "ABC123",
  accountLink: "https://instagram.com/example_user",
  stats: {
    followers: 10500,
    following: 850,
    posts: 42
  },
  status: "available"
}
```

### Update Account

```typescript
PUT /api/admin/inventory/${accountId}
{
  password: "newpassword123",
  status: "available"
}
```

### Delete Account

```typescript
DELETE /api/admin/inventory/${accountId}
```

### Bulk Update

```typescript
POST /api/admin/inventory/bulk
{
  operation: "updateStatus",
  accountIds: ["id1", "id2", "id3"],
  status: "available"
}
```

## SEO Metadata

- **Title**: "Inventory Management - Admin - FastAccs"
- **Robots**: "noindex, nofollow"

## Security

- Admin role required
- All API endpoints check admin auth
- Soft delete vs hard delete consideration
- Activity logging recommended

## Related Pages

- `/admin/inventory/add` - Dedicated add page (if exists)
- `/admin/batches` - Bulk CSV upload
- `/admin/categories` - Manage platforms/tiers
- `/admin` - Back to dashboard

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
├── Modal components (inline)
└── Inventory API
```

## Backend Services Used

- `src/lib/services/inventory.ts` - CRUD operations
- `src/routes/api/admin/inventory/+server.ts` - Main endpoint

## Database Operations

### Get Inventory (with filters)

```typescript
const accounts = await prisma.account.findMany({
	where: {
		AND: [
			platform ? { product: { category: { parent: { slug: platform } } } } : {},
			status ? { status } : {},
			search
				? {
						OR: [
							{ username: { contains: search, mode: 'insensitive' } },
							{ email: { contains: search, mode: 'insensitive' } }
						]
					}
				: {}
		]
	},
	include: {
		product: {
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

### Add Account

```typescript
await prisma.account.create({
	data: {
		productId,
		username,
		email,
		emailPassword,
		password,
		twoFactorCode,
		accountLink,
		stats,
		status
	}
});
```

## Performance Considerations

- Paginate results (50 per page default)
- Index on status, productId
- Debounce search input (300ms)
- Consider virtual scrolling for large datasets
- Cache platform/tier lists

## Validation Rules

- Username: Required, min 3 chars
- Email: Required, email format
- Password: Required, min 6 chars
- Platform/Tier: Must exist in database
- Status: Must be valid enum value

## Error Handling

- Duplicate username/email check
- Invalid productId
- Database errors
- Network errors
- Insufficient permissions

## Notes

- Reserved status clears after 15 minutes if checkout abandoned
- Sold accounts cannot be edited (read-only)
- Delete requires confirmation modal
- Bulk operations show progress indicator
- Export generates CSV file
- Consider adding import from CSV feature
