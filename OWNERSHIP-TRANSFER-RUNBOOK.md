# FastAccs SMM Ownership Transfer Runbook

Date: 2026-04-20
Target: Full operational ownership under FA Technologies LTD
Canonical repo: `fa-technologies-LTD/fastaccs-smm`
Primary host: `smm.fastaccs.com`
Constraint: No new features before MVP launch; stabilization only.

## 0) Timeline Estimate

If all accounts are accessible tonight:
1. GitHub ownership + remote swap: 20-45 minutes
2. Vercel project + domain binding: 20-40 minutes
3. Neon fresh DB + migrations: 20-45 minutes
4. Env reset + integrations (Monnify/OAuth/SMTP): 45-90 minutes
5. Smoke test + bug triage: 90-180 minutes

Expected total to launch-ready state: **3.5 to 7 hours** (same day), depending on DNS propagation and integration dashboard latency.

## 1) GitHub Ownership (Transfer-First, Fallback-Second)

### A. Transfer attempt (preferred)

Owner UI path on existing repo:
`Settings -> General -> Danger Zone -> Transfer repository`

Transfer settings:
1. New owner: `fa-technologies-LTD`
2. New repo name: `fastaccs-smm`

If transfer succeeds, update local remote:
```bash
git remote set-url origin https://github.com/fa-technologies-LTD/fastaccs-smm.git
git fetch origin
git remote -v
```

### B. Fallback (only after explicit reconfirmation)

Create a fresh empty repo in org:
- Name: `fastaccs-smm`
- Visibility: private/public as decided
- No README, no .gitignore, no license (empty repo)

Then from local `fastaccs` workspace:
```bash
git remote rename origin legacy-origin
git remote add origin https://github.com/fa-technologies-LTD/fastaccs-smm.git
git push -u origin main
git push origin --all
git push origin --tags
```

Verify:
```bash
git remote -v
git ls-remote --heads origin
```

## 2) Vercel Ownership + Auto Deploy

1. Use owner-controlled Vercel team.
2. Import `fa-technologies-LTD/fastaccs-smm`.
3. Project name: `fastaccs-smm`.
4. Production branch: `main`.
5. Confirm auto deployments are enabled for pushes to `main`.

## 3) Domain Strategy (No Apex Disruption)

Keep root unchanged during launch:
- Keep `fastaccs.com` and `www.fastaccs.com` current static behavior.

Launch SMM on subdomain:
1. Add `smm.fastaccs.com` in Vercel project Domains.
2. In Namecheap DNS add the record Vercel requests (usually CNAME `smm` -> Vercel target).
3. Wait for verification in Vercel.

## 4) Fresh Neon DB (Owner-Controlled)

1. Create new Neon project/database for SMM launch.
2. Set DB URL in local `.env` and Vercel env.
3. Run migrations locally against fresh DB:
```bash
npx prisma migrate deploy
npx prisma generate
```

If migration table state gets out of sync and manual SQL is used:
```bash
npx prisma db execute --file prisma/migrations/20260418104000_add_email_notification_system/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260418104000_add_email_notification_system
```

## 5) Env Reset / Secret Rotation

Set fresh values in Vercel (Production at minimum):
- `DATABASE_URL`
- `PUBLIC_BASE_URL=https://smm.fastaccs.com`
- `PUBLIC_SITE_URL=https://smm.fastaccs.com` (if used)
- `MONNIFY_BASE_URL`
- `MONNIFY_API_KEY`
- `MONNIFY_SECRET_KEY`
- `MONNIFY_CONTRACT_CODE`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- SMTP block (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`)
- Verification/campaign keys (`VERIFICATION_CODE_EXPIRY_MINUTES`, `WINBACK_DAYS_THRESHOLD`, `WINBACK_SCHEDULER_ENABLED`, `WINBACK_SCHEDULER_INTERVAL_MS`, `BROADCAST_BATCH_SIZE`, `BROADCAST_BATCH_DELAY_MS`)

Then rotate old credentials in provider dashboards.

## 6) Integration URL Cutover

### Monnify
Update callback/webhook endpoints to new host:
- Webhook endpoint should point to: `https://smm.fastaccs.com/api/webhooks/monnify`
- Redirect/callback flows must allow return to `https://smm.fastaccs.com/checkout/verify`

### Google OAuth
Add/update authorized values:
- Authorized JavaScript origin: `https://smm.fastaccs.com`
- Redirect URI: `https://smm.fastaccs.com/auth/google/callback`

## 7) Post-Cutover Smoke Test

Run in order:
1. Login/signup flow
2. Email verification flow
3. Checkout gate for unverified user
4. Monnify pay success/cancel/back flows
5. Dashboard order status truthfulness
6. Order confirmation email
7. Restock subscribe + restock trigger path
8. Admin broadcast send/progress/history

## 8) Access Cleanup (Old Dev Dependency Removal)

After stability confirmation:
1. GitHub: remove old admin/collaborator access from repo/org as appropriate.
2. Vercel: remove old team/project access.
3. Monnify: remove/limit old user access.
4. Google Cloud: remove/limit IAM roles.
5. SMTP provider: rotate credentials and revoke old tokens/app passwords.

## 9) Freeze Policy (MVP)

Until launch stabilization is done:
1. No feature additions.
2. Bug fixes and reliability only.
3. After launch: create new feature branch and reopen roadmap.
