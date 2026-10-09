import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getNumbersStorefront: vi.fn() }));

vi.mock('$lib/services/phone-catalog', () => ({
	getNumbersStorefront: mocks.getNumbersStorefront
}));

import { load } from './+page.server';

const tier = (serviceId: number, serviceName: string, countryName: string, priceNgn: number) => ({
	tierId: `${serviceId}-${countryName}`,
	serviceId,
	serviceName,
	countryId: 1,
	countryName,
	countryCode: countryName === 'USA' ? 'US' : 'GB',
	priceNgn,
	available: true
});

const services = [
	{
		serviceId: 1,
		serviceName: 'WhatsApp',
		tiers: [tier(1, 'WhatsApp', 'USA', 1800), tier(1, 'WhatsApp', 'United Kingdom', 2400)]
	},
	{ serviceId: 2, serviceName: 'Telegram', tiers: [tier(2, 'Telegram', 'USA', 1500)] },
	{ serviceId: 120, serviceName: 'PayPal', tiers: [tier(120, 'PayPal', 'USA', 3000)] }
];

const run = (service: string, country: string, search = '') =>
	(load as CallableFunction)({
		params: { service, country },
		url: new URL(`https://smm.fastaccs.com/numbers/${service}/${country}${search}`)
	});

describe('numbers app + country page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getNumbersStorefront.mockResolvedValue(services);
	});

	it('builds the page with price-led SEO, related links and an FAQ', async () => {
		const result = await run('whatsapp', 'usa');

		expect(result.seo.title).toBe('USA Number for WhatsApp Verification — ₦1,800 | FastAccs');
		expect(result.tier.tierId).toBe('1-USA');
		expect(result.otherCountries).toEqual([
			expect.objectContaining({ label: 'UK', path: '/numbers/whatsapp/uk' })
		]);
		expect(result.otherApps).toEqual([
			{ label: 'Telegram', priceNgn: 1500, path: '/numbers/telegram/usa' }
		]);
		expect(result.faq.length).toBeGreaterThan(0);
	});

	it('301-redirects other casings to the canonical lowercase URL', async () => {
		await expect(run('WhatsApp', 'USA', '?utm_source=x')).rejects.toMatchObject({
			status: 301,
			location: '/numbers/whatsapp/usa?utm_source=x'
		});
	});

	it('404s for unknown combos and for apps without search pages', async () => {
		await expect(run('whatsapp', 'kenya')).rejects.toMatchObject({ status: 404 });
		await expect(run('paypal', 'usa')).rejects.toMatchObject({ status: 404 });
	});

	it('returns 503 when the catalogue cannot load', async () => {
		mocks.getNumbersStorefront.mockRejectedValueOnce(new Error('db down'));
		await expect(run('whatsapp', 'usa')).rejects.toMatchObject({ status: 503 });
	});
});
