import { describe, it, expect } from 'vitest';
import { breadcrumbJsonLd, productJsonLd, serializeJsonLd } from './structured-data';

describe('serializeJsonLd', () => {
	it('escapes characters that could break out of the script tag', () => {
		const json = serializeJsonLd({ name: '</script><b>\u2028' });
		expect(json).not.toContain('<');
		expect(json).not.toContain('\u2028');
		expect(JSON.parse(json).name).toBe('</script><b>\u2028');
	});
});

describe('productJsonLd', () => {
	const base = {
		name: ' USA number for WhatsApp verification ',
		description: 'One number, one code.',
		url: 'https://smm.fastaccs.com/numbers/whatsapp/usa',
		priceNgn: 5800,
		inStock: true,
		category: 'Verification numbers'
	};

	it('builds a Product with an NGN offer and stock state', () => {
		expect(productJsonLd(base)).toEqual({
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: 'USA number for WhatsApp verification',
			description: 'One number, one code.',
			category: 'Verification numbers',
			brand: { '@type': 'Brand', name: 'FastAccs' },
			offers: {
				'@type': 'Offer',
				url: 'https://smm.fastaccs.com/numbers/whatsapp/usa',
				price: '5800',
				priceCurrency: 'NGN',
				availability: 'https://schema.org/InStock',
				seller: { '@type': 'Organization', name: 'FastAccs' }
			}
		});
	});

	it('marks out-of-stock products', () => {
		expect(
			(productJsonLd({ ...base, inStock: false })?.offers as Record<string, string>).availability
		).toBe('https://schema.org/OutOfStock');
	});

	it('emits nothing without a real price or name', () => {
		expect(productJsonLd({ ...base, priceNgn: 0 })).toBeNull();
		expect(productJsonLd({ ...base, name: '  ' })).toBeNull();
	});
});

describe('productJsonLd image', () => {
	it('includes the image when given', () => {
		expect(
			productJsonLd({
				name: 'X',
				description: 'd',
				url: 'https://smm.fastaccs.com/x',
				priceNgn: 100,
				inStock: true,
				image: 'https://smm.fastaccs.com/og-share-1200x630.png'
			})
		).toMatchObject({ image: 'https://smm.fastaccs.com/og-share-1200x630.png' });
	});
});

describe('breadcrumbJsonLd', () => {
	it('numbers positions from 1 and keeps absolute URLs', () => {
		expect(
			breadcrumbJsonLd([
				{ name: 'Home', url: 'https://smm.fastaccs.com/' },
				{ name: 'Accounts', url: 'https://smm.fastaccs.com/platforms' }
			])
		).toEqual({
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://smm.fastaccs.com/' },
				{
					'@type': 'ListItem',
					position: 2,
					name: 'Accounts',
					item: 'https://smm.fastaccs.com/platforms'
				}
			]
		});
	});
	it('emits nothing for a trail shorter than two', () => {
		expect(breadcrumbJsonLd([{ name: 'Home', url: 'https://smm.fastaccs.com/' }])).toBeNull();
	});
});
