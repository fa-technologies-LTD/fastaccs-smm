import { getCacheHeaders } from '$lib/helpers/cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ setHeaders }) => {
	setHeaders(getCacheHeaders('private'));
	return {};
};
