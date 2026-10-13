import { describe, expect, it } from 'vitest';
import { orderedItemSummary } from './ordered-item-summary';

describe('purchased order item display', () => {
	const followers = {
		productName: 'Facebook Page Followers',
		productCategory: 'boosting_service',
		quantity: 1,
		boostQuantity: 1000,
		boostTargetUrl: 'https://facebook.com/example',
		category: { metadata: { boosting_platform: 'facebook', boosting_action_type: 'followers' } }
	};
	it('shows 1,000 followers instead of one cart line without modifying billing', () => {
		expect(orderedItemSummary(followers)).toEqual({
			tierName: 'Facebook Page Followers',
			platformName: 'Facebook',
			quantity: 1000,
			quantityLabel: '1,000 followers'
		});
		expect(followers.quantity).toBe(1);
	});
	it('uses purchased fulfillment identity before mutable catalogue metadata', () => {
		expect(
			orderedItemSummary({
				...followers,
				boostFulfillment: { outcome: 'likes', platform: 'tiktok' }
			})
		).toMatchObject({ platformName: 'TikTok', quantityLabel: '1,000 likes' });
	});
	it('uses the fulfillment quantity for historical items without boostQuantity', () => {
		expect(
			orderedItemSummary({ ...followers, boostQuantity: null, boostFulfillment: { quantity: 500 } })
				.quantityLabel
		).toBe('500 followers');
	});
	it.each([null, 0, -1, 1.5, Infinity])(
		'does not invent a boosting count when quantity is %s',
		(boostQuantity) => {
			expect(orderedItemSummary({ ...followers, boostQuantity }).quantityLabel).toBe(
				'Quantity unavailable'
			);
		}
	);
	it('keeps account item multipliers and labels unchanged', () => {
		expect(
			orderedItemSummary({ quantity: 2, productName: 'X account', productCategory: 'X' })
		).toMatchObject({ quantity: 2, quantityLabel: '×2', platformName: 'X' });
	});
	it('uses neutral units rather than guessing the outcome of older boosting items', () => {
		expect(orderedItemSummary({ ...followers, category: null }).quantityLabel).toBe('1,000 units');
	});
});
