import type { NumbersPricingView } from './numbers-pricing-sheet';

export function numbersFixture(version = 0): NumbersPricingView {
	const live = {
		active: true,
		mode: 'auto' as const,
		sale: 2000,
		signature: '[true,"auto",2000,500,1,187]'
	};
	return {
		sheet: {
			version,
			rows: [
				{ id: 'number', active: true, mode: 'auto', sale: 2000, targetMarkup: 100, baseline: live }
			]
		},
		fx: 1500,
		defaultMarkup: 100,
		quotes: {
			number: {
				app: 'WhatsApp',
				country: 'United States',
				serviceId: 1,
				countryId: 187,
				provider: 'hubman',
				costCents: 50,
				available: 10,
				autoHidden: false,
				hideReason: null,
				minimumProfit: 500,
				checkedAt: new Date().toISOString(),
				live
			}
		},
		history: version
			? [
					{
						id: 'history',
						action: 'numbers_pricing_draft_saved',
						version,
						createdAt: new Date().toISOString()
					}
				]
			: []
	};
}
