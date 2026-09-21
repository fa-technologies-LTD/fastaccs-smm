import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	findMany: vi.fn(),
	getLowSuccessTierKeys: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		category: {
			findFirst: mocks.findFirst,
			findMany: mocks.findMany
		}
	}
}));
vi.mock('./hubman', () => ({ isHubmanConfigured: () => true }));
vi.mock('./pvapins', () => ({ isPvapinsConfigured: () => false }));
vi.mock('./number-providers/service-map', () => ({
	serviceByHubId: vi.fn(),
	pvapinsAppsForService: vi.fn(),
	findPvapinsCountry: vi.fn()
}));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: vi.fn(),
	computeAutoPrice: vi.fn(),
	stabilizePrice: vi.fn()
}));
vi.mock('./phone-analytics', () => ({
	getLowSuccessTierKeys: mocks.getLowSuccessTierKeys,
	getRealizedCostByTier: vi.fn(),
	REALIZED_COST_PRIOR_STRENGTH: 20
}));
vi.mock('./restock-notifications', () => ({ triggerNumbersRestockForTier: vi.fn() }));

import { getNumbersStorefront } from './phone-catalog';

function tier(id: string, serviceName: string, countryName: string) {
	return {
		id,
		metadata: {
			delivery_mode: 'auto_sms',
			hub_service_id: 1,
			hub_country_id: countryName === 'United States' ? 187 : 16,
			hub_service_name: serviceName,
			hub_country_name: countryName,
			hub_country_code: countryName === 'United States' ? 'US' : 'GB',
			hub_expected_cost_cents: 50,
			hub_available_count: 1,
			auto_hidden: false,
			pricing: { base_price: 1500 }
		}
	};
}

describe('getNumbersStorefront route protection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findFirst.mockResolvedValue({ id: 'numbers-platform' });
		mocks.findMany.mockResolvedValue([
			tier('wa-us', 'WhatsApp', 'United States'),
			tier('wa-gb', 'WhatsApp', 'United Kingdom')
		]);
	});

	it('mutes an unsafe tier immediately while keeping a healthy fallback market buyable', async () => {
		mocks.getLowSuccessTierKeys.mockResolvedValue(new Set(['WhatsApp||United States']));

		const groups = await getNumbersStorefront();
		const tiers = groups.flatMap((group) => group.tiers);

		expect(tiers.find((row) => row.tierId === 'wa-us')?.available).toBe(false);
		expect(tiers.find((row) => row.tierId === 'wa-gb')?.available).toBe(true);
	});
});
