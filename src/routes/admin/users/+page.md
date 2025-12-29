# Admin User Management

## Purpose

Manage all users, view user details, track orders and purchases, monitor wallet balances, and export user data for analysis.

## Route

`/admin/users`

## File Structure

- `+page.server.ts` - Server-side data loading using Prisma
- `+page.svelte` - Users list UI with search, filtering, and pagination

## Data Loading

### Server-Side Loading (`+page.server.ts`)

Data is loaded server-side using Prisma ORM with the `PageServerLoad` function.

**Prisma Query:**

```typescript
const usersRaw = await prisma.user.findMany({
  include: {
    orders: true,
    wallet: true
  },
  orderBy: {
    createdAt: 'desc'
  }
});
```

**Data Transformation:**

Each user is mapped to a `UserData` object with aggregated information:

```typescript
interface UserData {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  userType: 'REGISTERED' | 'GUEST' | 'CONVERTED' | 'AFFILIATE' | 'ADMIN';
  isActive: boolean;
  isAffiliateEnabled: boolean;
  emailVerified: boolean;
  registeredAt: Date | null;
  lastLogin: Date | null;
  createdAt: Date;
  orderCount: number; // Calculated from orders.length
  totalSpent: number; // Sum of all order.totalAmount values
  walletBalance: number; // From wallet.balance, or 0 if no wallet
}
```

**Stats Calculation:**

The server calculates aggregate statistics from the user data:

```typescript
interface UserStats {
  totalUsers: number; // Total count of all users
  registeredUsers: number; // Users with userType === 'REGISTERED'
  guestUsers: number; // Users with userType === 'GUEST'
  affiliates: number; // Users with isAffiliateEnabled === true
  activeUsers: number; // Users with isActive === true
  totalRevenue: number; // Sum of all users' totalSpent
}
```

**Return Value:**

```typescript
{
  users: UserData[];
  stats: UserStats;
}
```

## Icons Used

- `Users`, `UserCheck`, `Mail`, `Phone`, `Wallet`, `ShoppingBag`, `Calendar`, `Search`, `Download` from `lucide-svelte`

## Page State

### Props

```typescript
let { data }: { data: PageData } = $props();
```

### Reactive State ($state)

```typescript
let searchQuery = $state(''); // Search input value
let filterType = $state('all'); // Filter selection
let currentPage = $state(1); // Current pagination page
let itemsPerPage = 20; // Items per page (constant)
```

### Derived State ($derived, $derived.by)

```typescript
let stats = $derived({
  totalUsers: data.stats?.totalUsers || 0,
  registeredUsers: data.stats?.registeredUsers || 0,
  guestUsers: data.stats?.guestUsers || 0,
  affiliates: data.stats?.affiliates || 0,
  activeUsers: data.stats?.activeUsers || 0,
  totalRevenue: data.stats?.totalRevenue || 0
});

let allUsers = $derived(data.users || []);

let filteredUsers = $derived.by(() => {
  // Applies filterType and searchQuery to allUsers
});

let paginatedUsers = $derived.by(() => {
  // Returns the current page slice of filteredUsers
});

let totalPages = $derived(Math.ceil(filteredUsers.length / itemsPerPage));
```

## Helper Functions

- `formatPrice()` - Formats numbers as currency
- `formatDate()` - Formats dates
- `exportToCSV()` - Exports data to CSV file

## Key Features

### 1. Statistics Cards

Six stat cards displayed at the top of the page:

#### Total Users
- Shows total count of all users
- Icon: Users (blue)

#### Registered
- Shows count of registered users (userType === 'REGISTERED')
- Icon: UserCheck (green)

#### Active
- Shows count of active users (isActive === true)
- Icon: UserCheck (green)

#### Guests
- Shows count of guest users (userType === 'GUEST')
- Icon: Users (gray)

#### Affiliates
- Shows count of affiliate-enabled users (isAffiliateEnabled === true)
- Icon: Users (purple)

#### Total Revenue
- Shows sum of all user spending
- Icon: Wallet (green)
- Formatted as currency

### 2. Search Functionality

