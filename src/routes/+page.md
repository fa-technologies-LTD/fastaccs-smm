# Homepage

## Route

`/`

## Current Purpose

Primary landing page for conversion into platform browsing and checkout.

## Runtime Files

- `src/routes/+page.svelte` - page composition
- `src/routes/+page.ts` - live data loader for platform summaries + featured reviews

## Components (Current)

- `Navigation`
- `HeroBanner`
- `FeaturedCategories`
- `SocialProof`
- `Footer`

## Data Sources (Live)

1. `GET /api/categories?type=platform` for active platform list.
2. `GET /api/categories/tiers/[platformId]` to derive:
   - `tierCount`
   - `totalAccounts`
   - `minPrice`
3. `GET /api/reviews/featured?limit=3` for social-proof cards.

## Notes

1. Homepage is no longer static-only; it now hydrates live platform and review data in `+page.ts`.
2. Featured platform cards currently prioritize structure/CTA clarity and route users into `/platforms` or specific platform pages.
3. Growth services panel is intentionally launch-mode ("coming soon") with WhatsApp CTA.
4. Footer remains the existing live footer structure (no top CTA strip in current rollout).
