# Admin Categories Management

## Purpose

Manage platform categories (Instagram, TikTok, etc.) and their tiers/subcategories (10K, 50K, 100K, etc.). Define pricing, availability, and category metadata.

## Route

`/admin/categories`

## File Structure

- `+page.svelte` - Categories management UI
- `+page.ts` - Client-side data loading

## Components Imported

- **Navigation** - Admin navigation
- **Footer** - Site footer

## Icons Used

- `Layers`, `Plus`, `Edit`, `Trash2`, `Move`, `Eye`, `EyeOff`, `Package`, `ChevronDown`, `ChevronRight` from `@lucide/svelte`

## Data Sources

### API Endpoints

**1. GET** `/api/categories?includeInactive=true`
**Returns:**

```typescript
{
  success: boolean;
  data: Category[];
}
```

**Category Interface:**

```typescript
interface Category {
	id: string;
	name: string;
	slug: string;
	description?: string;
	parentId?: string; // NULL for platforms, set for tiers
	metadata: {
		icon?: string;
		color?: string;
		displayOrder?: number;
	};
	active: boolean;
	createdAt: DateTime;
	updatedAt: DateTime;
	parent?: Category; // Platform (if tier)
	children?: Category[]; // Tiers (if platform)
	_count?: {
		children: number; // Tier count
		products: number; // Product count
	};
	products?: Product[]; // Associated products
}
```

**2. POST** `/api/admin/categories` - Create category

**3. PUT** `/api/admin/categories/${id}` - Update category

**4. DELETE** `/api/admin/categories/${id}` - Delete category

**5. PUT** `/api/admin/categories/${id}/reorder` - Update display order

## Page State

```typescript
let categories = $state<Category[]>([]);
let platforms = $derived(categories.filter((c) => !c.parentId));
let loading = $state(true);
let showAddModal = $state(false);
let editingCategory = $state<Category | null>(null);
let expandedPlatforms = $state<Set<string>>(new Set());
let selectedParent = $state<string | null>(null);
```

## Key Features

### 1. Hierarchical View

**Platform Level (Parent Categories):**

- Platform name with icon
- Tier count badge
- Total products count
- Expand/collapse arrow
- Active/inactive toggle
- Edit and Delete buttons

**Tier Level (Child Categories):**

- Indented under platform
- Tier name (e.g., "10K Followers")
- Price range (if set)
- Stock count
- Active/inactive toggle
- Edit and Delete buttons

### 2. Add Category Modal

**Mode: Add Platform**

- Category Type: Platform (parentId = null)
- Name (required)
- Slug (auto-generated, editable)
- Description
- Icon (dropdown of lucide icons)
- Color (gradient selection)
- Active checkbox
- Display order

**Mode: Add Tier**

- Category Type: Tier
- Parent Platform (dropdown)
- Name (required, e.g., "10K Followers")
- Slug (auto-generated)
- Description
- Metadata (JSON):
  - Follower range
  - Features
- Active checkbox
- Display order

**Actions:**

- Save
- Save & Add Another
- Cancel

### 3. Edit Category Modal

Same fields as Add, pre-populated with category data.

### 4. Category Actions

**Per Category:**

- **Edit** - Open edit modal
- **Delete** - Confirm and delete (if no products)
- **Toggle Active** - Enable/disable category
- **Reorder** - Drag-and-drop or input order number
- **View Products** - Navigate to inventory filtered by category

**Bulk Actions:**

- Select multiple categories
- Bulk activate/deactivate
- Bulk delete (if no products)

### 5. Platform Color Picker

Visual color gradient selector:

- Instagram: Pink to Purple
- TikTok: Black to Gray
- Facebook: Blue to Dark Blue
- Twitter: Light Blue to Blue
- Custom: Color picker

### 6. Icon Selector

Searchable dropdown of lucide-svelte icons:

- Preview icon in selector
- Common social icons shown first
- Search by name

### 7. Reordering

**Display Order:**

- Drag-and-drop rows
- Or input order number
- Updates `metadata.displayOrder`
- Affects front-end display sequence

## User Actions

### Viewing

- Expand/collapse platforms
- View platform tiers
- Filter by active/inactive
- Search categories

### Management

- Add new platform
- Add tier to platform
- Edit category details
- Delete category
- Reorder categories
- Toggle active status

## API Request Examples

### Get All Categories

```typescript
GET /api/categories?includeInactive=true
```

### Create Platform

