import { describe, it, expect, vi, beforeEach } from 'vitest';

const getAvailableServicesMock = vi.hoisted(() => vi.fn());
const loadCountriesMock = vi.hoisted(() => vi.fn());
const loadAppsMock = vi.hoisted(() => vi.fn());

vi.mock('../hubman', () => ({
	isHubmanConfigured: () => true,
	getAvailableServices: getAvailableServicesMock
}));
vi.mock('../pvapins', () => ({
	isPvapinsConfigured: () => true,
	loadCountries: loadCountriesMock,
	loadApps: loadAppsMock,
	usdStringToCents: (v: string) => Math.round(Number(v) * 100)
}));

import { buildLiveCandidatePool } from './live-pool';

const usaCountry = [{ id: 58, full_name: 'USA', picture: 'https://x/_us.webp' }];

beforeEach(() => {
	vi.clearAllMocks();
	loadCountriesMock.mockResolvedValue(usaCountry);
});

describe('buildLiveCandidatePool', () => {
	it('merges hub-man stock + only the matching pvapins variants, ranked (unproven → cost tiebreak)', async () => {
		getAvailableServicesMock.mockResolvedValue({
			'58': { '1': { min_price_cents: 50, max_price_cents: 70, available_numbers_count: 3 } }
		});
		loadAppsMock.mockResolvedValue([
			{ id: 1, full_name: 'Whatsapp24', deduct: '0.66', trending: 0 },
			{ id: 2, full_name: 'Whatsapp46', deduct: '0.40', trending: 0 },
			{ id: 3, full_name: 'Anyother15', deduct: '0.89', trending: 0 } // unrelated — excluded
		]);

		const pool = await buildLiveCandidatePool({
			hubServiceId: 1,
			hubCountryId: 58,
			hubCountryCode: 'US',
			reliability: new Map()
		});

		const labels = pool.map((c) => c.label);
		expect(labels).not.toContain('pvapins:Anyother15');
		// All unproven → same cold-start score → cheapest first: wa46(40) < hub(50) < wa24(66).
		expect(labels).toEqual(['pvapins:Whatsapp46', 'hubman:1', 'pvapins:Whatsapp24']);
	});

	it('is pvapins-only when hub-man has no stock for that service (fills the gap)', async () => {
		getAvailableServicesMock.mockResolvedValue({ '58': {} });
		loadAppsMock.mockResolvedValue([{ id: 1, full_name: 'Whatsapp24', deduct: '0.66', trending: 0 }]);

		const pool = await buildLiveCandidatePool({
			hubServiceId: 1,
			hubCountryId: 58,
			hubCountryCode: 'US',
			reliability: new Map()
		});

		expect(pool.map((c) => c.provider)).toEqual(['pvapins']);
		expect(pool[0].label).toBe('pvapins:Whatsapp24');
	});

	it('applies learned reliability so a proven supplier outranks cheaper unproven ones', async () => {
		getAvailableServicesMock.mockResolvedValue({ '58': {} });
		loadAppsMock.mockResolvedValue([
			{ id: 1, full_name: 'Whatsapp24', deduct: '0.66', trending: 0 },
			{ id: 2, full_name: 'Whatsapp46', deduct: '0.10', trending: 0 } // cheapest, but proven-bad
		]);

		const pool = await buildLiveCandidatePool({
			hubServiceId: 1,
			hubCountryId: 58,
			hubCountryCode: 'US',
			reliability: new Map([
				['pvapins:Whatsapp24', { received: 18, total: 20, reliability: 0.9 }],
				['pvapins:Whatsapp46', { received: 1, total: 20, reliability: 0.05 }]
			])
		});

		expect(pool[0].label).toBe('pvapins:Whatsapp24'); // reliability beats the cheaper bad one
	});
});
