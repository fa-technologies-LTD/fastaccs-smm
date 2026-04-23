# FastAccs

FastAccs is a SvelteKit + Prisma marketplace for selling social media account inventory (currently focused on platform/tier-based listings like Instagram and X).

## Current Runtime Architecture

- Frontend: SvelteKit 2 + Svelte 5 + TypeScript + Tailwind
- Database: PostgreSQL via Prisma ORM
- Auth: Google OAuth + server-side session cookies (Prisma `Session` table)
- Payments: Monnify hosted checkout (redirect flow)
- Fulfillment: Automated account allocation after verified payment
- Email: Nodemailer (Gmail SMTP)
- Notify subscriptions: `POST /api/restock-notify` capture path (dispatch automation pending hardening rollout)

## Active Payment Flow (Monnify)

1. Checkout creates order via `/api/orders` (`paymentMethod: 'monnify'`).
2. Frontend calls `/api/payments/initialize` with `orderId`.
3. Server initializes Monnify transaction and returns `checkoutUrl`.
4. User pays on Monnify hosted page and is redirected to `/checkout/verify`.
5. `/checkout/verify` calls `/api/payments/verify`.
6. Server verifies payment, marks order paid/completed, allocates accounts.
7. Monnify webhook `/api/webhooks/monnify` acts as backstop/idempotent processor.

## Wallet Status

Wallet data models/services remain in the codebase for possible future reactivation.
User-facing wallet routes are not active in the current checkout runtime.

## Repository Structure

```text
src/
  lib/
    auth/                 # Session + OAuth logic
    services/             # Payments, fulfillment, categories, orders, etc.
    components/           # Shared UI
  routes/
    api/                  # HTTP endpoints
    admin/                # Admin panel pages
    checkout/             # Checkout + verification UI
    platforms/            # Catalog browsing by platform and tiers
prisma/
  schema.prisma
  migrations/
```

## Quick Start

```bash
git clone https://github.com/adetyaz/fastaccs.git
cd fastaccs
nvm use 20
npm install
npx prisma generate
npm run dev
```

Runtime requirement: Node `>=20.12.0 <21`

## Environment Variables

Create `.env` (or project env settings in deployment) with:

```env
# Core
DATABASE_URL=
PUBLIC_BASE_URL=
ADMIN_EMAILS=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Monnify
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
MONNIFY_CONTRACT_CODE=
MONNIFY_BASE_URL=https://sandbox.monnify.com

# Email
GMAIL_USER=
GMAIL_APP_PASSWORD=

# Optional affiliate URL override
PUBLIC_SITE_URL=

# Optional live chat (Tawk)
PUBLIC_TAWK_EMBED_URL=
PUBLIC_TAWK_WIDGET_LINK=
```

## Useful Commands

```bash
npm run dev
npm run build
npm run check
npm run release:verify
npm run lint
npm run test
npm run test:e2e
```

## Notes

- `src/lib/services/korapay.ts` and `_archive/korapay.ts` are legacy artifacts, not the active payment path.
- Some mutation APIs are currently ungated; see `src/routes/api/+api-routes.md` for an up-to-date route map and auth notes.
- Public test/debug routes exist in current runtime (`/api/test-email`, `/api/debug/account-connections`) and should be restricted before production hardening.
