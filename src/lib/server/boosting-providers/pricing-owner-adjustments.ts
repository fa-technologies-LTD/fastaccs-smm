import type { BoostPricingSheet } from '$lib/helpers/boosting-pricing-sheet';

/** Owner's follow-up approval, 10 October. Keep the original signed sheet immutable. */
export function applyPricingOwnerAdjustments(sheet: BoostPricingSheet): BoostPricingSheet {
	const next = structuredClone(sheet);
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
	return next;
}
