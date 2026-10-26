import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStoreCreditBuckets } from '$lib/services/store-credit';
import { getFirstOrderOffer } from '$lib/services/promotions';
import { getPromoCaps } from '$lib/services/promo-campaigns';

const naira = (value: number) => `₦${Math.floor(value).toLocaleString('en-NG')}`;

/**
 * Cart drawer reminders for a signed-in buyer: the first-account-order offer as a ready line, and
 * their store credit as balances, so the drawer can show what applies to its own (changing) total
 * instead of promising the whole balance. Signed-out visitors get nothing. Never cached.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user) return json({ lines: [], credit: null });
	const lines: string[] = [];
	const [buckets, offer] = await Promise.all([
		getStoreCreditBuckets(locals.user.id).catch(() => null),
		getFirstOrderOffer(locals.user.id).catch(() => null)
	]);
	let credit = null;
	if (buckets && buckets.totalAvailable >= 1) {
		const soonest = buckets.promo
			.map((entry) => entry.nextExpiresAt)
			.filter((value): value is string => Boolean(value))
			.sort()[0];
		credit = {
			refundAvailable: buckets.refundAvailable,
			earnedAvailable: buckets.earnedAvailable,
			promo: buckets.promo,
			promoCaps: buckets.promoAvailable >= 1 ? await getPromoCaps().catch(() => ({})) : {},
			promoNote:
				buckets.promoAvailable >= 1 && soonest
					? `${naira(buckets.promoAvailable)} promo credit, use by ${new Date(soonest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}`
					: null
		};
	}
	if (offer) lines.push(`${offer.label}: one tap at checkout`);
	return json({ lines, credit });
};
