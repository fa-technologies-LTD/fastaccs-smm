import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({ phoneRental: { findMany: vi.fn() } }));
vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: vi.fn(),
	NUMBERS_CLEAN_EPOCH: new Date('2000-01-01T00:00:00Z')
}));
vi.mock('./hubman', () => ({ getBalanceCents: vi.fn(), isHubmanConfigured: () => false }));

import { getRealizedCostByTier } from './phone-analytics';

beforeEach(() => vi.clearAllMocks());

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
