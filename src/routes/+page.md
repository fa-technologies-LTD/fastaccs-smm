# Homepage

## Purpose

Landing page that serves as the entry point to FastAccs. Showcases the platform's value proposition, featured categories, and social proof to convert visitors into customers.

## Route

`/`

## File Structure

- `+page.svelte` - Main component
- No `+page.ts` or `+page.server.ts` (static content)

## Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global site navigation with cart and user menu
- **HeroBanner** (`$lib/components/HeroBanner.svelte`) - Hero section with CTA buttons
- **FeaturedCategories** (`$lib/components/FeaturedCategories.svelte`) - Grid of featured platform categories
- **SocialProof** (`$lib/components/SocialProof.svelte`) - Trust indicators and testimonials
- **Footer** (`$lib/components/Footer.svelte`) - Site footer with links

## Icons Used

- `Instagram`, `Music`, `Facebook`, `Twitter`, `Star`, `Eye`, `Youtube` from `@lucide/svelte`

## Data Sources

### No API Calls

This page uses static/hardcoded content. No data fetching occurs on load.

### Cart Store

- **Source**: `$lib/stores/cart.svelte`
- **Purpose**: Reactive cart state for adding items
- **Methods Used**: `cart.addTier(productId, quantity)`

## Page State

No reactive state managed directly in this component. All interactivity handled by child components.

## Key Features

1. **Hero Section**
   - Two primary CTAs:
     - "Browse Accounts" → `/platforms`
     - "View Growth Services" → `/services`
   - Trust indicators (Premium, 24/7, Secure)

2. **Featured Categories Display**
   - Dynamic grid of platform categories
   - Platform-specific colors and icons
   - Quick add-to-cart functionality

3. **Social Proof Section**
   - Customer testimonials
   - Trust badges
   - Statistics

## User Actions

- Click "Browse Accounts" → Navigate to `/platforms`
- Click "View Growth Services" → Navigate to `/services`
- Add featured items to cart (via FeaturedCategories component)
- Navigate to other pages via header/footer links

## SEO Metadata

- **Title**: "FastAccs - Premium Social Media Accounts & Growth Services"
- **Description**: "Nigeria's marketplace for social media accounts and growth services with secure checkout and fast order processing."

## Related Pages

- `/platforms` - Browse all platforms
- `/services` - Boosting services (not fully implemented)
- `/how-it-works` - Platform explanation
- `/checkout` - Purchase flow

## Component Dependencies

```
+page.svelte
├── Navigation
├── HeroBanner
├── FeaturedCategories
├── SocialProof
└── Footer
```

## Notes

- Commented out featured products section (lines 49-141) - not currently in use
- Platform icons mapped with fallback to Twitter icon if platform not found
- Price formatting uses Nigerian Naira (NGN) currency
