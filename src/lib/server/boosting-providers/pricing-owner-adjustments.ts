import type { BoostPricingSheet } from '$lib/helpers/boosting-pricing-sheet';

/** Owner's follow-up approval, 10 October. Keep the original signed sheet immutable. */
export function applyPricingOwnerAdjustments(sheet: BoostPricingSheet): BoostPricingSheet {
	const next = structuredClone(sheet);
	// These are initial review proposals only; never replace edits in a saved pricing revision.
	if (next.version > 0) return next;
	const ordinary = next.rows.find((r) => r.id === '0ad3ae83-2991-46f5-b63d-ba54bff48f7b');
	const custom = next.rows.find((r) => r.id === 'cc0fbcd3-1e08-4d78-b2e6-e46562217e85');
	if (ordinary?.selected && ordinary.serviceId === 's5375' && custom) {
		// Copy commercial choices only. Never reclassify an existing ordinary-comments offer.
		const { id, sourceOfferId, sourceUpdatedAt, platform, outcome, tier, title } = custom;
		Object.assign(custom, ordinary, {
			id,
			sourceOfferId,
			sourceUpdatedAt,
			platform,
			outcome,
			tier,
			title,
			option: '',
			note: 'Owner approved moving s5375 to YouTube Custom Comments on 10 October.'
		});
		ordinary.selected = false;
	}
	// Owner requested cheaper Threads Likes and two distinct Followers choices, 10 October.
	// Read both live catalogues: 14940 remains the cheapest ordinary Likes route ($2.60/1k).
	// Do not fabricate a cheaper route, or replace the owner's existing Affordable Followers.
	const likes = next.rows.find((r) => r.id === '59e8a17b-123b-459f-a6fc-3da9064d0b65');
	if (likes) {
		Object.assign(likes, {
			selected: true,
			provider: 'bulk_follows',
			serviceId: '14940',
			units: 1000,
			sale: 5100,
			targetMarkup: 30,
			priceMode: 'manual',
			option: '',
			note: 'Owner requested a cheaper Threads Likes price. Both live catalogues checked on 10 October: 14940 is already cheapest at $2.60/1,000 (₦3,900 at ₦1,500/USD). ₦5,100 covers 30% markup, rounded up to ₦50. Still more expensive than Affordable Followers; no cheaper compatible route found. Delivery not tested.'
		});
	}
	const affordable = next.rows.find((r) => r.id === '42b4261c-6cde-4c6e-8f4d-3d7691a2431e');
	const refill = next.rows.find((r) => r.id === '29d5571a-8e3c-4008-a0b8-1ceabec096a5');
	if (affordable && refill) {
		affordable.option = 'Affordable';
		Object.assign(refill, {
			selected: true,
			provider: 'bulk_follows',
			serviceId: '8023',
			units: 1000,
			sale: 18300,
			targetMarkup: 30,
			priceMode: 'manual',
			increment: 100,
			startingQuantity: 1000,
			option: 'Refill option',
			recoveryMode: 'off',
			attempts: 1,
			note: 'Owner requested a second Threads Followers choice. BulkFollows 8023 advertises 30-day refill and is the cheapest explicitly 30-day-refill route in both live catalogues on 10 October. Supplier cost ₦14,040/1,000 at ₦1,500/USD; 30% markup rounded up to ₦50 gives ₦18,300. Replaces s3339, whose description says LQ/NR despite the refill API flag. Delivery and refill not tested; verify in Advanced before promising refill protection. Affordable s6699 and its approved price are unchanged.'
		});
	}
	return next;
}
