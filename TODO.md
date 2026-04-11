# FastAccs TODO (Current)

Last updated: 2026-04-08

## Done

1. Branch synced to current `main` baseline.
2. Monnify cancel-path UUID crash guard added in payment verification flow.
3. Platform identity canonicalization started (`instagram` / `x` alias handling + dynamic home platform cards).

## In Progress

1. Documentation alignment to current runtime (Prisma + Monnify redirect flow).
2. User-facing Korapay copy retirement in support/how-it-works/test pages.
3. Live chat integration via Tawk (`PUBLIC_TAWK_EMBED_URL`, `PUBLIC_TAWK_WIDGET_LINK`).

## Next (Approved Direction)

1. Fully remove remaining Korapay references from active UI/docs/tests.
2. Keep wallet domain model code dormant (no reactivation yet), but keep docs explicit that wallet is not active checkout path.
3. Continue polishing platform icon/color consistency from admin metadata to storefront.
4. Build support live-chat operating workflow (agent handoff and response SLAs).

## Deferred / Intentional Non-Changes

1. Public mutation API guard tightening is deferred by product decision.
2. Wallet subsystem removal is deferred (kept for possible future reintroduction).
