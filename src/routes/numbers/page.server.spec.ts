import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getNumbersStorefront } = vi.hoisted(() => ({ getNumbersStorefront: vi.fn() }));

vi.mock('$lib/services/phone-catalog', () => ({ getNumbersStorefront }));

import { load } from './+page.server';

describe('Numbers storefront load state', () => {
	beforeEach(() => getNumbersStorefront.mockReset());

	it('distinguishes a valid empty catalogue from a provider/database outage', async () => {
		getNumbersStorefront.mockResolvedValueOnce([]);
		expect(await (load as CallableFunction)({})).toEqual({
			services: [],
			catalogueUnavailable: false
		});

		getNumbersStorefront.mockRejectedValueOnce(new Error('database unavailable'));
		expect(await (load as CallableFunction)({})).toEqual({
			services: [],
			catalogueUnavailable: true
		});
	});
});
