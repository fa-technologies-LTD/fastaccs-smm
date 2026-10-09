import { describe, it, expect } from 'vitest';
import {
	platformDisplayName,
	startingPrice,
	buildPlatformSeo,
	buildPlatformFaq,
	faqJsonLd
} from './platform-seo';

describe('platformDisplayName', () => {
	it('uses the spellings people search for', () => {
		expect(platformDisplayName('X ', 'x')).toBe('X (Twitter)');
		expect(platformDisplayName('Tiktok', 'tiktok')).toBe('TikTok');
		expect(platformDisplayName('Instagram', 'Instagram')).toBe('Instagram');
		expect(platformDisplayName('VPNs', 'vpns')).toBe('VPN');
	});
	it('falls back to the trimmed stored name for unknown platforms', () => {
		expect(platformDisplayName('  Threads ', 'threads')).toBe('Threads');
	});
});

describe('startingPrice', () => {
	it('prefers the cheapest in-stock tier', () => {
		expect(
			startingPrice([
				{ price: 1500, visible_available: 0 },
				{ price: 2500, visible_available: 3 },
				{ price: 4000, visible_available: 9 }
			])
		).toBe(2500);
	});
	it('falls back to the cheapest listed price when nothing is in stock', () => {
		expect(
			startingPrice([
				{ price: 3000, visible_available: 0 },
				{ price: 1800, visible_available: 0 }
			])
		).toBe(1800);
	});
	it('ignores unpriced tiers and returns 0 when nothing is priced', () => {
		expect(startingPrice([{ price: 0, visible_available: 5 }])).toBe(0);
		expect(startingPrice([])).toBe(0);
	});
});

describe('buildPlatformSeo', () => {
	it('puts the starting price in the title', () => {
		const seo = buildPlatformSeo({ name: 'X ', slug: 'x', startingPriceNgn: 2500, typeCount: 6 });
		expect(seo.title).toBe('Buy X (Twitter) Accounts — from ₦2,500 | FastAccs');
		expect(seo.description).toContain('6 account types');
		expect(seo.description).toContain('from ₦2,500');
	});
	it('omits the price when none is known', () => {
		const seo = buildPlatformSeo({
			name: 'Linkedin',
			slug: 'linkedin',
			startingPriceNgn: 0,
			typeCount: 0
		});
		expect(seo.title).toBe('Buy LinkedIn Accounts | FastAccs');
		expect(seo.description).not.toContain('from');
	});
});

describe('FAQ', () => {
	it('names the platform and serializes as FAQPage structured data', () => {
		const faq = buildPlatformFaq('TikTok');
		expect(faq[0].question).toContain('TikTok');
		const parsed = JSON.parse(faqJsonLd(faq));
		expect(parsed['@type']).toBe('FAQPage');
		expect(parsed.mainEntity).toHaveLength(faq.length);
	});
	it('escapes "<" so content cannot close the script tag', () => {
		const json = faqJsonLd([{ question: '</script><b>', answer: 'x' }]);
		expect(json).not.toContain('<');
		expect(JSON.parse(json).mainEntity[0].name).toBe('</script><b>');
	});
});