```typescript
POST /api/admin/categories
{
  name: "Instagram",
  slug: "instagram",
  description: "Instagram accounts with verified followers",
  parentId: null,
  metadata: {
    icon: "instagram",
    color: "from-pink-500 to-purple-600",
    displayOrder: 1
  },
  active: true
}
```

### Create Tier

```typescript
POST /api/admin/categories
{
  name: "10K Followers",
  slug: "instagram-10k",
  description: "Instagram account with 10,000+ followers",
  parentId: "platform-uuid",
  metadata: {
    followerRange: "10000-15000",
    displayOrder: 1
  },
  active: true
}
```

### Update Category

```typescript
PUT /api/admin/categories/${categoryId}
{
  name: "Instagram Updated",
  description: "New description",
  active: true
}
```

### Delete Category

```typescript
DELETE /api/admin/categories/${categoryId}
```

### Reorder

```typescript
PUT /api/admin/categories/${categoryId}/reorder
{
  displayOrder: 3
}
```

## Category Hierarchy Structure

```
Platform (parentId = NULL)
├── Tier 1 (parentId = platform.id)
├── Tier 2 (parentId = platform.id)
└── Tier 3 (parentId = platform.id)
    └── Product (auto-created, categoryId = tier.id)
        └── Accounts (inventory)
```

## SEO Metadata

- **Title**: "Categories Management - Admin - FastAccs"
- **Robots**: "noindex, nofollow"

## Security

- Admin role required
- Cannot delete category with products
- Slug must be unique
- Parent category must exist

## Related Pages

- `/admin/inventory` - View/add products for categories
- `/admin/inventory?category=${id}` - Filtered by category

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
├── Modal components
├── IconPicker component
├── ColorPicker component
└── Categories API
```

## Backend Services Used

- `src/lib/services/categories.ts` - CRUD operations
- `src/routes/api/admin/categories/+server.ts` - Main endpoint

## Database Operations

### Get Categories (with hierarchy)

```typescript
const categories = await prisma.category.findMany({
	where: includeInactive ? {} : { active: true },
	include: {
		parent: true,
		children: {
			where: includeInactive ? {} : { active: true },
			include: {
				_count: {
					select: { products: true }
				}
			}
		},
		_count: {
			select: {
				children: true,
				products: true
			}
		}
	},
	orderBy: [{ metadata: { path: ['displayOrder'], order: 'asc' } }, { name: 'asc' }]
});
```

### Create Category

```typescript
await prisma.category.create({
	data: {
		name,
		slug,
		description,
		parentId,
		metadata,
		active
	}
});

// Auto-create Product if it's a tier
if (parentId) {
	await prisma.product.create({
		data: {
			categoryId: newCategory.id,
			price: 0, // Set manually later
			status: 'active'
		}
	});
}
```

### Update Category

```typescript
await prisma.category.update({
	where: { id: categoryId },
	data: {
		name,
		slug,
		description,
		metadata,
		active
	}
});
```

### Delete Category

```typescript
// Check for products
const productCount = await prisma.product.count({
	where: { categoryId }
});

if (productCount > 0) {
	throw new Error('Cannot delete category with products');
}

// Check for child categories
const childCount = await prisma.category.count({
	where: { parentId: categoryId }
});

if (childCount > 0) {
	throw new Error('Cannot delete platform with tiers');
}

await prisma.category.delete({
	where: { id: categoryId }
});
```

## Validation Rules

- Name: Required, min 2 chars, max 100 chars
- Slug: Required, lowercase, alphanumeric + hyphens, unique
- ParentId: Must exist if provided
- Metadata: Valid JSON
- Active: Boolean

## Slug Generation

```typescript
function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}
```

## Display Order Logic

- Default: Append to end (max order + 1)
- Custom: Admin sets explicit order
- Same order: Sort alphabetically by name
- Front-end uses order for display

## Inactive Categories

- Hidden from customer-facing pages
- Still visible in admin panel
- Products under inactive categories not sellable
- Can be reactivated anytime

## Category Deletion Rules

1. Cannot delete if has products
2. Cannot delete if has child categories (platform with tiers)
3. Must remove/reassign products first
4. Or soft delete (set active = false)

## Error Handling

- Duplicate slug
- Parent category not found
- Category has products
- Category has children
- Invalid metadata JSON

## Notes

- Platforms are top-level categories (parentId = NULL)
- Tiers are child categories
- Product is auto-created when tier is created
- Slug is used in URLs: `/platforms/${platform-slug}`
- Color and icon stored in metadata JSON
- Display order allows custom sorting
- Consider adding category images for better UI
