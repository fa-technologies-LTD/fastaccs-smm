import { describe, it, expect } from 'vitest';
import {
	codeToFlag,
	countryDisplayName,
	countrySlug,
	findNumbersPage,
	hasSearchPage,
	listNumbersPages,
	numbersPagePath,
	serviceSlug
} from './numbers-slugs';

const tier = (serviceId: number, serviceName: string, countryName: string, priceNgn = 2000) => ({
	tierId: `${serviceId}-${countryName}`,
	serviceId,
	serviceName,
	countryName,
	countryCode: 'XX',
	priceNgn,
	available: true
});

const services = [
	{
		serviceId: 1,
		serviceName: 'WhatsApp',
		tiers: [tier(1, 'WhatsApp', 'USA'), tier(1, 'WhatsApp', 'United Kingdom')]
	},
	{ serviceId: 3, serviceName: 'Google / Gmail', tiers: [tier(3, 'Google / Gmail', 'Hong Kong')] },
	{ serviceId: 120, serviceName: 'PayPal', tiers: [tier(120, 'PayPal', 'USA')] }
];

describe('slugs', () => {
	it('makes readable service slugs', () => {
		expect(serviceSlug('WhatsApp')).toBe('whatsapp');
		expect(serviceSlug('Google / Gmail')).toBe('google-gmail');
		expect(serviceSlug('X / Twitter')).toBe('x-twitter');
		expect(serviceSlug('OpenAI / ChatGPT')).toBe('openai-chatgpt');
	});
	it('uses the short country names people search for', () => {
		expect(countrySlug('USA')).toBe('usa');
		expect(countrySlug('United Kingdom')).toBe('uk');
		expect(countrySlug('Hong Kong')).toBe('hong-kong');
		expect(countryDisplayName('United Kingdom')).toBe('UK');
		expect(countryDisplayName('Kenya')).toBe('Kenya');
	});
});

describe('page eligibility', () => {
	it('skips search pages for finance and dating verification', () => {
		expect(hasSearchPage('PayPal')).toBe(false);
		expect(hasSearchPage('Tinder')).toBe(false);
		expect(hasSearchPage('WhatsApp')).toBe(true);
		expect(numbersPagePath('PayPal', 'USA')).toBeNull();
		expect(numbersPagePath('WhatsApp', 'United Kingdom')).toBe('/numbers/whatsapp/uk');
	});
});

describe('findNumbersPage', () => {
	it('resolves params case-insensitively', () => {
		expect(findNumbersPage(services, 'WhatsApp', 'UK')?.tier.countryName).toBe('United Kingdom');
		expect(findNumbersPage(services, 'google-gmail', 'hong-kong')?.service.serviceId).toBe(3);
	});
	it('returns null for unknown or page-less combos', () => {
		expect(findNumbersPage(services, 'whatsapp', 'kenya')).toBeNull();
		expect(findNumbersPage(services, 'signal', 'usa')).toBeNull();
		expect(findNumbersPage(services, 'paypal', 'usa')).toBeNull();
	});
});

describe('listNumbersPages', () => {
	it('lists every eligible combo once', () => {
		expect(listNumbersPages(services).map((page) => page.path)).toEqual([
			'/numbers/whatsapp/usa',
			'/numbers/whatsapp/uk',
			'/numbers/google-gmail/hong-kong'
		]);
	});
});

describe('codeToFlag', () => {
	it('turns ISO codes into flags and falls back to a globe', () => {
		expect(codeToFlag('ng')).toBe('🇳🇬');
		expect(codeToFlag('')).toBe('🌍');
	});
});