**Input:** Text input with search icon  
**Searches:** email, fullName, phone, id  
**Method:** Case-insensitive substring match using `.toLowerCase().includes(query)`

### 3. Filter Functionality

**Filter Types:**
- `all` - Shows all users (no filter)
- `registered` - userType === 'REGISTERED'
- `guest` - userType === 'GUEST'
- `affiliate` - isAffiliateEnabled === true
- `active` - isActive === true
- `inactive` - isActive === false

**Implementation:** Dropdown select with options, filters applied in `filteredUsers` derived state using `$derived.by()`

### 4. Users Table

**Columns:**
1. **User** - Full name + truncated ID
2. **Contact** - Email and phone with icons
3. **Type** - User type badge (REGISTERED/GUEST) + affiliate badge if applicable
4. **Status** - Active/Inactive badge
5. **Orders** - Order count with shopping bag icon
6. **Total Spent** - Formatted currency
7. **Wallet** - Wallet balance with wallet icon
8. **Registered** - Registration date with calendar icon

**Empty State:** "No users found" message when filteredUsers is empty

### 5. Pagination

**Configuration:**
- Items per page: 20
- Shows page numbers (up to 5 visible)
- Previous/Next buttons
- Disabled state on first/last page
- Shows current range (e.g., "Showing 1 to 20 of 156 users")

**Implementation:** Uses `$derived.by()` to slice filteredUsers based on currentPage and itemsPerPage

### 6. CSV Export

**Button:** "Export Data" button in header with download icon

**Export Data:**

Exports all filtered users (not just current page) with the following columns:
- ID
- Name
- Email
- Phone
- Type
- Is Active
- Is Affiliate
- Email Verified
- Total Orders
- Total Spent
- Wallet Balance
- Registered At
- Last Login

**Filename:** `users-{YYYY-MM-DD}.csv`

**Feedback:** Shows success toast notification after export

## Badge Styling

### User Type Badges
- `REGISTERED`: Green background (`bg-green-100 text-green-800`)
- `GUEST`: Gray background (`bg-gray-100 text-gray-800`)
- `AFFILIATE`: Purple badge shown separately if `isAffiliateEnabled === true` (`bg-purple-100 text-purple-800`)

### Status Badges
- `Active` (isActive === true): Green (`bg-green-100 text-green-800`)
- `Inactive` (isActive === false): Red (`bg-red-100 text-red-800`)

## Schema Fields Used

From Prisma `User` model:
- `id` - Unique identifier
- `email` - User email (nullable)
- `fullName` - User full name (nullable)
- `phone` - Phone number (nullable)
- `userType` - Enum: REGISTERED, GUEST, CONVERTED, AFFILIATE, ADMIN
- `isActive` - Boolean for account status
- `isAffiliateEnabled` - Boolean for affiliate program participation
- `emailVerified` - Boolean for email verification status
- `registeredAt` - Timestamp of registration (nullable)
- `lastLogin` - Timestamp of last login (nullable)
- `createdAt` - Timestamp of account creation

From Prisma `Order` model (via relation):
- `totalAmount` - Decimal field (converted to Number for calculation)

From Prisma `Wallet` model (via relation):
- `balance` - Decimal field (converted to Number, nullable relation)

## Technical Notes

### Svelte 5 Runes
- **$state** - Used for reactive UI state (search, filter, page)
- **$derived** - Used for simple computed values (stats, allUsers, totalPages)
- **$derived.by()** - Used for complex computed values with filtering/transformation logic (filteredUsers, paginatedUsers)

### Type Conversions
- Prisma `Decimal` types are converted to `Number` for calculations and display
- Nullable fields are handled with optional chaining and default values

### Performance Considerations
- All users loaded once server-side
- Filtering and pagination happen client-side for instant responsiveness
- CSV export includes all filtered results (not limited by pagination)

## Error Handling

If the Prisma query fails, the server returns empty defaults:

```typescript
{
  users: [],
  stats: {
    totalUsers: 0,
    registeredUsers: 0,
    guestUsers: 0,
    affiliates: 0,
    activeUsers: 0,
    totalRevenue: 0
  }
}
```

Error is logged to console: `console.error('Error loading users:', error)`
