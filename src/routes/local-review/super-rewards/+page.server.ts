import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	if (!dev || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) error(404, 'Not found');
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' });
	return {};
};
