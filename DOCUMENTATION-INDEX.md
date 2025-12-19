# FastAccs Documentation Index

Complete documentation for all pages, components, API routes, and system architecture of the FastAccs platform.

---

## Quick Navigation

### User-Facing Pages

- [Homepage](#homepage)
- [Platforms Page](#platforms-page)
- [Platform Detail Page](#platform-detail-page)
- [Checkout](#checkout)
- [Checkout Verification](#checkout-verification)
- [User Dashboard](#user-dashboard)
- [Authentication Pages](#authentication-pages)
- [How It Works](#how-it-works)
- [Support](#support)

### Admin Pages

- [Admin Dashboard](#admin-dashboard)
- [Inventory Management](#inventory-management)
- [Orders Management](#orders-management)
- [User Management](#user-management)
- [Categories Management](#categories-management)
- [Batches Management](#batches-management)
- [Affiliate Management](#affiliate-management)

### API Documentation

- [API Routes](#api-routes)

---

## User-Facing Pages

### Homepage

**File:** [`src/routes/+page.md`](./+page.md)

- **Route:** `/`
- **Purpose:** Landing page showcasing platform value proposition
- **Key Components:** HeroBanner, FeaturedCategories, SocialProof
- **Data:** Static content, no API calls

### Platforms Page

**File:** [`src/routes/platforms/+page.md`](./platforms/+page.md)

- **Route:** `/platforms`
- **Purpose:** Browse all available social media platforms
- **API:** `GET /api/categories`
- **Features:** Platform grid, stock indicators, navigate to tiers

### Platform Detail Page

**File:** [`src/routes/platforms/[platform]/+page.md`](./platforms/[platform]/+page.md)

- **Route:** `/platforms/[platform]`
- **Purpose:** View tiers for specific platform
- **API:**
  - `GET /api/categories/slug/${platformSlug}`
  - `GET /api/categories/tiers/${platformId}`
- **Features:** Tier cards, pricing, add to cart, stock badges

### Checkout

**File:** [`src/routes/checkout/+page.md`](./checkout/+page.md)

- **Route:** `/checkout`
- **Purpose:** Complete purchase with wallet or Korapay
- **API:**
  - `POST /api/affiliate/validate`
  - `POST /api/checkout/wallet`
  - `POST /api/payments/initialize`
  - `GET /api/wallet/balance`
- **Features:** Cart review, affiliate codes, payment method selection

### Checkout Verification

**File:** [`src/routes/checkout/verify/+page.md`](./checkout/verify/+page.md)

- **Route:** `/checkout/verify`
- **Purpose:** Verify Korapay payment after redirect
- **API:** `POST /api/payments/verify`
- **Features:** Loading, success, failed, and pending states

### User Dashboard

**File:** [`src/routes/dashboard/+page.md`](./dashboard/+page.md)

- **Route:** `/dashboard`
- **Purpose:** User account hub with orders, purchases, wallet, affiliate
- **API:**
  - `GET /api/orders`
  - `GET /api/purchases`
  - `GET /api/affiliate/stats`
  - `GET /api/wallet/balance`
  - `GET /api/wallet/transactions`
  - `POST /api/affiliate/enable`
  - `POST /api/wallet/fund`
- **Features:** 6 tabs (Orders, Purchases, Messages, Affiliate, Wallet, Profile)

### Authentication Pages

**File:** [`src/routes/auth/+auth-pages.md`](./auth/+auth-pages.md)

- **Routes:** `/auth/login`, `/auth/signup`, `/auth/callback/google`
- **Purpose:** User authentication and registration
- **API:**
  - `POST /api/auth/login`
  - `POST /api/auth/signup`
  - `GET /api/auth/google`
  - `POST /api/auth/google/callback`
- **Features:** Email/password auth, Google OAuth, session management

### How It Works

**File:** [`src/routes/how-it-works/+page.md`](./how-it-works/+page.md)

- **Route:** `/how-it-works`
- **Purpose:** Educational page explaining platform process
- **Data:** Static content
- **Features:** 4-step process, features grid, FAQ

### Support

**File:** [`src/routes/support/+page.md`](./support/+page.md)

- **Route:** `/support`
- **Purpose:** Customer support and help
- **Data:** Static content (form not yet implemented)
- **Features:** Contact methods, FAQ, contact form

---

## Admin Pages

### Admin Dashboard

**File:** [`src/routes/admin/+page.md`](./admin/+page.md)

- **Route:** `/admin`
- **Purpose:** Admin control panel with overview statistics
- **Auth:** Admin role required
- **API:** `GET /api/admin/stats/overview`
- **Features:** Stats cards, recent orders, low stock alerts, quick actions

### Inventory Management

**File:** [`src/routes/admin/inventory/+page.md`](./admin/inventory/+page.md)

- **Route:** `/admin/inventory`
- **Purpose:** Manage account inventory across all platforms
- **Auth:** Admin role required
- **API:**
  - `GET /api/admin/inventory`
  - `POST /api/admin/inventory`
  - `PUT /api/admin/inventory/${id}`
  - `DELETE /api/admin/inventory/${id}`
  - `POST /api/admin/inventory/bulk`
- **Features:** Filters, search, CRUD operations, bulk actions, stock indicators

### Orders Management

**File:** [`src/routes/admin/orders/+page.md`](./admin/orders/+page.md)

- **Route:** `/admin/orders`
- **Purpose:** View and manage all customer orders
- **Auth:** Admin role required
- **API:**
  - `GET /api/admin/orders`
  - `GET /api/admin/orders/${id}`
  - `PUT /api/admin/orders/${id}/status`
  - `POST /api/admin/orders/${id}/refund`
  - `POST /api/admin/orders/${id}/fulfill`
- **Features:** Order filtering, status updates, refunds, manual fulfillment

### User Management

**File:** [`src/routes/admin/users/+page.md`](./admin/users/+page.md)

- **Route:** `/admin/users`
- **Purpose:** Manage registered users and permissions
- **Auth:** Admin role required
- **API:**
  - `GET /api/admin/users`
  - `GET /api/admin/users/${id}`
  - `PUT /api/admin/users/${id}`
  - `PUT /api/admin/users/${id}/role`
  - `PUT /api/admin/users/${id}/status`
  - `DELETE /api/admin/users/${id}`
  - `POST /api/admin/users/${id}/wallet/adjust`
- **Features:** User details, role management, suspend/ban, wallet adjustments

### Categories Management

**File:** [`src/routes/admin/categories/+page.md`](./admin/categories/+page.md)

- **Route:** `/admin/categories`
- **Purpose:** Manage platforms and tiers
- **Auth:** Admin role required
- **API:**
  - `GET /api/categories?includeInactive=true`
  - `POST /api/admin/categories`
  - `PUT /api/admin/categories/${id}`
  - `DELETE /api/admin/categories/${id}`
  - `PUT /api/admin/categories/${id}/reorder`
- **Features:** Hierarchical view, add/edit platforms and tiers, reordering

### Batches Management

**File:** [`src/routes/admin/batches/+page.md`](./admin/batches/+page.md)

- **Route:** `/admin/batches`
- **Purpose:** Bulk upload accounts via CSV
- **Auth:** Admin role required
- **API:**
  - `GET /api/admin/batches`
  - `POST /api/admin/batches/upload`
  - `POST /api/admin/batches/${id}/process`
  - `GET /api/admin/batches/${id}`
  - `DELETE /api/admin/batches/${id}`
  - `GET /api/admin/batches/template`
- **Features:** CSV upload, column mapping, validation, error reports

### Affiliate Management

**File:** [`src/routes/admin/affiliate/+page.md`](./admin/affiliate/+page.md)

- **Route:** `/admin/affiliate`
- **Purpose:** Manage affiliate program and payouts
- **Auth:** Admin role required
- **API:**
  - `GET /api/admin/affiliate`
  - `GET /api/admin/affiliate/${id}/details`
  - `PUT /api/admin/affiliate/${id}/rate`
  - `PUT /api/admin/affiliate/${id}/status`
  - `POST /api/admin/affiliate/${id}/payout`
  - `GET /api/admin/affiliate/payouts`
- **Features:** Affiliate stats, commission rates, payout processing

---

## API Documentation

### API Routes

**File:** [`src/routes/api/+api-routes.md`](./api/+api-routes.md)

Complete reference for all API endpoints:

**Public APIs:**

- Categories (platforms and tiers)
- Category details by slug

**Authentication APIs:**

- Login/signup
- OAuth (Google)
- Logout

**User APIs:**

- Orders
- Purchases
- Wallet
- Affiliate

**Checkout & Payment APIs:**

- Wallet checkout
- Korapay initialization
- Payment verification
- Webhooks

**Admin APIs:**

- Dashboard stats
- Inventory management
- Order management
- User management
- Categories management
- Batch uploads
- Affiliate management

---

## System Architecture

### Authentication System

- **Session-based:** Cookies with session ID
- **OAuth:** Google (Facebook/Twitter planned)
- **Middleware:** `hooks.server.ts` - Session validation
- **Services:**
  - `src/lib/auth/session.ts` - Session management
  - `src/lib/auth/user.ts` - Password hashing
  - `src/lib/auth/oauth.ts` - OAuth providers

### Database Schema

**ORM:** Prisma
**Database:** PostgreSQL (or compatible)

**Key Tables:**

- `User` - Users and admins
- `Session` - Active sessions
- `Category` - Platforms (parentId=NULL) and Tiers (has parentId)
- `Product` - Auto-created for each tier
- `Account` - Inventory accounts with credentials
- `Order` - Customer orders
- `OrderItem` - Order line items
- `WalletTransaction` - Wallet activity
- `AffiliateProgram` - Affiliate enrollment
- `Commission` - Affiliate earnings
- `CommissionPayout` - Payout history
- `Batch` - CSV upload tracking

### Payment Integration

**Provider:** Korapay
**Methods:** Cards, Bank Transfer, Mobile Money
**Flow:**

1. Create order (status: pending_payment)
2. Initialize Korapay payment
3. Redirect to Korapay
4. User completes payment
5. Korapay webhook confirms
6. Allocate accounts
7. Mark order completed

**Wallet:**

- Internal balance system
- Fund via Korapay
- Instant checkout
- Refunds credit wallet

### Fulfillment System

**Automatic:**

- Triggered on payment confirmation
- Query available accounts for tier
- Assign to order
- Update account status to 'sold'
- Set userId on account

**Manual:**

- Admin intervention for failed auto-fulfillment
- Select specific accounts
- Same assignment process

### Affiliate System

**Structure:**

- User enrolls → Gets unique code
- Code used at checkout → Discount applied
- Order completed → Commission recorded
- Admin processes payout

**Commission:**

- Percentage-based (default 10%)
- Individual rates possible
- Tracked per order
- Status: pending → paid

---

## File Structure

```
src/
├── routes/
│   ├── +page.svelte (Homepage)
│   ├── +page.md (This documentation)
│   ├── platforms/
│   │   ├── +page.svelte
│   │   ├── +page.md
│   │   └── [platform]/
│   │       ├── +page.svelte
│   │       └── +page.md
│   ├── checkout/
│   │   ├── +page.svelte
│   │   ├── +page.md
│   │   └── verify/
│   │       ├── +page.svelte
│   │       └── +page.md
│   ├── dashboard/
│   │   ├── +page.svelte
│   │   └── +page.md
│   ├── auth/
│   │   ├── +auth-pages.md
│   │   ├── login/
│   │   ├── signup/
│   │   └── callback/
│   ├── how-it-works/
│   │   ├── +page.svelte
│   │   └── +page.md
│   ├── support/
│   │   ├── +page.svelte
│   │   └── +page.md
│   ├── admin/
│   │   ├── +layout.server.ts (Auth guard)
│   │   ├── +page.svelte (Dashboard)
│   │   ├── +page.md
│   │   ├── inventory/
│   │   │   ├── +page.svelte
│   │   │   └── +page.md
│   │   ├── orders/
│   │   │   ├── +page.svelte
│   │   │   └── +page.md
│   │   ├── users/
│   │   │   ├── +page.svelte
│   │   │   └── +page.md
│   │   ├── categories/
│   │   │   ├── +page.svelte
│   │   │   └── +page.md
│   │   ├── batches/
│   │   │   ├── +page.svelte
│   │   │   └── +page.md
│   │   └── affiliate/
│   │       ├── +page.svelte
│   │       └── +page.md
│   └── api/
│       ├── +api-routes.md
│       ├── auth/
│       ├── categories/
│       ├── orders/
│       ├── purchases/
│       ├── checkout/
│       ├── payments/
│       ├── wallet/
│       ├── affiliate/
│       ├── webhooks/
│       └── admin/
├── lib/
│   ├── components/ (Reusable UI components)
│   ├── services/ (Business logic)
│   ├── auth/ (Authentication utilities)
│   ├── stores/ (Svelte stores)
│   ├── helpers/ (Utility functions)
│   └── types/ (TypeScript types)
└── hooks.server.ts (Session middleware)
```

---

## Component Documentation

### Main Components

**Navigation** (`src/lib/components/Navigation.svelte`)

- Global site navigation
- Cart mini-preview
- User menu
- Admin indicator

**Footer** (`src/lib/components/Footer.svelte`)

- Site footer with links
- Social media
- Copyright

**UserDashboard** (`src/lib/components/UserDashboard.svelte`)

- Multi-tab dashboard
- Orders, Purchases, Wallet, Affiliate, Profile
- Used in `/dashboard`

**Cart** (`src/lib/components/Cart.svelte`)

- Sidebar cart
- Item management
- Checkout CTA

**HeroBanner** (`src/lib/components/HeroBanner.svelte`)

- Homepage hero section
- CTA buttons

**FeaturedCategories** (`src/lib/components/FeaturedCategories.svelte`)

- Platform showcase
- Quick add-to-cart

**SocialProof** (`src/lib/components/SocialProof.svelte`)

- Testimonials
- Trust badges

**ToastContainer** (`src/lib/components/ToastContainer.svelte`)

- Notification system
- Success/error/info toasts

---

## Development Notes

### Environment Variables

```env
DATABASE_URL=postgresql://...
KORAPAY_SECRET_KEY=...
KORAPAY_PUBLIC_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=...
```

### Running Locally

```bash
npm install
npm run dev
```

### Database Migrations

```bash
npx prisma migrate dev
npx prisma generate
```

### Build for Production

```bash
npm run build
npm run preview
```

---

## Documentation Maintenance

This documentation is comprehensive and should be updated when:

- New pages are added
- API endpoints change
- Features are added/removed
- Database schema changes
- Authentication flow changes

Each `.md` file provides detailed information including:

- Purpose and route
- Components imported
- Icons used
- Data sources and APIs
- Page state
- Key features
- User actions
- Related pages
- Database operations
- Security considerations
- Error handling

---

## Last Updated

December 18, 2024

Generated with maximum detail for comprehensive understanding of the FastAccs platform.
