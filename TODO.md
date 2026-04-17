# FastAccs TODO (Current)

Last updated: 2026-04-15

## Completed Recently

1. Homepage structure refactor (kept current visual language) with refreshed featured platform cards and growth-section launch callout behavior.
2. Dashboard structural pass (welcome row + compact stats + stronger quick-action tiles) while preserving separate `Orders` and `Purchases` tabs.
3. Support page card interaction refresh (full-card click targets + consistent hover arrow treatment).
4. Monnify verify hardening:
   - callback `orderId` sanitization/UUID guard
   - pending-first handling when callback references are absent
   - v2-first verification attempts with fallback to v1 query route
5. Mock lab routes removed from runtime (`src/routes/mock-lab/**`) after design approval.

## In Progress

1. Docs and route notes alignment to actual runtime behavior (API map, homepage/platforms/support/dashboard docs).
2. Deep audit pass documentation for edge cases, public mutation exposure, and operational safeguards.
3. Mock-lab-to-production cleanup and final copy consistency checks.

## Next Priority (Approved Direction)

1. Notify Me production rollout:
   - keep current subscription capture endpoint (`POST /api/restock-notify`)
   - add restock-trigger dispatch pipeline (email notifications on stock transition `0 -> >0`)
   - add unsubscribe token flow and delivery logs.
2. Human-readable customer order identifiers standardization (`ORD-xxxxx`) as display-first support reference.
3. Purchase-tab mobile text-wrap and viewport-density pass (reduce dead scroll space without clutter).

## Security / Risk Backlog

1. `POST /api/send-email` is publicly callable and should be restricted before scaling.
2. `GET /api/test-email` is public and can trigger email logic; should be admin-only or removed in production.
3. `/api/debug/account-connections` currently exposes migration/debug behavior publicly; should be admin-gated.
4. Core mutation endpoints for inventory/orders/categories/accounts are publicly writable by design decision; keep documented as intentional risk until policy changes.

## Deferred / Intentional Non-Changes

1. Wallet reactivation remains deferred (wallet schema/services kept dormant).
2. Full public mutation lock-down remains deferred by owner decision for now.
