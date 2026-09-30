import { describe, expect, it } from 'vitest';
import { sanitizePublicCategoryMetadata, toPublicCategory } from './public-category';

describe('public category DTO', () => {
	it('allowlists storefront tier metadata and drops private commerce fields', () => {
		const metadata = sanitizePublicCategoryMetadata('tier', {
			pricing: { base_price: 8_200, cost_price: 7_500, currency: 'NGN' },
			features: ['Aged'],
			delivery_mode: 'instant_auto',
			affiliate_excluded: false,
			supplier: { id: 'private-supplier' },
			restock_subscribers: ['buyer@example.com']
		});

		expect(metadata).toEqual({
			pricing: { base_price: 8_200, currency: 'NGN' },
			features: ['Aged'],
			delivery_mode: 'instant_auto'
		});
		expect(JSON.stringify(metadata)).not.toMatch(
			/cost_price|affiliate_excluded|supplier|restock_subscribers|buyer@example/
		);
	});

	it('sanitizes nested parent metadata and does not pass through unknown fields', () => {
		const category = toPublicCategory({
			id: 'tier-1',
			name: 'Old IG',
			slug: 'old-ig',
			categoryType: 'tier',
			metadata: { price: 8_200, internal_route: 'secret' },
			parent: {
				id: 'platform-1',
				name: 'Instagram',
				slug: 'instagram',
				categoryType: 'platform',
				metadata: { icon: '/ig.svg', api_info: { token: 'secret' } }
			}
		});

		expect(category).toEqual(
			expect.objectContaining({
				metadata: { price: 8_200 },
				parent: expect.objectContaining({ metadata: { icon: '/ig.svg' } })
			})
		);
		expect(JSON.stringify(category)).not.toMatch(/internal_route|api_info|secret/);
	});
});
