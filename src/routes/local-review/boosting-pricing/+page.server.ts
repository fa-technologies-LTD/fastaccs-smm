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
	if (url.searchParams.get('review') === 'advisories') {
		pricing.sheet.settings.hardProfitNgn = 1000;
		pricing.sheet.rows[0].sale = 500;
		pricing.setup[pricing.sheet.rows[0].id].maximumCostNgn = 10;
		pricing.availability = {
			[pricing.sheet.rows[0].id]: {
				reasons: ['A customer-facing service claim has not been verified.'],
				checkedAt: new Date().toISOString()
			}
		};
	}
	return {
		pricing,
		supplierDetails: Object.fromEntries(
			pricing.sheet.rows.map((row) => [row.id, supplierDetailsFixture(row.sourceOfferId!)])
		)
	};
};
