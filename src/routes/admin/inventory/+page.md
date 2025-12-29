# Admin Inventory Management

## Purpose

View and monitor account inventory across all platforms and tiers. Track stock levels, manage account status distribution (available/assigned/delivered), and fix orphaned allocated accounts.

## Route

`/admin/inventory`

## File Structure

- `+page.svelte` - Inventory UI with search and stats
- `+page.ts` - Client-side data loading from `/api/inventory`

## Data Loading

### Client-Side Loading (`+page.ts`)

Data is fetched from the `/api/inventory` endpoint:

```typescript
const response = await fetch('/api/inventory');
const result = await response.json();

return {
  stats: result.data.stats,
  inventory: result.data.batches // Platform/tier account data
};
```

### Data Structure

**Stats Interface:**

```typescript
interface InventoryStats {
  total_accounts: number;
  available_accounts: number;
  reserved_accounts: number;
  platforms: number;
}
```

**Batch/Tier Inventory Interface:**

```typescript
interface InventoryBatch {
  platform_name: string;
  tier_name: string;
  total_accounts: number;
  available_accounts: number;
  assigned_accounts: number;
  delivered_accounts: number;
  created_at: string | Date;
}
```

## Icons Used

None explicitly imported (minimal UI)

## Page State

### Props

```typescript
let { data } = $props();
```

### Reactive State ($state)

```typescript
let searchTerm = $state('');
let showConfirmModal = $state(false);
let cleanupLoading = $state(false);
let cleanupMessage = $state<string | null>(null);
```

### Derived State ($derived.by)

```typescript
const filteredInventory = $derived.by(() => {
  if (!searchTerm) return data.inventory || [];
  return (data.inventory || []).filter(
    (item: any) =>
      item.platform_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.tier_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );
});

const summaryStats = $derived.by(() => {
  return {
    total_accounts: /* sum of all total_accounts */,
    available_accounts: /* sum of all available_accounts */,
    assigned_accounts: /* sum of all assigned_accounts */,
    delivered_accounts: /* sum of all delivered_accounts */,
    platforms: /* unique count of platform names */
  };
});
```

## Helper Functions

- `formatDate()` - Formats dates for display
- `getStatusColor()` - Returns Tailwind classes for stock level badge
- `getStatusText()` - Returns human-readable status text

### Status Logic

```typescript
function getStatusColor(available: number): string {
  if (available === 0) return 'text-red-600 bg-red-100'; // Out of stock
  if (available < 10) return 'text-yellow-600 bg-yellow-100'; // Low stock
  return 'text-green-600 bg-green-100'; // In stock
}

function getStatusText(available: number): string {
  if (available === 0) return 'out of stock';
  if (available < 10) return 'low stock';
  return 'in stock';
}
```

## Key Features

### 1. Statistics Cards

Five stat cards displayed at the top:

#### Total Accounts
- Sum of all accounts across all batches
- Color: Gray

#### Available
- Accounts ready for assignment
- Color: Green

#### Assigned
- Accounts allocated to orders (in progress)
- Color: Yellow

#### Delivered
- Accounts successfully delivered to customers
- Color: Blue

#### Platforms
- Unique count of platforms with inventory
- Color: Purple

### 2. Search Functionality

**Input:** Text input for filtering  
**Searches:** platform_name, tier_name  
**Method:** Case-insensitive substring match

### 3. Inventory Table

**View:** Platform/tier-level aggregation (not individual accounts)

**Columns:**
1. **Platform & Tier** - Platform name + tier name
2. **Total Stock** - Total accounts in this batch
3. **Available** - Ready for assignment (green)
4. **Assigned** - Allocated to orders (yellow)
5. **Delivered** - Delivered to customers (blue)
6. **Price** - Currently displays "-" (not implemented)
7. **Status** - Badge showing stock level (out of stock / low stock / in stock)
8. **Last Restocked** - Created date of batch

**Empty State:** "No inventory found" when no results

### 4. Fix Stuck Accounts

**Feature:** Cleanup orphaned allocated accounts

**Trigger:** "Fix Stuck Accounts" button in header

**Confirmation:** ConfirmModal with warning message:
- Title: "Fix Stuck Accounts"
- Message: "This will reset orphaned allocated accounts back to available status. This action cannot be undone."
- Destructive action (orange button)

**API Call:**
```typescript
POST /api/admin/cleanup/allocated-accounts
```

**Behavior:**
- Shows loading state during cleanup
- Displays success/error message
- Reloads page on success
- Message auto-dismisses after 5 seconds

### 5. Error Handling

Displays error banner if inventory loading fails:
- Red background
- Shows error message from API

## Components Used

- `ConfirmModal` - For confirming destructive actions

## API Endpoints

### GET `/api/inventory`

Returns inventory stats and batch/tier-level data.

**Response:**
```typescript
{
  data: {
    stats: {
      total_accounts: number;
      available_accounts: number;
      reserved_accounts: number;
      platforms: number;
    },
    batches: InventoryBatch[]
  }
}
```

### POST `/api/admin/cleanup/allocated-accounts`

Fixes orphaned allocated accounts (resets to available).

**Response:**
```typescript
{
  message: string; // Success message
}
```

## Account Status Flow

Accounts progress through these states:

1. **Available** - Ready to be assigned to orders
2. **Assigned** - Allocated to an order (reserved)
3. **Delivered** - Successfully delivered to customer

**Orphaned Accounts:** Accounts stuck in "assigned" state without valid orders can be fixed with the cleanup tool.

## Performance Considerations

- All inventory loaded at once (no pagination)
- Client-side filtering for instant search
- Stats calculated from filtered data in real-time

## Stock Level Thresholds

- **In Stock:** Available count >= 10
- **Low Stock:** Available count 1-9 (yellow warning)
- **Out of Stock:** Available count = 0 (red alert)

## Technical Notes

### Svelte 5 Runes

- **$state** - Used for search input and modal state
- **$derived.by()** - Used for filtered inventory and aggregated stats

### Data Aggregation

Stats are calculated client-side by reducing over the filtered inventory array to sum counts and extract unique platforms.

## Error Handling

- Displays error banner if inventory fails to load
- Shows error message from API response
- Cleanup errors shown in temporary message banner

## Security

- Admin role required
- Cleanup action requires confirmation
- Destructive operations clearly marked

## Related Pages

- `/admin/batches` - Add/manage account batches
- `/admin/categories` - Manage platforms and tiers
- `/admin` - Dashboard with inventory overview

## Future Enhancements (Not Implemented)

- Individual account view/edit
- Bulk account import
- Price management per tier
- Detailed restock history
- Account deletion/archival
- Status filtering (available/assigned/delivered)
- Pagination for large inventories

## Notes

- This is a read-only view of inventory at batch/tier level
- Individual account management done elsewhere
- No add/edit/delete individual account functionality on this page
- Price column exists but shows "-" (not implemented)
- Search is instant with no debouncing
