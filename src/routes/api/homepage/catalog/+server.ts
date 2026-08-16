import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHomepageCatalog } from '$lib/server/homepage-catalog';

export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders({ 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' });
	return json({ success: true, data: await getHomepageCatalog() });
};
