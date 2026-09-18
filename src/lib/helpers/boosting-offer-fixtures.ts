import type { BoostingActionType, BoostingPlatform } from './social-link-validator';

export interface BoostingOfferFixture {
	id: string;
	label: string;
	shortPromise: string;
	badge: string | null;
	unitQuantity: number;
	priceNgn: number;
	highlights: string[];
}

export interface BoostingOutcomeFixture {
	action: BoostingActionType;
	label: string;
	offers: BoostingOfferFixture[];
}

export interface BoostingPlatformFixture {
	platform: BoostingPlatform;
	label: string;
	outcomes: BoostingOutcomeFixture[];
}

export function getPreviewQuantityPresets(unitQuantity: number): number[] {
	if (!Number.isSafeInteger(unitQuantity) || unitQuantity <= 0) return [];
	return [1, 2, 5, 10].map((multiplier) => unitQuantity * multiplier);
}

interface OutcomeSeed {
	action: BoostingActionType;
	label: string;
	unitQuantity: number;
	valuePriceNgn: number;
	upgradePriceNgn: number;
	upgradeLabel: string;
	upgradePromise: string;
}

function outcome(platform: BoostingPlatform, seed: OutcomeSeed): BoostingOutcomeFixture {
	const isAudienceGrowth = ['followers', 'subscribers', 'members', 'monthly_listeners'].includes(
		seed.action
	);
	return {
		action: seed.action,
		label: seed.label,
		offers: [
			{
				id: `${platform}-${seed.action}-value`,
				label: 'Best value',
				shortPromise: 'Reliable and affordable',
				badge: 'Recommended',
				unitQuantity: seed.unitQuantity,
				priceNgn: seed.valuePriceNgn,
				highlights: [
					isAudienceGrowth ? 'Good for everyday growth' : 'Good for everyday posts',
					'Starts soon'
				]
			},
			{
				id: `${platform}-${seed.action}-upgrade`,
				label: seed.upgradeLabel,
				shortPromise: seed.upgradePromise,
				badge: null,
				unitQuantity: seed.unitQuantity,
				priceNgn: seed.upgradePriceNgn,
				highlights: [
					isAudienceGrowth ? 'Better retention' : 'Earlier priority',
					isAudienceGrowth ? 'Refill support' : 'Starts faster'
				]
			}
		]
	};
}

function platform(
	platformId: BoostingPlatform,
	label: string,
	seeds: OutcomeSeed[]
): BoostingPlatformFixture {
	return { platform: platformId, label, outcomes: seeds.map((seed) => outcome(platformId, seed)) };
}

