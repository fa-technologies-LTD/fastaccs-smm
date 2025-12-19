# Platforms Page

## Purpose

Displays all available social media platforms (Instagram, TikTok, Facebook, Twitter, etc.) as browsable cards. Users can click on a platform to view its available account categories/tiers.

## Route

`/platforms`

## File Structure

- `+page.svelte` - Main UI component
- `+page.ts` - Client-side data loading

## Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global navigation
- **Footer** (`$lib/components/Footer.svelte`) - Site footer
- **getPlatformIcon** (`$lib/helpers/platformColors.ts`) - Platform-specific icons
- **getPlatformColor** (`$lib/helpers/platformColors.ts`) - Platform gradient colors

## Icons Used

- `ShoppingBag`, `TrendingUp`, `Users`, `Eye` from `@lucide/svelte`
- Platform-specific icons via `getPlatformIcon()`

## Data Sources

### API Endpoint

**GET** `/api/categories`

**Returns:**

```typescript
{
  success: boolean;
  data: Platform[];
}
```

**Platform Interface:**

```typescript
interface Platform {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	metadata: {
		icon?: string;
		color?: string;
	};
	categoryCount?: number;
	totalAvailable?: number;
}
```

### Data Flow

1. `+page.ts` loads on navigation
2. Calls `fetch('/api/categories')` server-side and client-side
3. Returns platforms array to component
4. Component renders grid of platform cards

## Page State

```typescript
let { data } = $props(); // From +page.ts loader
// data.platforms - Array of platform objects
```

## Key Features

1. **Platform Grid Display**
   - Responsive grid (1 column mobile, 2 tablet, 3 desktop)
   - Each card shows:
     - Platform icon with branded gradient background
     - Platform name
     - Number of categories available
     - Total accounts available
     - Hover effect with scale transform

2. **Platform Card Information**
   - Icon: Dynamic based on platform
   - Background: Platform-specific gradient
   - Stats: Category count and total inventory
   - Click action: Navigate to `/platforms/[slug]`

3. **Empty State**
   - Shows when no platforms available
   - Message: "No platforms available at the moment"
   - Icon: ShoppingBag

## User Actions

- Click platform card → Navigate to `/platforms/[platform-slug]`
- View platform stats (categories, available accounts)
- Use navigation/footer links

## Platform Color Mapping

```typescript
instagram: 'from-pink-500 to-purple-600'
tiktok: 'from-black to-gray-800'
facebook: 'from-blue-600 to-blue-700'
twitter: 'from-blue-400 to-blue-500'
default: 'from-gray-500 to-gray-600'
```

## SEO Metadata

- **Title**: "Browse Platforms - FastAccs"
- **Description**: "Browse premium social media accounts across multiple platforms. Instagram, TikTok, Facebook, Twitter and more."

## Performance Considerations

- Uses SvelteKit's `fetch()` for automatic SSR/CSR hydration
- Platform cards have hover animations (transform, shadow)
- Images/icons are SVG (lucide icons) - lightweight

## Related Pages

- `/` - Homepage
- `/platforms/[platform]` - Individual platform page with tiers
- `/how-it-works` - Platform explanation

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
└── platformColors helper
    ├── getPlatformIcon()
    └── getPlatformColor()
```

## Error Handling

- If API fails: Returns empty array, shows empty state
- No explicit error UI, gracefully degrades

## Database Schema Reference

**Table**: `Category` (used as platforms)

- `id` - UUID
- `name` - Platform name
- `slug` - URL-safe identifier
- `description` - Optional description
- `metadata` - JSON field for icon/color
- `parentId` - NULL (top-level categories are platforms)

## Notes

- "Platform" is actually a top-level Category in the database (where `parentId` is NULL)
- Child categories represent follower ranges/tiers for each platform
- Category count and inventory are aggregated from child categories
