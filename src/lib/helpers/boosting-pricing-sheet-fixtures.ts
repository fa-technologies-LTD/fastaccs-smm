import type {
	BoostPricingRow,
	BoostPricingSheet,
	BoostPricingQuote
} from './boosting-pricing-sheet';
export const row: BoostPricingRow = {
	id: 'row',
	sourceOfferId: 'offer',
	sourceUpdatedAt: '2026-10-10T12:00:00.000Z',
	platform: 'tiktok',
	outcome: 'likes',
	tier: 'value',
	title: 'TikTok Likes',
	option: '',
	selected: true,
	provider: 'smm_raja',
	serviceId: 's1675',
	units: 1000,
	sale: 500,
	targetMarkup: 30,
	priceMode: 'manual',
	increment: 100,
	startingQuantity: 100,
	recoveryMode: 'definitive',
	profitBudgetPercent: 20,
	attempts: 2,
	note: ''
};
export const sheet: BoostPricingSheet = {
	version: 0,
	settings: { fx: 1500, feePercent: 0, feeFixed: 0, feeConfirmed: false },
	rows: [row]
};
export const quote: BoostPricingQuote = {
	providerServiceId: 'service',
	name: 'TikTok Likes',
	rateUsd: 0.054,
	min: 100,
	max: 100000,
	checkedAt: '2026-10-10T12:00:00Z',
	issues: []
};
