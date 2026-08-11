import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({ phoneRental: { findMany: vi.fn() } }));
vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: vi.fn(),
	NUMBERS_CLEAN_EPOCH: new Date('2000-01-01T00:00:00Z')
}));
vi.mock('./hubman', () => ({ getBalanceCents: vi.fn(), isHubmanConfigured: () => false }));

import { getRescueSpentLast24hNgn, getRealizedCostByTier } from './phone-analytics';

beforeEach(() => vi.clearAllMocks());

describe('getRescueSpentLast24hNgn — rolling portfolio loss', () => {
	it('sums ONLY the orders where supplier cost exceeded the sale price', () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([
			{ costCents: 500, saleAmountNgn: 1000 }, // cost ₦7,500 > ₦1,000 → loss ₦6,500
			{ costCents: 10, saleAmountNgn: 1000 }, // cost ₦150 < ₦1,000 → profit, ignored
			{ costCents: 100, saleAmountNgn: 1000 } // cost ₦1,500 > ₦1,000 → loss ₦500
		]);
		return expect(getRescueSpentLast24hNgn(1500)).resolves.toBe(7000);
	});

	it('is zero when every order was profitable', () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([{ costCents: 40, saleAmountNgn: 1800 }]);
		return expect(getRescueSpentLast24hNgn(1500)).resolves.toBe(0);
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
