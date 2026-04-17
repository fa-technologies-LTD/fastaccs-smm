# Platforms Page

## Route

`/platforms`

## Current Purpose

Primary product discovery surface for platform-level inventory entry.

## Runtime Files

- `src/routes/platforms/+page.ts` - loads platform list + tier aggregates
- `src/routes/platforms/+page.svelte` - compact filters/search + card grid UI

## Current UX Structure

1. Compact control stack at top:
   - horizontal filter chips (`All`, `Popular`, `In Stock`, `High Engagement`)
   - inline search field
   - single-line trust strip
2. Product cards appear immediately after controls (mobile-first fold optimization).
3. Empty states:
   - no data
   - no search match (with "Clear search")
4. Lightweight skeleton cards on initial load.

## Data Flow

1. `GET /api/categories?type=platform` -> base platform list.
2. For each platform, `GET /api/categories/tiers/[platformId]` -> tier count, sample tiers, and stock totals.
3. Client computes sorting and filter behavior:
   - in-stock first by default
   - stock-aware ordering for each filter.

## Card Content

- Platform icon with runtime fallback to mapped icon if image URL fails.
- Platform name + description.
- Tier count + total account count.
- Tier pills preview.
- "Browse {Platform} Accounts" CTA row.

## Notes

1. The page keeps current brand palette/styles while reducing non-product vertical overhead.
2. Route still uses multi-fetch aggregation in `+page.ts`; consider moving to a single summary endpoint later for scale.
