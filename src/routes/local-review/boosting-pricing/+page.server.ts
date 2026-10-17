import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	if (!dev || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) error(404, 'Not found');
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' });
	const { boostingPricingPreview } = await import('$lib/server/boosting-pricing-preview');
	const { supplierDetailsFixture } = await import(
		'$lib/helpers/boosting-supplier-details-fixtures'
	);
	const pricing = boostingPricingPreview();
	return {
		pricing,
		supplierDetails: Object.fromEntries(
			pricing.sheet.rows.map((row) => [row.id, supplierDetailsFixture(row.sourceOfferId!)])
		)
	};
};
