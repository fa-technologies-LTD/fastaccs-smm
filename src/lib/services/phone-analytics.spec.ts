import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({ phoneRental: { findMany: vi.fn() } }));
vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: vi.fn(),
	NUMBERS_CLEAN_EPOCH: new Date('2000-01-01T00:00:00Z')
}));
vi.mock('./hubman', () => ({ getBalanceCents: vi.fn(), isHubmanConfigured: () => false }));

import { getRealizedCostByTier, getLowSuccessTierKeys } from './phone-analytics';

beforeEach(() => vi.clearAllMocks());

// Build `n` rentals for one tier + provider with `received` of them delivered.
function rentals(
	serviceName: string,
	countryName: string,
	provider: string,
	received: number,
	failed: number
) {
	const rows: Array<{ serviceName: string; countryName: string; provider: string; status: string }> = [];
	for (let i = 0; i < received; i++) rows.push({ serviceName, countryName, provider, status: 'received' });
	for (let i = 0; i < failed; i++) rows.push({ serviceName, countryName, provider, status: 'refunded' });
	return rows;
}

describe('getLowSuccessTierKeys — provider-aware, two-supplier safe', () => {
	it('does NOT hide when failures are split across two under-sampled providers', () => {
		// The real USA WhatsApp case: hub-man 0/7, pvapins 2/3 — neither hits MIN_SAMPLE (10),
		// so both are "untested" and the tier stays live (the old code summed them and hid it).
		prismaMock.phoneRental.findMany.mockResolvedValue([
			...rentals('WhatsApp', 'USA', 'hubman', 0, 7),
			...rentals('WhatsApp', 'USA', 'pvapins', 2, 1)
		]);
		return getLowSuccessTierKeys().then((set) => expect(set.has('WhatsApp||USA')).toBe(false));
	});

	it('does NOT hide when one supplier is proven-bad but the other is proven-good', () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([
			...rentals('WhatsApp', 'USA', 'hubman', 0, 20), // BAD (0%)
			...rentals('WhatsApp', 'USA', 'pvapins', 18, 2) // GOOD (90%)
		]);
		return getLowSuccessTierKeys().then((set) => expect(set.has('WhatsApp||USA')).toBe(false));
	});

	it('does NOT hide when one supplier is proven-bad but the other is untested', () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([
			...rentals('WhatsApp', 'USA', 'hubman', 0, 20), // BAD
			...rentals('WhatsApp', 'USA', 'pvapins', 3, 1) // untested (< MIN_SAMPLE)
		]);
		return getLowSuccessTierKeys().then((set) => expect(set.has('WhatsApp||USA')).toBe(false));
	});

	it('hides ONLY when every sampled supplier is proven-bad', () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([
			...rentals('WhatsApp', 'USA', 'hubman', 1, 19), // 5% BAD
			...rentals('WhatsApp', 'USA', 'pvapins', 2, 18) // 10% BAD
		]);
		return getLowSuccessTierKeys().then((set) => expect(set.has('WhatsApp||USA')).toBe(true));
	});

	it('reads only the recent window (passes a createdAt lower bound)', () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([]);
		return getLowSuccessTierKeys().then(() => {
			const arg = prismaMock.phoneRental.findMany.mock.calls[0][0];
			expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
		});
	});
});

describe('getRealizedCostByTier — robust median per tier', () => {
	it('keys by serviceId||countryId and takes the median cost, skipping bad rows', () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([
			{ serviceId: 1, countryId: 58, costCents: 60 },
			{ serviceId: 1, countryId: 58, costCents: 40 },
			{ serviceId: 1, countryId: 58, costCents: 50 },
			{ serviceId: 1, countryId: 58, costCents: null }, // skipped
			{ serviceId: 2, countryId: 7, costCents: 200 }
		]);
		return getRealizedCostByTier().then((map) => {
			expect(map.get('1||58')).toEqual({ medianCents: 50, count: 3 });
			expect(map.get('2||7')).toEqual({ medianCents: 200, count: 1 });
		});
	});
});
