import type { PageServerLoad } from './$types';
import { getNumbersStorefront } from '$lib/services/phone-catalog';

export const load: PageServerLoad = async () => {
	const services = await getNumbersStorefront().catch(() => []);
	return { services };
};
