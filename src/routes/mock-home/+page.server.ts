import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getHomepageCatalog } from '$lib/server/homepage-catalog';
import { getNumbersStorefront } from '$lib/services/phone-catalog';

export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');

	const [platforms, numberServices] = await Promise.all([
		getHomepageCatalog().catch((catalogError) => {
			console.error('Failed to load homepage preview account catalogue:', catalogError);
			return [];
		}),
		getNumbersStorefront().catch((catalogError) => {
			console.error('Failed to load homepage preview numbers catalogue:', catalogError);
			return [];
		})
	]);

	return { platforms, numberServices };
};