// These prices and promises are intentionally illustrative. Nothing here is published or routed;
// approved offers will come from tested supplier mappings and the admin-owned offer catalogue.
export const BOOSTING_OFFER_FIXTURES: BoostingPlatformFixture[] = [
	platform('instagram', 'Instagram', [
		{
			action: 'followers',
			label: 'Followers',
			unitQuantity: 500,
			valuePriceNgn: 1500,
			upgradePriceNgn: 2200,
			upgradeLabel: 'More stable',
			upgradePromise: 'Less likely to drop'
		},
		{
			action: 'likes',
			label: 'Likes',
			unitQuantity: 500,
			valuePriceNgn: 900,
			upgradePriceNgn: 1400,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		},
		{
			action: 'views',
			label: 'Views',
			unitQuantity: 1000,
			valuePriceNgn: 700,
			upgradePriceNgn: 1100,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		},
		{
			action: 'comments',
			label: 'Comments',
			unitQuantity: 50,
			valuePriceNgn: 1200,
			upgradePriceNgn: 1800,
			upgradeLabel: 'Premium',
			upgradePromise: 'Higher-quality comments'
		}
	]),
	platform('tiktok', 'TikTok', [
		{
			action: 'followers',
			label: 'Followers',
			unitQuantity: 500,
			valuePriceNgn: 1600,
			upgradePriceNgn: 2400,
			upgradeLabel: 'More stable',
			upgradePromise: 'Less likely to drop'
		},
		{
			action: 'views',
			label: 'Views',
			unitQuantity: 1000,
			valuePriceNgn: 600,
			upgradePriceNgn: 1000,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		},
		{
			action: 'likes',
			label: 'Likes',
			unitQuantity: 500,
			valuePriceNgn: 900,
			upgradePriceNgn: 1400,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		}
	]),
	platform('youtube', 'YouTube', [
		{
			action: 'subscribers',
			label: 'Subscribers',
			unitQuantity: 100,
			valuePriceNgn: 2200,
			upgradePriceNgn: 3200,
			upgradeLabel: 'More stable',
			upgradePromise: 'Less likely to drop'
		},
		{
			action: 'views',
			label: 'Views',
			unitQuantity: 1000,
			valuePriceNgn: 1500,
			upgradePriceNgn: 2300,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		},
		{
			action: 'likes',
			label: 'Likes',
			unitQuantity: 500,
			valuePriceNgn: 1300,
			upgradePriceNgn: 1900,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		}
	]),
	platform('facebook', 'Facebook', [
		{
			action: 'followers',
			label: 'Page followers',
			unitQuantity: 500,
			valuePriceNgn: 2000,
			upgradePriceNgn: 2900,
			upgradeLabel: 'More stable',
			upgradePromise: 'Less likely to drop'
		},
		{
			action: 'likes',
			label: 'Post likes',
			unitQuantity: 500,
			valuePriceNgn: 1000,
			upgradePriceNgn: 1500,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		},
		{
			action: 'views',
			label: 'Video views',
			unitQuantity: 1000,
			valuePriceNgn: 800,
			upgradePriceNgn: 1200,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		}
	]),
	platform('x', 'X', [
		{
			action: 'followers',
			label: 'Followers',
			unitQuantity: 500,
			valuePriceNgn: 1800,
			upgradePriceNgn: 2700,
			upgradeLabel: 'More stable',
			upgradePromise: 'Less likely to drop'
		},
		{
			action: 'views',
			label: 'Post views',
			unitQuantity: 1000,
			valuePriceNgn: 700,
			upgradePriceNgn: 1100,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		},
		{
			action: 'likes',
			label: 'Post likes',
			unitQuantity: 500,
			valuePriceNgn: 1000,
			upgradePriceNgn: 1500,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		}
	]),
	platform('spotify', 'Spotify', [
		{
			action: 'streams',
			label: 'Streams',
			unitQuantity: 1000,
			valuePriceNgn: 1600,
			upgradePriceNgn: 2400,
			upgradeLabel: 'Premium',
			upgradePromise: 'Higher-quality delivery'
		},
		{
			action: 'monthly_listeners',
			label: 'Monthly listeners',
			unitQuantity: 500,
			valuePriceNgn: 2200,
			upgradePriceNgn: 3200,
			upgradeLabel: 'More stable',
			upgradePromise: 'Less likely to drop'
		},
		{
			action: 'followers',
			label: 'Artist followers',
			unitQuantity: 500,
			valuePriceNgn: 2000,
			upgradePriceNgn: 3000,
			upgradeLabel: 'More stable',
			upgradePromise: 'Less likely to drop'
		}
	]),
	platform('telegram', 'Telegram', [
		{
			action: 'members',
			label: 'Members',
			unitQuantity: 500,
			valuePriceNgn: 1700,
			upgradePriceNgn: 2500,
			upgradeLabel: 'More stable',
			upgradePromise: 'Less likely to drop'
		},
		{
			action: 'views',
			label: 'Post views',
			unitQuantity: 1000,
			valuePriceNgn: 700,
			upgradePriceNgn: 1100,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		},
		{
			action: 'reactions',
			label: 'Post reactions',
			unitQuantity: 500,
			valuePriceNgn: 1000,
			upgradePriceNgn: 1500,
			upgradeLabel: 'Faster',
			upgradePromise: 'Gets moving sooner'
		}
	])
];
