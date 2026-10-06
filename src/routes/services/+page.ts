import {
	BOOSTING_ACTION_LABELS,
	getBoostingServiceConfig,
	BOOSTING_PLATFORM_LABELS
} from '$lib/helpers/boosting-service-config';
import { canonicalizePlatformKey, isPlatformImageUrl } from '$lib/helpers/platformColors';
import type { BoostingPlatform } from '$lib/helpers/social-link-validator';
import type { PageLoad } from './$types';

export interface ServicesPlatformTile {
	platform: BoostingPlatform;
	label: string;
	iconUrl: string | null;
	serviceCount: number;
	allComingSoon: boolean;
}

export interface ManagedBoostingOffer {
	id: string;
	categoryId: string;
	platform: BoostingPlatform;
	outcome: string;
	customerName: string;
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
	'reposts',
	'reactions',
	'shares',
	'saves',
	'streams',
	'monthly_listeners',
	'watch_time'
];

export const load: PageLoad = async ({ fetch }) => {
	try {
		const [servicesResponse, platformsResponse, offersResponse] = await Promise.all([
			fetch('/api/categories?type=boosting_service'),
			fetch('/api/categories?type=platform'),
			fetch('/api/boosting-offers')
		]);
		const servicesResult = await servicesResponse.json();

		if (!servicesResponse.ok) {
			return {
				managedRolloutActive: false,
				managedGroups: [] as ManagedBoostingGroup[],
				platformTiles: [] as ServicesPlatformTile[],
				error: servicesResult.error || 'Failed to load boosting services'
			};
		}

		const boostingServices = (servicesResult.data || []) as Array<{ metadata: unknown }>;
		const realPlatforms = platformsResponse.ok
			? ((await platformsResponse.json()).data as
					| Array<{
							slug: string;
							metadata?: { icon?: unknown };
					  }>
					| undefined) || []
			: [];

		const iconByPlatformKey = new Map<string, string>();
		for (const platform of realPlatforms) {
			const icon = platform.metadata?.icon;
			if (isPlatformImageUrl(icon)) {
				iconByPlatformKey.set(canonicalizePlatformKey(platform.slug), icon as string);
			}
		}

		const offersPayload = offersResponse.ok
			? ((await offersResponse.json()) as {
					managedRolloutActive?: boolean;
					data?: ManagedBoostingOffer[];
				})
			: null;
		if (offersPayload?.managedRolloutActive) {
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

			return {
				managedRolloutActive: true,
				managedGroups,
				platformTiles: [] as ServicesPlatformTile[],
				error: null,
				seo: {
					title: 'Social Media Boosting Services | FastAccs',
					description:
						'Grow across major social and streaming platforms with simple, clearly priced services. Paste your link, pay, and track delivery — no password needed.',
					type: 'website'
				}
			};
		}

		const countByPlatform = new Map<BoostingPlatform, number>();
		const liveCountByPlatform = new Map<BoostingPlatform, number>();
		for (const service of boostingServices) {
			const config = getBoostingServiceConfig(service.metadata);
			countByPlatform.set(config.platform, (countByPlatform.get(config.platform) || 0) + 1);
			if (config.pricePerStep > 0) {
				liveCountByPlatform.set(
					config.platform,
					(liveCountByPlatform.get(config.platform) || 0) + 1
				);
			}
		}

		const platformTiles: ServicesPlatformTile[] = Array.from(countByPlatform.entries()).map(
			([platform, serviceCount]) => ({
				platform,
				label: BOOSTING_PLATFORM_LABELS[platform],
				iconUrl: iconByPlatformKey.get(canonicalizePlatformKey(platform)) || null,
				serviceCount,
				allComingSoon: (liveCountByPlatform.get(platform) || 0) === 0
			})
		);

		return {
			managedRolloutActive: false,
			managedGroups: [] as ManagedBoostingGroup[],
			platformTiles,
			error: null,
			seo: {
				title: 'Social Media Boosting Services | FastAccs',
				description:
					'Grow across major social and streaming platforms with simple, clearly priced services. Paste your link, pay, and track delivery — no password needed.',
				type: 'website'
			}
		};
	} catch (error) {
		console.error('Failed to load boosting services platforms:', error);
		return {
			managedRolloutActive: false,
			managedGroups: [] as ManagedBoostingGroup[],
			platformTiles: [] as ServicesPlatformTile[],
			error: 'Failed to load boosting services'
		};
	}
};
