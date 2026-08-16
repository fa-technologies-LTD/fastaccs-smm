import type { PageServerLoad } from './$types';
import { getNumbersStorefront } from '$lib/services/phone-catalog';

export const load: PageServerLoad = async () => {
	try {
		return { services: await getNumbersStorefront(), catalogueUnavailable: false };
	} catch (error) {
		console.error(
			'[numbers.storefront] catalog load failed:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		return { services: [], catalogueUnavailable: true };
	}
};
