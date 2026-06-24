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
	name: string;
	description: string;
	metadata: unknown;
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
		const [servicesResponse, platformsResponse] = await Promise.all([
			fetch('/api/categories?type=boosting_service'),
			fetch('/api/categories?type=platform')
		]);
		const servicesResult = await servicesResponse.json();

		if (!servicesResponse.ok) {
			return { services: [], iconUrl: null, error: servicesResult.error || 'Failed to load boosting services' };
		}

		const allServices = (servicesResult.data || []) as PlatformBoostingService[];
		const services = allServices.filter(
			(service) => getBoostingServiceConfig(service.metadata).platform === platform
		);

		const realPlatforms = platformsResponse.ok
			? ((await platformsResponse.json()).data as Array<{
					slug: string;
					metadata?: { icon?: unknown };
				}> | undefined) || []
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
			title: `Buy ${BOOSTING_PLATFORM_LABELS[platform]} Followers, Likes & Views | FastAccs`,
			description: `Grow your ${BOOSTING_PLATFORM_LABELS[platform]} account with real followers, likes, and views. Paste your link, pay, we deliver — no passwords needed.`,
			type: 'website'
		}
	};
};
