import { describe, it, expect, vi } from 'vitest';

// Isolate the pure price-basis blend from phone-catalog's heavy provider/DB deps.
vi.mock('$lib/prisma', () => ({ prisma: {} }));
vi.mock('./hubman', () => ({}));
vi.mock('./pvapins', () => ({}));
vi.mock('./number-providers/service-map', () => ({
	serviceByHubId: vi.fn(),
	pvapinsAppsForService: vi.fn(),
	findPvapinsCountry: vi.fn()
}));
vi.mock('./phone-pricing', () => ({ getPhonePricingConfig: vi.fn(), computeAutoPrice: vi.fn() }));
vi.mock('./phone-analytics', () => ({
	getLowSuccessTierKeys: vi.fn(),
	getRealizedCostByTier: vi.fn(),
	REALIZED_COST_PRIOR_STRENGTH: 20
}));
vi.mock('./restock-notifications', () => ({ triggerNumbersRestockForTier: vi.fn() }));
vi.mock('$lib/helpers/phone-tier-config', () => ({
	PHONE_TIER_KEYS: {},
	PHONE_DELIVERY_MODE: 'auto_sms',
	getPhoneTierConfig: vi.fn()
}));

import { blendedBasisCents } from './phone-catalog';

describe('blendedBasisCents — self-tuning price basis (shrinkage, K=20)', () => {
	it('no clean data → uses the listed catalog prior unchanged', () => {
		expect(blendedBasisCents(750, undefined)).toBe(750);
		expect(blendedBasisCents(750, { medianCents: 500, count: 0 })).toBe(750);
		expect(blendedBasisCents(750, { medianCents: 0, count: 5 })).toBe(750);
	});

	it('n = K → equal weight (halfway between listed and realized)', () => {
		// w = 20/(20+20) = 0.5 → 0.5*600 + 0.5*1000 = 800
		expect(blendedBasisCents(1000, { medianCents: 600, count: 20 })).toBe(800);
	});

	it('n ≫ K → realized cost dominates', () => {
		// w = 60/(60+20) = 0.75 → 0.75*600 + 0.25*1000 = 700
		expect(blendedBasisCents(1000, { medianCents: 600, count: 60 })).toBe(700);
	});
});
