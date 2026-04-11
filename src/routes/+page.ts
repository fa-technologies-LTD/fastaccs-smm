import type { PageLoad } from './$types';

interface PlatformData {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	metadata?: Record<string, unknown>;
}

export const load: PageLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/categories?type=platform');
		if (!response.ok) {
			return { platforms: [] as PlatformData[] };
		}

		const result = await response.json();
		const platforms = (result.data || []) as PlatformData[];

		return {
			platforms
		};
	} catch (error) {
		console.error('Failed to load featured platforms for home page:', error);
		return { platforms: [] as PlatformData[] };
	}
};
