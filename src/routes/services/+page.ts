import { getBoostingServiceConfig, BOOSTING_PLATFORM_LABELS } from '$lib/helpers/boosting-service-config';
import { canonicalizePlatformKey, isPlatformImageUrl } from '$lib/helpers/platformColors';
import type { BoostingPlatform } from '$lib/helpers/social-link-validator';
import type { PageLoad } from './$types';

export interface ServicesPlatformTile {
	platform: BoostingPlatform;
	label: string;
	iconUrl: string | null;
	serviceCount: number;
}

export const load: PageLoad = async ({ fetch }) => {
	try {
		const [servicesResponse, platformsResponse] = await Promise.all([
			fetch('/api/categories?type=boosting_service'),
			fetch('/api/categories?type=platform')
		]);
		const servicesResult = await servicesResponse.json();

		if (!servicesResponse.ok) {
			return {
				platformTiles: [] as ServicesPlatformTile[],
				error: servicesResult.error || 'Failed to load boosting services'
			};
		}

		const boostingServices = (servicesResult.data || []) as Array<{ metadata: unknown }>;
		const realPlatforms = platformsResponse.ok
			? ((await platformsResponse.json()).data as Array<{
					slug: string;
					metadata?: { icon?: unknown };
				}> | undefined) || []
			: [];

		const iconByPlatformKey = new Map<string, string>();
		for (const platform of realPlatforms) {
			const icon = platform.metadata?.icon;
			if (isPlatformImageUrl(icon)) {
				iconByPlatformKey.set(canonicalizePlatformKey(platform.slug), icon as string);
			}
		}

		const countByPlatform = new Map<BoostingPlatform, number>();
		for (const service of boostingServices) {
			const config = getBoostingServiceConfig(service.metadata);
			countByPlatform.set(config.platform, (countByPlatform.get(config.platform) || 0) + 1);
		}

		const platformTiles: ServicesPlatformTile[] = Array.from(countByPlatform.entries()).map(
			([platform, serviceCount]) => ({
				platform,
				label: BOOSTING_PLATFORM_LABELS[platform],
				iconUrl: iconByPlatformKey.get(canonicalizePlatformKey(platform)) || null,
				serviceCount
			})
		);

		return { platformTiles, error: null };
	} catch (error) {
		console.error('Failed to load boosting services platforms:', error);
		return {
			platformTiles: [] as ServicesPlatformTile[],
			error: 'Failed to load boosting services'
		};
	}
};
