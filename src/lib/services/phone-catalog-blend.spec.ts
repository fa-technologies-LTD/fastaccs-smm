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

import {
	blendedBasisCents,
	hasPublishablePvapinsEvidence,
	isThinTier,
	MAJOR_SERVICES,
	PVAPINS_ONLY_MARKET_CODES,
	STOREFRONT_MARKET_CODES
} from './phone-catalog';

describe('curated catalog boundaries', () => {
	it('has unique canonical service ids', () => {
		const ids = MAJOR_SERVICES.map((service) => service.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('keeps pvapins-only origination narrower than the storefront market set', () => {
		expect([...PVAPINS_ONLY_MARKET_CODES].sort()).toEqual([
			'AE',
			'AU',
			'BR',
			'CA',
			'DE',
			'FR',
			'GB',
			'GH',
			'IN',
			'NG',
			'PH',
			'US',
			'ZA'
		]);
		for (const code of PVAPINS_ONLY_MARKET_CODES) {
			expect(STOREFRONT_MARKET_CODES.has(code)).toBe(true);
		}
		expect(STOREFRONT_MARKET_CODES.size).toBe(19);
	});

	it('requires real rent or delivery evidence before a PVAPins-only tier can publish', () => {
		const discovered = {
			serviceId: 507,
			status: 'discovered',
			releaseConfirmed: null,
			metadata: { countryCode: 'NG' }
		};
		const unresolvedRent = {
			...discovered,
			status: 'rentable',
			releaseConfirmed: false
		};
		const releasedRent = {
			...discovered,
			status: 'rentable',
			releaseConfirmed: true
		};

		expect(hasPublishablePvapinsEvidence(507, 'NG', [discovered, unresolvedRent])).toBe(false);
		expect(hasPublishablePvapinsEvidence(507, 'ng', [releasedRent])).toBe(true);
		expect(
			hasPublishablePvapinsEvidence(507, 'NG', [{ ...discovered, status: 'delivery_proven' }])
		).toBe(true);
		expect(hasPublishablePvapinsEvidence(507, 'GH', [releasedRent])).toBe(false);
	});
});

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

describe('isThinTier — headroom flag (headroom < 2× typical cost)', () => {
	it('flags a low-priced tier as thin at the ₦500 floor', () => {
		expect(isThinTier(1800, 750, 500)).toBe(true); // (1800−500)/750 = 1.73
	});

	it('a high (locked) price has ample headroom → not thin', () => {
		expect(isThinTier(5500, 750, 500)).toBe(false); // (5000)/750 = 6.67
	});

	it('lowering the floor to ₦200 lifts a thin tier out of thin', () => {
		expect(isThinTier(1800, 750, 200)).toBe(false); // (1600)/750 = 2.13
	});

	it('is false when cost or price is unknown', () => {
		expect(isThinTier(1800, 0, 500)).toBe(false);
		expect(isThinTier(0, 750, 500)).toBe(false);
	});
});
