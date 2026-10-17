import type { BoostControlsView } from '$lib/helpers/boosting-pricing-controls';
import type { BoostPricingRow } from '$lib/helpers/boosting-pricing-sheet';

/** Publicly fictitious data for the loopback-only dev review page. No database imports or secrets. */
export function boostingPricingPreview(): BoostControlsView {
	const rows: BoostPricingRow[] = [
		{
			id: 'preview-instagram-followers',
			platform: 'instagram',
			outcome: 'followers',
			title: 'Instagram Followers',
			units: 1000,
			sale: 1500,
			selected: false
		},
		{
			id: 'preview-tiktok-likes',
			platform: 'tiktok',
			outcome: 'likes',
			title: 'TikTok Likes',
			units: 1000,
			sale: 750,
			selected: false
		},
		{
			id: 'preview-youtube-comments',
			platform: 'youtube',
			outcome: 'custom_comments',
			title: 'YouTube Custom Comments',
			units: 100,
			sale: 700,
			selected: true
		}
	].map(
		(row): BoostPricingRow => ({
			...row,
			sourceOfferId: `demo-${row.id}`,
			sourceUpdatedAt: '2026-10-15T00:00:00.000Z',
			tier: 'value',
			option: '',
			provider: 'smm_raja',
			serviceId: 'DEMO',
			targetMarkup: 40,
			priceMode: 'manual',
			useDefaultMarkup: true,
			increment: row.outcome === 'custom_comments' ? 10 : 200,
			startingQuantity: row.units,
			recoveryMode: 'off',
			profitBudgetPercent: 0,
			attempts: 1,
			note: ''
		})
	);
	return {
		sheet: {
			version: 1,
			settings: {
				fx: 1500,
				defaultMarkup: 40,
				profitTargetNgn: 0,
				hardProfitNgn: 0,
				feePercent: 0,
				feeFixed: 0,
				feeConfirmed: false,
				maxPriceMultiple: 0
			},
			rows
		},
		quotes: Object.fromEntries(
			rows.map((row) => [
				row.id,
				{
					providerServiceId: `demo-${row.id}`,
					name: 'Illustrative supplier · not a selected real service',
					rateUsd: 0.2,
					min: 10,
					max: 100000,
					checkedAt: new Date().toISOString(),
					issues: []
				}
			])
		),
		liveStatuses: Object.fromEntries(rows.map((row) => [row.id, row.selected ? 'live' : 'hidden'])),
		setup: Object.fromEntries(
			rows.map((row) => [
				row.id,
				{
					categoryId: `demo-${row.id}`,
					routingPolicy: 'locked',
					maximumCostNgn: 1000,
					reviewed: true
				}
			])
		),
		archivedDraft: false,
		history: [],
		approval: { id: 'local-preview', approvedAt: '', digest: 'sample-data-only' }
	};
}
