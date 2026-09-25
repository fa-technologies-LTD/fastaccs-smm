import { redirect } from '@sveltejs/kit';
import {
	BOOSTING_PLATFORMS,
	BOOSTING_PLATFORM_LABELS,
	getBoostingServiceConfig
} from '$lib/helpers/boosting-service-config';
import { canonicalizePlatformKey, isPlatformImageUrl } from '$lib/helpers/platformColors';
import type { BoostingPlatform } from '$lib/helpers/social-link-validator';
import type { PageLoad } from './$types';

export interface PlatformBoostingService {
	id: string;
	categoryId: string;
	name: string;
	description: string;
	metadata: unknown;
	customerOffer?: {
		id: string;
		customerName: string;
		shortPromise: string;
		expectationChips: string[];
		qualityTier: string;
		displayOrder: number;
		minQuantity: number;
		stepQuantity: number;
		quantityPresets: number[];
		pricePerStepNgn: number;
		refillDays: number | null;
	};
}

interface LoadedPlatformServices {
	services: PlatformBoostingService[];
	iconUrl: string | null;
	error: string | null;
}

async function fetchPlatformServices(
	fetch: typeof window.fetch,
	platform: BoostingPlatform
): Promise<LoadedPlatformServices> {
	try {
		const [servicesResponse, platformsResponse, offerCopyResponse] = await Promise.all([
			fetch('/api/categories?type=boosting_service'),
			fetch('/api/categories?type=platform'),
			fetch('/api/boosting-offers')
		]);
		const servicesResult = await servicesResponse.json();

		if (!servicesResponse.ok) {
			return {
				services: [],
				iconUrl: null,
				error: servicesResult.error || 'Failed to load boosting services'
			};
		}

		const liveOffers = offerCopyResponse.ok
			? (((await offerCopyResponse.json()).data || []) as Array<{
					id: string;
					categoryId: string;
					customerName: string;
					shortPromise: string;
					expectationChips: string[];
					qualityTier: string;
					displayOrder: number;
					minQuantity: number;
					stepQuantity: number;
					quantityPresets: number[];
					pricePerStepNgn: number;
					refillDays: number | null;
				}>)
			: [];
		const offersByCategoryId = new Map<string, typeof liveOffers>();
		for (const offer of liveOffers) {
			const list = offersByCategoryId.get(offer.categoryId) ?? [];
			list.push(offer);
			offersByCategoryId.set(offer.categoryId, list);
		}
		const allServices = (servicesResult.data || []) as PlatformBoostingService[];
		const services = allServices
			.filter((service) => getBoostingServiceConfig(service.metadata).platform === platform)
			.flatMap((service) => {
				const offers = (offersByCategoryId.get(service.id) ?? []).sort(
					(left, right) => left.displayOrder - right.displayOrder
				);
				if (!offers.length) return [{ ...service, categoryId: service.id }];
				return offers.map((offer) => ({
					...service,
					id: offer.id,
					categoryId: service.id,
					customerOffer: {
						id: offer.id,
						customerName: offer.customerName,
						shortPromise: offer.shortPromise,
						expectationChips: offer.expectationChips,
						qualityTier: offer.qualityTier,
						displayOrder: offer.displayOrder,
						minQuantity: offer.minQuantity,
						stepQuantity: offer.stepQuantity,
						quantityPresets: offer.quantityPresets,
						pricePerStepNgn: offer.pricePerStepNgn,
						refillDays: offer.refillDays
					}
				}));
			});

		const realPlatforms = platformsResponse.ok
			? ((await platformsResponse.json()).data as
					| Array<{
							slug: string;
							metadata?: { icon?: unknown };
					  }>
					| undefined) || []
			: [];
		const matchingPlatform = realPlatforms.find(
			(row) => canonicalizePlatformKey(row.slug) === canonicalizePlatformKey(platform)
		);
		const iconUrl = isPlatformImageUrl(matchingPlatform?.metadata?.icon)
			? (matchingPlatform!.metadata!.icon as string)
			: null;

		return { services, iconUrl, error: null };
	} catch (error) {
		console.error('Failed to load platform boosting services:', error);
		return { services: [], iconUrl: null, error: 'Failed to load boosting services' };
	}
}

export const load: PageLoad = async ({ fetch, params }) => {
	const platform = params.platform as BoostingPlatform;
	if (!BOOSTING_PLATFORMS.includes(platform)) {
		throw redirect(303, '/services');
	}

	const { services, iconUrl, error } = await fetchPlatformServices(fetch, platform);

	if (!error && services.length === 0) {
		throw redirect(303, '/services');
	}

	return {
		platform,
		label: BOOSTING_PLATFORM_LABELS[platform],
		iconUrl,
		services,
		error,
		seo: {
			title: `${BOOSTING_PLATFORM_LABELS[platform]} Boosting Services | FastAccs`,
			description: `Grow on ${BOOSTING_PLATFORM_LABELS[platform]} with simple, clearly priced services. Paste your link, pay, and track delivery — no password needed.`,
			type: 'website'
		}
	};
};
