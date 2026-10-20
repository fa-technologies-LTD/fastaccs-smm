import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStoreCreditBuckets } from '$lib/services/store-credit';
import { getFirstOrderOffer } from '$lib/services/promotions';

const naira = (value: number) => `₦${Math.floor(value).toLocaleString('en-NG')}`;

/**
 * One or two short lines for the cart drawer: store credit that will apply at checkout, and the
 * first-account-order offer. Signed-out visitors get nothing. Never cached.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user) return json({ lines: [] });
	const lines: string[] = [];
	const [buckets, offer] = await Promise.all([
		getStoreCreditBuckets(locals.user.id).catch(() => null),
		getFirstOrderOffer(locals.user.id).catch(() => null)
	]);
	if (buckets && buckets.totalAvailable >= 1) {
		const soonest = buckets.promo
			.map((entry) => entry.nextExpiresAt)
			.filter((value): value is string => Boolean(value))
			.sort()[0];
		const promoNote =
			buckets.promoAvailable >= 1 && soonest
				? ` (${naira(buckets.promoAvailable)} promo credit, use by ${new Date(soonest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })})`
				: '';
		lines.push(`${naira(buckets.totalAvailable)} store credit can be used at checkout${promoNote}`);
	}
	if (offer) lines.push(`${offer.label}: one tap at checkout`);
	return json({ lines });
};
