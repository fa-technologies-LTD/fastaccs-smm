# Dependency security triage

Last reviewed: 30 October 2026 — stabilization cleanup (`codex/stabilization-20261030`)

## Result

`npm audit` reports **0 critical, 0 high, 0 moderate and 5 low** findings. All five come from
the SvelteKit 2 line and are fixed only by the SvelteKit 3 major upgrade (see Deferred below);
`npm audit fix --force` would perform that breaking upgrade and must not be run as a cleanup.
An audit result is not proof that all application security risks are absent. A package marked
development-only can still contribute code to a production build, so the development/runtime
classification alone is never used to dismiss a fix.

On 20 October the audit was zero (down from 19, including two critical) after the upgrades
below; the five low findings were published afterwards against SvelteKit 2.

## Deferred to separate, tested migrations

- **SvelteKit 3** (`@sveltejs/kit` 3.x, `@sveltejs/adapter-vercel` 7.x). Clears all five low
  advisories: enhanced-form redirect to an untrusted site, XSS via an untrusted cache-control
  header on prerendered pages, and `deepmerge` prototype poisoning through the dev-only Svelte
  inspector. Neither prerendering with untrusted headers nor the inspector is used in production,
  but the upgrade should still be planned as its own migration with full regression testing.
- **`telegram` is archived** (npm deprecation notice). Its maintainers point to the compatible
  fork `teleproto`. Used only by the Telegram autopilot (`src/lib/server/autopilot/userbot.ts`)
  and `scripts/telegram-login.mjs`; migrate separately with session-string and FloodWait checks
  on a test account before the autopilot is enabled.

## Safely upgraded

- Vitest 3.2.7 → **4.1.11**, with the matching `@vitest/browser-playwright` provider.
  This patched release removes the affected mocker version and eliminates the vulnerable
  Tinypool dependency rather than overriding worker internals across major versions.
- `vitest-browser-svelte` 0.1.0 → 2.2.1, the compatible Vitest-4 line. Browser imports,
  provider configuration and type references follow the official migration instructions.
- `typescript-eslint` 8.39.0 → 8.72.0, removing the vulnerable fast-glob/micromatch/braces chain.
- Compatible transitive updates: `source-map-js` 1.2.2 and `brace-expansion` 1.1.21/5.0.12.
- Vite 6.4.3 → 6.4.4, addressing the three launch-editor advisories independently reported
  against the bundled development tooling by GitHub. Only Vite changes in the follow-up
  lockfile; no framework major or application dependency upgrade is needed.
- SvelteKit's `cookie` dependency is narrowly overridden to 0.7.2. This fixes invalid
  cookie-name/path/domain handling without a framework major upgrade. Tests exercise the exact
  dependency resolved by SvelteKit: session encoding/options remain intact and field injection
  is rejected. Revisit/remove this override when the maintained framework line includes the fix.
- Keep the existing Prisma `deepmerge-ts` 8.0.0 override; no Prisma downgrade or schema change.

The test runner changes major version; the application framework does not. Application dependency
declarations, customer pricing, supplier choices, payments and order data are unchanged. Compatible
shared dependency resolution changes are recorded in the lockfile. Installation scripts were
disabled during package updates; normal Prisma generation runs in verified check/build commands.

## Verification and release boundary

- Full and production-only npm audit results saved privately under `/private/tmp` on 20 October.
- Regression, verified separate-staging type/build, rollback-only support workflow and local
  desktop/mobile preview results are recorded in `SPRINT_COMPLETION_TODO.md` and the owner handoff.
- Do not treat a zero-audit result as release approval. Local review and explicit owner push/deploy
  approval are still required; nothing in this update changes production orders or money.

## References

- [Vitest 4 migration guide](https://v4.vitest.dev/guide/migration.html)
- [Vitest 4.1.11 release](https://github.com/vitest-dev/vitest/releases/tag/v4.1.11)
- [Cookie-field injection advisory](https://github.com/advisories/GHSA-pxg6-pf52-xh8x)
- [launch-editor Windows existence-check advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm)
- [launch-editor argument interpretation advisory](https://github.com/advisories/GHSA-r825-w8mm-5pxw)
- [launch-editor Windows escaping advisory](https://github.com/advisories/GHSA-698v-4r3x-3vcv)

## Rule for future updates

Run `npm audit`, an independent GitHub security check and normal verification, but never run
`npm audit fix --force` automatically. Review each forced major upgrade or downgrade against
the affected runtime path first.
