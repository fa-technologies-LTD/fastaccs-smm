import { describe, expect, it } from 'vitest';
import {
	getVerifiedXFollowerAddon,
	hasVerifiedXFollowerAddons,
	VERIFIED_X_FOLLOWER_ADDONS
} from './account-addons';

describe('Verified X follower add-ons', () => {
	it('keeps the approved quantities and price increments', () => {
		expect(VERIFIED_X_FOLLOWER_ADDONS).toEqual([
			{ key: 'followers_100', label: '+100 followers', followerCount: 100, priceDelta: 4_000 },
			{ key: 'followers_500', label: '+500 followers', followerCount: 500, priceDelta: 12_000 },
			{
				key: 'followers_1000',
				label: '+1,000 followers',
				followerCount: 1_000,
				priceDelta: 19_000
			}
		]);
	});

	it('requires the tier-level enable flag and ignores unknown keys', () => {
		expect(hasVerifiedXFollowerAddons({ verified_x_follower_addons: true })).toBe(true);
		expect(getVerifiedXFollowerAddon({}, 'followers_100')).toBeNull();
		expect(
			getVerifiedXFollowerAddon({ verified_x_follower_addons: true }, 'followers_500')?.priceDelta
		).toBe(12_000);
		expect(
			getVerifiedXFollowerAddon({ verified_x_follower_addons: true }, 'followers_5000')
		).toBeNull();
	});

	it('only enables checkout pricing for a manual-handover X tier', () => {
		const metadata = { verified_x_follower_addons: true };
		expect(
			getVerifiedXFollowerAddon(metadata, 'followers_100', {
				platformSlug: 'x',
				deliveryMode: 'manual_handover'
			})?.priceDelta
		).toBe(4_000);
		expect(
			getVerifiedXFollowerAddon(metadata, 'followers_100', {
				platformSlug: 'instagram',
				deliveryMode: 'manual_handover'
			})
		).toBeNull();
		expect(
			getVerifiedXFollowerAddon(metadata, 'followers_100', {
				platformSlug: 'twitter',
				deliveryMode: 'instant_auto'
			})
		).toBeNull();
	});
});
