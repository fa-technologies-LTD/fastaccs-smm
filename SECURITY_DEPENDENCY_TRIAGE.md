# Dependency security triage

Last reviewed: 8 September 2026

## Result

The dependency update removes every critical advisory that has a compatible fix and reduces the
local npm report from 14 entries to 6. The remaining 6 entries come from only two underlying
packages; neither is reachable with attacker-controlled input in the current application.

## Safely upgraded

- Vitest and `@vitest/browser` 3.2.6 to 3.2.7
- SvelteKit 2.68.0 to 2.70.3
- `tar` 7.5.17 to 7.5.22
- Vulnerable transitive versions of `brace-expansion`, `js-yaml`, `nanoid`, `postcss`,
  `postcss-selector-parser`, and `@humanfs/node`

These are patch/minor updates allowed by the existing dependency ranges. No framework major was
changed.

## Held: SvelteKit `cookie` dependency

Npm reports the `cookie` package because versions below 0.7 do not reject invalid cookie names,
paths, and domains. The application does not accept those fields from customers: every cookie name
and option is a constant in server code.

The latest SvelteKit release still requests `cookie` 0.6. Forcing npm's suggested fix would install
SvelteKit 0.0.30, an unsafe downgrade that would break the application. Hold this chain until
SvelteKit publishes a compatible dependency update.

## Held: Prisma `deepmerge-ts` dependency

Npm reports stack exhaustion in `deepmerge-ts` when it receives a recursive object graph. It is
pulled in by the Prisma configuration/CLI package. Fast Accounts does not pass customer or request
data into Prisma configuration.

The automated forced fix proposes downgrading Prisma from 6.19.3 to 6.12.0. Do not apply that
downgrade. Revisit this chain when Prisma ships a compatible update using `deepmerge-ts` 8 or later.

## Verification

- Unit tests: 608 passed across 105 files
- Typecheck: 0 errors; 121 existing warnings
- Production build: passed
- Critical advisories after the update: 0

## Rule for future updates

Run `npm audit` and normal verification, but never run `npm audit fix --force` automatically. Review
each forced major upgrade or downgrade against the affected runtime path first.
