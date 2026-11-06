import {
	BOOSTING_ACTION_LABELS,
	BOOSTING_PLATFORM_LABELS
} from '$lib/helpers/boosting-service-config';
import type { BoostingPlatform } from '$lib/helpers/social-link-validator';
import type { PageLoad } from './$types';

export interface ManagedBoostingOffer {
	id: string;
	categoryId: string;
	platform: BoostingPlatform;
	outcome: string;
	customerName: string;
	benefitLabel?: string | null;
	shortPromise: string;
	expectationChips: string[];
	qualityTier: string;
	minQuantity: number;
	maxQuantity: number | null;
	stepQuantity: number;
	quantityPresets: number[];
	pricePerStepNgn: number;
	refillDays: number | null;
	displayOrder: number;
}

export interface ManagedBoostingGroup {
	categoryId: string;
	platform: BoostingPlatform;
	platformLabel: string;
	outcome: string;
	outcomeLabel: string;
	offers: ManagedBoostingOffer[];
}

const PLATFORM_ORDER = [
	'instagram',
	'tiktok',
	'youtube',
	'facebook',
	'x',
	'threads',
	'spotify',
	'telegram'
];
const OUTCOME_ORDER = [
	'followers',
	'subscribers',
	'members',
	'likes',
	'views',
	'comments',
	'custom_comments',
	'impressions',
	'reach',
	'live_likes',
	'story_shares',
	'reposts',
	'reactions',
	'shares',
	'saves',
	'streams',
	'monthly_listeners',
	'watch_time'
];

const SEO = {
	title: 'Social Media Boosting Services | FastAccs',
	description:
		'Grow across major social and streaming platforms with simple, clearly priced services. Paste your link, pay, and track delivery — no password needed.',
	type: 'website'
};

// The old category catalogue (fixed prices and its own purchase forms) is retired for good: the page shows
// reviewed offers only, and with none it shows the upgrade pause instead of anything older.
export const load: PageLoad = async ({ fetch }) => {
	try {
		const offersResponse = await fetch('/api/boosting-offers');
		if (!offersResponse.ok)
			return {
				managedGroups: [] as ManagedBoostingGroup[],
				error: 'Boosting availability could not be checked. Please try again shortly.'
			};
		const offersPayload = (await offersResponse.json()) as { data?: ManagedBoostingOffer[] };
		const groupsByCategory = new Map<string, ManagedBoostingGroup>();
		for (const offer of offersPayload.data ?? []) {
			const group = groupsByCategory.get(offer.categoryId) ?? {
				categoryId: offer.categoryId,
				platform: offer.platform,
				platformLabel: BOOSTING_PLATFORM_LABELS[offer.platform],
				outcome: offer.outcome,
				outcomeLabel:
					BOOSTING_ACTION_LABELS[offer.outcome as keyof typeof BOOSTING_ACTION_LABELS] ??
					offer.outcome,
				offers: []
			};
			group.offers.push(offer);
			groupsByCategory.set(offer.categoryId, group);
		}
		const managedGroups = [...groupsByCategory.values()]
			.map((group) => ({
				...group,
				offers: group.offers.sort(
					(left, right) =>
						left.displayOrder - right.displayOrder ||
						left.customerName.localeCompare(right.customerName)
				)
			}))
			.sort(
				(left, right) =>
					PLATFORM_ORDER.indexOf(left.platform) - PLATFORM_ORDER.indexOf(right.platform) ||
					OUTCOME_ORDER.indexOf(left.outcome) - OUTCOME_ORDER.indexOf(right.outcome)
			);
		return { managedGroups, error: null, seo: SEO };
	} catch (error) {
		console.error('Failed to load boosting services:', error);
		return {
			managedGroups: [] as ManagedBoostingGroup[],
			error: 'Failed to load boosting services'
		};
	}
};
