import { describe, it, expect, vi } from 'vitest';

// rate-limiter imports prisma at module load; the pure token math under test needs no DB.
vi.mock('$lib/prisma', () => ({ prisma: {} }));

import { computeTokenGrant, pvapinsRateSpec, type TokenBucketSpec } from './rate-limiter';

const SPEC: TokenBucketSpec = { capacity: 5, refillPerSec: 5 / 60 }; // ~5/min

describe('computeTokenGrant — distributed token bucket math', () => {
	it('first use starts full and grants one', () => {
		const r = computeTokenGrant(null, new Date(), SPEC);
		expect(r.granted).toBe(true);
		expect(r.tokens).toBe(4); // capacity 5, spent 1
	});

	it('denies when the bucket is empty and no time has passed', () => {
		const now = new Date();
		const r = computeTokenGrant({ tokens: 0, updatedAt: now }, now, SPEC);
		expect(r.granted).toBe(false);
		expect(r.tokens).toBe(0);
	});

	it('refills over elapsed time — 12s at 5/min = 1 token → grants', () => {
		const now = new Date();
		const twelveSecAgo = new Date(now.getTime() - 12_000);
		const r = computeTokenGrant({ tokens: 0, updatedAt: twelveSecAgo }, now, SPEC);
		expect(r.granted).toBe(true);
		expect(r.tokens).toBeCloseTo(0, 5); // ~1 refilled, then spent
	});

	it('does not over-refill past capacity', () => {
		const now = new Date();
		const longAgo = new Date(now.getTime() - 10 * 60_000); // 10 min
		const r = computeTokenGrant({ tokens: 5, updatedAt: longAgo }, now, SPEC);
		expect(r.granted).toBe(true);
		expect(r.tokens).toBe(4); // capped at 5, then spent 1
	});

	it('still denies just before a full token has refilled', () => {
		const now = new Date();
		const sixSecAgo = new Date(now.getTime() - 6_000); // ~0.5 token
		const r = computeTokenGrant({ tokens: 0, updatedAt: sixSecAgo }, now, SPEC);
		expect(r.granted).toBe(false);
	});
});

describe('pvapinsRateSpec', () => {
	it('maps a per-minute limit to capacity + refill/sec', () => {
		expect(pvapinsRateSpec(5)).toEqual({ capacity: 5, refillPerSec: 5 / 60 });
	});
	it('floors the limit at 1/min', () => {
		expect(pvapinsRateSpec(0)).toEqual({ capacity: 1, refillPerSec: 1 / 60 });
	});
});
