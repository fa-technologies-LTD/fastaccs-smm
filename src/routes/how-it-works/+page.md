# How It Works Page

## Purpose

Educational page that explains FastAccs' process to potential customers. Covers account sourcing, security measures, delivery process, and guarantees. Builds trust and reduces buyer hesitation.

## Route

`/how-it-works`

## File Structure

- `+page.svelte` - Main content page (static)

## Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global navigation
- **Footer** (`$lib/components/Footer.svelte`) - Site footer

## Icons Used

- `ShoppingCart`, `Shield`, `Truck`, `CheckCircle`, `Lock`, `Users`, `Search`, `Package`, `Zap`, `MessageCircle` from `@lucide/svelte`

## Data Sources

### No API Calls

This is a static content page. All content is hardcoded in the component.

## Page Sections

### 1. Hero Section

**Content:**

- Page title: "How FastAccs Works"
- Subtitle explaining the simple process
- Trust indicators

### 2. Process Steps (4-Step Flow)

#### Step 1: Browse & Select

- **Icon:** ShoppingCart
- **Description:** Browse platforms and tiers
- **Details:** Instagram, TikTok, Facebook, Twitter, etc.

#### Step 2: Secure Checkout

- **Icon:** Lock
- **Description:** Safe payment processing
- **Details:** Korapay integration, wallet option

#### Step 3: Instant Delivery

- **Icon:** Zap
- **Description:** Get accounts immediately
- **Details:** Automated fulfillment system

#### Step 4: Support

- **Icon:** MessageCircle
- **Description:** 24/7 customer support
- **Details:** Help with any issues

### 3. Features Grid

#### Quality Assurance

- **Icon:** CheckCircle
- **Description:** All accounts verified before listing
- **Details:** Active, authentic accounts

#### Security

- **Icon:** Shield
- **Description:** Secure transactions and data
- **Details:** SSL encryption, secure payment

#### Fast Delivery

- **Icon:** Truck
- **Description:** Instant automated delivery
- **Details:** Credentials in dashboard immediately

#### Premium Selection

- **Icon:** Users
- **Description:** Wide range of tiers
- **Details:** From starter to high-follower accounts

### 4. FAQ Section

**Common Questions Covered:**

- How long does delivery take?
- Are accounts safe to use?
- What if I have issues with my account?
- Can I choose specific accounts?
- What payment methods are accepted?
- Do you offer refunds?

### 5. CTA Section

**Call to Action:**

- "Ready to Get Started?"
- "Browse Accounts" button → `/platforms`
- "View Services" button → `/services`

## Page Layout

- Full-width sections
- Alternating background colors
- Icon-first design
- Responsive grid (1-2-4 columns)

## User Actions

- Read about process
- Navigate to `/platforms` to browse
- Navigate to `/services` for boosting
- Use navigation/footer links

## SEO Metadata

- **Title**: "How It Works - FastAccs"
- **Description**: "Learn how FastAccs delivers premium social media accounts quickly and securely. Our simple 4-step process ensures you get verified accounts instantly."

## Key Messaging

### Trust Elements

- Verified accounts only
- Secure payment processing
- Instant delivery
- 24/7 support
- Money-back guarantee (if mentioned)

### Value Propositions

- Speed: Instant delivery
- Security: Safe transactions
- Quality: Verified accounts
- Support: Always available
- Variety: Multiple platforms and tiers

## Related Pages

- `/` - Homepage
- `/platforms` - Browse accounts
- `/services` - Boosting services
- `/support` - Customer support

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
└── Static content (no dynamic data)
```

## Design Elements

- **Colors:** Brand gradient (purple to blue)
- **Icons:** Lucide icons throughout
- **Typography:** Large headings, readable body text
- **Spacing:** Generous padding and margins
- **Animations:** Hover effects on CTAs

## Content Tone

- Educational and informative
- Confidence-building
- Transparent about process
- Friendly and approachable
- Professional

## Notes

- No API calls or data loading
- Could be enhanced with real stats (total orders, customers, etc.)
- FAQ section could be expanded
- Potential for video content
- Could add customer testimonials
- Static content means easy to edit/update
