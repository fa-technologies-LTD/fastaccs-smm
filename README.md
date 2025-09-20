# FastAccs - Premium Social Media Accounts Marketplace

## 🚀 Project Overview

FastAccs is Nigeria's most trusted marketplace for verified social media accounts and boosting services. Built with SvelteKit 5, it provides a modern, secure platform for buying and selling premium social media accounts across Instagram, TikTok, Facebook, Twitter, and more.

## 🎨 Brand Guidelines

### Brand Identity

- **Brand Name**: Fast Accounts
- **Tagline**: "Premium Social Media Accounts & Boosting Services"
- **Mission**: Providing fast, secure, and reliable delivery of verified social media accounts

### Color Palette

#### Primary Colors

- **Main Blue**: `#0F162F` (HEX) / RGB(15, 22, 47) / CMYK(93, 84, 59, 64)
- **Secondary Blue**: `#2E3192` (HEX) / RGB(46, 49, 146) / CMYK(99, 96, 3, 1)

#### Supporting Colors

- **Light Purple**: `#696DFA` (HEX) / RGB(105, 109, 250) / CMYK(69, 62, 0, 0)
- **Soft Purple**: `#AAADFF` (HEX) / RGB(170, 173, 255) / CMYK(32, 30, 0, 0)

#### Primary Green System

- **Main Green**: `#25B570` (HEX) / RGB(37, 181, 112) / CMYK(76, 0, 76, 0)
- **Bright Green**: `#05D471` (HEX) / RGB(5, 212, 113) / CMYK(70, 0, 78, 0)
- **Dark Green**: `#0D9152` (HEX) / RGB(13, 145, 82) / CMYK(85, 18, 90, 40)

#### Accent Colors

- **Lime Green**: `#CADB2E` (HEX) / RGB(202, 219, 46) / CMYK(25, 0, 98, 0)
- **Bright Lime**: `#EEFF4E` (HEX) / RGB(238, 255, 78) / CMYK(12, 0, 82, 0)

#### Neutral Colors

- **Dark Gray**: `#313131` (HEX) / RGB(49, 49, 49) / CMYK(70, 64, 62, 60)
- **Pure White**: `#FFFFFF` (HEX) / RGB(255, 255, 255) / CMYK(0, 0, 0, 0)
- **Pure Black**: `#000000` (HEX) / RGB(0, 0, 0) / CMYK(0, 0, 0, 100)

### Color Usage Guidelines

- **Primary branding**: Use dark blue (`#0F162F`) and secondary blue (`#2E3192`) for main brand elements
- **Success states**: Use green system colors (`#25B570`, `#05D471`, `#0D9152`)
- **Highlights/CTAs**: Use lime colors (`#CADB2E`, `#EEFF4E`) for buttons and important elements
- **Interactive elements**: Purple variants (`#696DFA`, `#AAADFF`) for hover states and interactive components
- **Text**: Use neutral colors for optimal readability

### Typography

- **Primary Font**: System font stack (Tailwind default)
- **Headings**: Bold weights (`font-bold`, `font-semibold`)
- **Body**: Regular weight (`font-medium`, `font-normal`)

### Visual Style

- **Design System**: Clean, modern, professional with vibrant accent colors
- **Shadows**: Soft shadows (`shadow-sm`, `shadow-xl`)
- **Borders**: Rounded corners (`rounded-lg`, `rounded-xl`, `rounded-2xl`)
- **Spacing**: Consistent padding/margins using Tailwind scale

## 🛠 Tech Stack

### Core Framework

- **Frontend**: SvelteKit 5 with Svelte 5 runes mode
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide Svelte

### Backend & Database

- **Backend**: Supabase
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth with Google OAuth
- **Storage**: Supabase Storage

### Development Tools

- **Build Tool**: Vite
- **Package Manager**: npm
- **Linting**: ESLint
- **Testing**: Vitest, Playwright
- **Type Checking**: TypeScript

## 📁 Project Structure

```
fastaccs/
├── src/
│   ├── lib/
│   │   ├── components/           # Reusable UI components
│   │   │   ├── Navigation.svelte
│   │   │   ├── Footer.svelte
│   │   │   ├── Cart.svelte
│   │   │   └── ...
│   │   ├── stores/               # Svelte stores
│   │   │   ├── auth.ts          # Authentication state
│   │   │   └── cart.ts          # Shopping cart state
│   │   ├── supabase.ts          # Supabase client
│   │   └── assets/              # Static assets
│   ├── routes/
│   │   ├── +layout.svelte       # Root layout
│   │   ├── +page.svelte         # Homepage
│   │   ├── admin/               # Admin panel
│   │   │   ├── +layout.svelte
│   │   │   ├── +layout.ts
│   │   │   └── inventory/
│   │   ├── auth/                # Authentication
│   │   │   ├── login/
│   │   │   └── callback/
│   │   ├── checkout/            # Checkout process
│   │   ├── dashboard/           # User dashboard
│   │   ├── products/            # Product catalog
│   │   └── product/[id]/        # Individual product
│   └── app.html                 # HTML template
├── static/                      # Static files
├── tests/                       # Test files
└── docs/                        # Documentation
```

