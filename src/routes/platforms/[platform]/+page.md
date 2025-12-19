# Platform Detail Page

## Purpose

Displays all available tiers/categories for a specific platform (e.g., Instagram 10K, Instagram 50K, etc.). Users can view pricing, availability, and add tiers to cart.

## Route

`/platforms/[platform]`

## Dynamic Route Parameter

- `[platform]` - Platform slug (e.g., `instagram`, `tiktok`, `facebook`)

## File Structure

- `+page.svelte` - Main UI component
- `+page.ts` - Client-side data loading with dynamic params

## Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global navigation
- **Footer** (`$lib/components/Footer.svelte`) - Site footer
- **getPlatformIcon** (`$lib/helpers/platformColors.ts`) - Platform icon
- **getPlatformColor** (`$lib/helpers/platformColors.ts`) - Platform gradient

## Icons Used

- `ShoppingBag`, `TrendingUp`, `Users`, `Package`, `Plus`, `Check` from `@lucide/svelte`
- Platform-specific icon via helper

## Data Sources

### API Endpoints

**1. GET** `/api/categories/slug/${platformSlug}`
**Returns:**

```typescript
{
  success: boolean;
  data: Platform {
    id: string;
    name: string;
    slug: string;
    description: string;
    metadata: Record<string, unknown>;
  };
}
```

**2. GET** `/api/categories/tiers/${platformId}`
**Returns:**

```typescript
{
  success: boolean;
  data: TierInventory[] {
    product_id: string;
    tier_name: string;
    tier_slug: string;
    category_id: string;
    category_name: string;
    description: string | null;
    metadata: Record<string, unknown>;
    accounts_available: number;
    reservations_active: number;
    visible_available: number;
    price: number;
    product_status: string;
    tier_active: boolean;
    platform_name: string;
    platform_slug: string;
  }[];
}
```

### Data Flow

1. `+page.ts` extracts `params.platform`
2. Fetches platform details by slug
3. Uses platform ID to fetch tiers
4. Filters active tiers with available inventory
5. Returns structured data to component

## Page State

```typescript
let { data } = $props(); // { platform, tiers }

// Computed
let sortedTiers = $derived(
	data.tiers
		.filter((t) => t.visible_available > 0 && t.tier_active)
		.sort((a, b) => a.price - b.price)
);
```

## Key Features

### 1. Platform Header

- Platform icon with branded background gradient
- Platform name and description
- Breadcrumb navigation

### 2. Tier Grid Display

- Responsive grid layout
- Each tier card shows:
  - Tier name (e.g., "10K Followers")
  - Price in Naira
  - Stock availability indicator
  - "Add to Cart" button
  - Stock badge (In Stock / Low Stock / Out of Stock)

### 3. Stock Indicators

- **In Stock**: Green badge, `visible_available > 10`
- **Low Stock**: Yellow badge, `visible_available 1-10`
- **Out of Stock**: Red badge, disabled, `visible_available = 0`

### 4. Add to Cart

- Clicking "Add to Cart" opens cart sidebar
- Adds tier with quantity 1
- Shows success toast notification

### 5. Empty States

- **No tiers available**: Shows when all tiers out of stock
- **Platform not found**: 404 error from loader

## User Actions

- Click tier card → Add to cart and open cart sidebar
- View tier details (name, price, stock)
- Navigate via breadcrumb to `/platforms`

## Tier Display Logic

```typescript
// Only show:
- tier_active = true
- visible_available > 0
- Sort by price (ascending)
```

## Stock Badge Logic

```typescript
function getStockBadge(available: number) {
	if (available === 0) return { text: 'Out of Stock', color: 'red' };
	if (available <= 10) return { text: 'Low Stock', color: 'yellow' };
	return { text: 'In Stock', color: 'green' };
}
```

## Price Formatting

```typescript
// Nigerian Naira formatting
const formatter = new Intl.NumberFormat('en-NG', {
	style: 'currency',
	currency: 'NGN',
	minimumFractionDigits: 0
});
```

## SEO Metadata

- **Title**: `${platform.name} Accounts - FastAccs`
- **Description**: `Browse premium ${platform.name} accounts. Multiple tiers available with instant delivery.`

## Error Handling

- **Platform not found**: Throws 404 error in loader
- **No tiers**: Shows empty state UI
- **API failure**: Logs error, shows empty state

## Related Pages

- `/platforms` - All platforms list
- `/checkout` - After adding to cart
- `/platforms/[platform]/tiers/[tier]` - Individual tier detail (if implemented)

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
├── platformColors helper
│   ├── getPlatformIcon()
│   └── getPlatformColor()
└── cart store
    └── cart.addTier()
```

## Database Relationships

```
Platform (Category with parentId=NULL)
  └── Tiers (Category with parentId=platform.id)
      └── Product (auto-created, linked to tier)
          └── Accounts (inventory units)
```

## API Backend Files

- `/api/categories/slug/[slug]/+server.ts` - Get platform by slug
- `/api/categories/tiers/[platformId]/+server.ts` - Get tiers for platform

## Notes

- Tiers are actually child categories of the platform category
- `visible_available` accounts for reservations (available - reserved)
- Platform colors applied to header gradient background
- Out of stock tiers are filtered out from display
- Price is stored in database as integer (kobo/cents)
