# Admin Dashboard

## Purpose

Central admin control panel for managing the FastAccs platform. Provides overview statistics, quick actions, and navigation to all admin functions.

## Route

`/admin`

## File Structure

- `+page.svelte` - Dashboard UI
- `+layout.server.ts` - Admin auth guard (parent layout)

## Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global navigation with admin indicator
- **Footer** (`$lib/components/Footer.svelte`) - Site footer

## Icons Used

- `Package`, `Users`, `ShoppingCart`, `TrendingUp`, `DollarSign`, `AlertCircle`, `CheckCircle`, `Clock` from `@lucide/svelte`

## Data Sources

### API Endpoints

**1. GET** `/api/admin/stats/overview`
**Returns:**

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
    recentOrders: Order[]; // Last 10
    lowStockCategories: Category[]; // < 10 available
  };
}
```

## Page State

```typescript
let stats = $state<any>(null);
let loading = $state(true);
let error = $state<string | null>(null);
```

## Key Features

### 1. Overview Stats Cards

#### Users Card

- **Icon:** Users (blue)
- **Metric:** Total registered users
- **Link:** `/admin/users`

#### Orders Card

- **Icon:** ShoppingCart (green)
- **Metric:** Total orders processed
- **Link:** `/admin/orders`

#### Revenue Card

- **Icon:** DollarSign (purple)
- **Metric:** Total revenue in Naira
- **Format:** Currency formatting

#### Pending Orders Card

- **Icon:** Clock (orange)
- **Metric:** Orders needing attention
- **Link:** `/admin/orders?status=pending`

#### Total Inventory Card

- **Icon:** Package (gray)
- **Metric:** All accounts in system

#### Available Accounts Card

- **Icon:** CheckCircle (green)
- **Metric:** Accounts ready to sell

#### Sold Accounts Card

- **Icon:** TrendingUp (blue)
- **Metric:** Accounts delivered

#### Reserved Accounts Card

- **Icon:** AlertCircle (yellow)
- **Metric:** Temporarily held accounts

### 2. Recent Orders Panel

- Table of last 10 orders
- Columns:
  - Order ID
  - Customer name
  - Total amount
  - Status badge
  - Date/time
  - Quick actions (view details)
- Click row → Navigate to order detail
- Status color coding:
  - Pending: Orange
  - Completed: Green
  - Failed: Red
  - Processing: Blue

### 3. Low Stock Alerts

- Categories with < 10 available accounts
- Shows:
  - Category name
  - Available count (red text)
  - "Restock" button → `/admin/inventory?category=${id}`
- Alert badge if any low stock

### 4. Quick Actions

- **Manage Inventory** → `/admin/inventory`
- **View All Orders** → `/admin/orders`
- **Manage Users** → `/admin/users`
- **Add Accounts** → `/admin/inventory/add`
- **View Categories** → `/admin/categories`

## Admin Navigation Menu

Located in sidebar or header:

- Dashboard (current)
- Inventory Management
- Orders
- Users
- Categories
- Batches
- Settings
- Affiliate Management
- Reports (if exists)

## User Actions

- View dashboard stats
- Click stats cards → Navigate to detailed pages
- Review recent orders
- Check low stock alerts
- Use quick actions for common tasks

## SEO Metadata

- **Title**: "Admin Dashboard - FastAccs"
- **Description**: "FastAccs administration panel"
- **Robots**: "noindex, nofollow"

## Authentication & Authorization

- Requires admin role
- Checked in `+layout.server.ts`:

```typescript
if (!locals.user || locals.user.role !== 'admin') {
	throw redirect(302, '/auth/login?returnUrl=/admin');
}
```

## Real-Time Updates

Could implement:

- Auto-refresh stats every 30s
- WebSocket for live order notifications
- Real-time stock alerts

## Related Pages

- `/admin/inventory` - Manage accounts
- `/admin/orders` - Order management
- `/admin/users` - User management
- `/admin/categories` - Platform/tier setup
- `/admin/batches` - Bulk account uploads

## Component Dependencies

```
+page.svelte
├── Navigation (admin mode)
├── Footer
└── Stats API data
```

## Backend Services Used

- `src/routes/api/admin/stats/overview/+server.ts` - Aggregated stats

## Database Queries

```sql
-- Total users
SELECT COUNT(*) FROM User

-- Total orders
SELECT COUNT(*) FROM Order

-- Total revenue
SELECT SUM(totalAmount) FROM Order WHERE status = 'completed'

-- Pending orders
SELECT COUNT(*) FROM Order WHERE status = 'pending_payment'

-- Account stats
SELECT
  status,
  COUNT(*)
FROM Account
GROUP BY status

-- Low stock categories
SELECT
  c.id,
  c.name,
  COUNT(a.id) as available
FROM Category c
LEFT JOIN Product p ON p.categoryId = c.id
LEFT JOIN Account a ON a.productId = p.id AND a.status = 'available'
WHERE c.parentId IS NOT NULL
GROUP BY c.id
HAVING COUNT(a.id) < 10

-- Recent orders
SELECT * FROM Order
ORDER BY createdAt DESC
LIMIT 10
```

## Performance Considerations

- Stats computed via aggregation queries
- Consider caching for 1-5 minutes
- Pagination for recent orders if needed
- Index on Order.status, Account.status

## Notes

- Dashboard should load quickly (< 2s)
- Stats should be accurate but don't need real-time precision
- Low stock threshold configurable (currently 10)
- Revenue includes only completed orders
- Recent orders limited to last 10 for performance