## 🔐 Authentication System

### Google OAuth Setup

1. **Supabase Configuration**:
   - Provider: Google
   - Site URL: `http://localhost:5173` (development)
   - Redirect URLs: `http://localhost:5173/auth/callback`

2. **Google Cloud Console**:
   - OAuth consent screen configured
   - Authorized redirect URI: `https://[your-project].supabase.co/auth/v1/callback`

### Auth Flow

1. User clicks "Continue with Google" → `/auth/login`
2. Redirected to Google OAuth
3. Google redirects to Supabase callback
4. Supabase processes auth → `/auth/callback` (server-side)
5. Server redirects to intended destination (e.g., `/admin`)

### Implementation Files

- `src/routes/auth/login/+page.svelte` - Login page
- `src/routes/auth/callback/+server.ts` - Server-side callback handler
- `src/routes/auth/callback/+page.svelte` - Client-side callback fallback
- `src/lib/stores/auth.ts` - Authentication state management

## 🛒 Shopping Cart System

### Features

- Add/remove products
- Update quantities
- Persistent cart (localStorage)
- Real-time total calculation
- Cart dropdown/overlay

### Implementation

- `src/lib/stores/cart.ts` - Cart state management
- `src/lib/components/Cart.svelte` - Cart UI component
- `src/lib/components/MiniCart.svelte` - Cart preview

## 👨‍💼 Admin System

### Access Control

- Environment-based admin authentication
- Admin emails defined in `ADMIN_EMAILS` environment variable
- Secure admin routes with server-side validation

### Features

- **Inventory Management**: CRUD operations for products
- **Order Management**: View and manage customer orders
- **Dashboard**: Analytics and overview

### Admin Files

- `src/routes/admin/+layout.ts` - Admin authentication
- `src/routes/admin/+layout.svelte` - Admin layout
- `src/routes/admin/inventory/+page.svelte` - Product management

## 💰 Checkout System

### Features

- Guest and authenticated checkout
- Multiple delivery methods (Email, WhatsApp, Telegram, Dashboard)
- Form validation
- Order processing

### Implementation

- `src/routes/checkout/+page.svelte` - Checkout page
- Integration with cart and auth systems
- Order creation and processing

## 🎯 Key Features

### Product Catalog

- **Platforms**: Instagram, TikTok, Facebook, Twitter, YouTube
- **Categories**: Accounts, Followers, Likes, Views, etc.
- **Filtering**: By platform, category, price range
- **Search**: Real-time product search
- **Sorting**: Price, popularity, newest

### User Dashboard

- Order history
- Account management
- Purchase tracking
- Profile information

### Security Features

- Environment variable configuration
- Secure admin authentication
- Protected routes
- Input validation
- CSRF protection

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Google Cloud Console account (for OAuth)

### Installation

```bash
# Clone the repository
git clone https://github.com/adetyaz/fastaccs.git
cd fastaccs

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase and other credentials

# Run development server
npm run dev
```

### Environment Variables

```env
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_EMAILS=admin@example.com,another@admin.com
```

### Database Setup

1. Create Supabase project
2. Run database migrations
3. Set up authentication providers
4. Configure storage buckets

## 🧪 Testing

### Commands

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Type checking
npm run check

# Linting
npm run lint
```

### Test Files

- `src/**/*.test.ts` - Unit tests
- `tests/*.spec.ts` - E2E tests
- `src/**/*.spec.ts` - Component tests

## 📦 Deployment

### Build

```bash
npm run build
```

### Environment Setup

- Production Supabase project
- Domain configuration
- SSL certificates
- Environment variables

## 🐛 Known Issues & Solutions

### Authentication

- **Issue**: Google OAuth showing ugly supabase URL
- **Solution**: Proper Google Cloud Console branding setup

### Svelte 5 Migration

- **Issue**: Legacy export syntax
- **Solution**: Use `$props()` instead of `export let`

### TypeScript Errors

- **Issue**: Deprecated imports
- **Solution**: Updated to current Svelte/SvelteKit patterns

## 🔄 Recent Updates

### Authentication System

- Implemented server-side OAuth callback handling
- Fixed Svelte 5 runes compatibility
- Added proper error handling and logging
- Resolved session management issues

### Admin Panel

- Complete inventory page rewrite
- Fixed database schema alignment
- Implemented proper CRUD operations
- Added security with environment-based admin auth

### Cart System

- Fixed import issues
- Updated to Svelte 5 patterns
- Improved state management

## 🤝 Contributing

### Code Style

- Follow Svelte/SvelteKit best practices
- Use TypeScript for type safety
- Follow Tailwind CSS utility-first approach
- Maintain consistent file structure

### Pull Request Process

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Update documentation
5. Submit pull request

## 📞 Support

For technical issues or questions:

- Create GitHub issue
- Check existing documentation
- Review error logs in Supabase dashboard

## 📄 License

[Add your license information here]

---

**FastAccs** - _Premium Social Media Accounts & Boosting Services_
