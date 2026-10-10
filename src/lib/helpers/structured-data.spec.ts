import { describe, it, expect } from 'vitest';
import { productJsonLd, serializeJsonLd } from './structured-data';

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
