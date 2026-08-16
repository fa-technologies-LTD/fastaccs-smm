import type { PageServerLoad } from './$types';
import { getHomepageCatalog } from '$lib/server/homepage-catalog';

export const load: PageServerLoad = async () => {
	try {
		return { platforms: await getHomepageCatalog() };
	} catch (error) {
		console.error('Failed to load featured platforms for home page:', error);
		return { platforms: [] };
	}
};
