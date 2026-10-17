import type { BoostSaleOffer } from './boosting-sale-readiness';

/** Synthetic records only; no external service codes, credentials, or customer data. */
export function saleOfferFixture(): BoostSaleOffer {
	const now = new Date();
	return {
		id: 'fixture-offer',
		categoryId: 'fixture-category',
		platform: 'tiktok',
		outcome: 'likes',
		targetType: 'content',
		customerName: 'TikTok Likes',
		shortPromise: 'A straightforward option.',
		qualityTier: 'value',
		expectationChips: [],
		status: 'live',
		minQuantity: 100,
		maxQuantity: 10000,
		stepQuantity: 100,
		pricePerStepNgn: 100,
		quantityPresets: [100, 200, 500],
		minimumMarginPercent: 20,
		maximumSupplierCostNgn: 100,
		refillDays: null,
		audienceTag: 'general',
		requiredVerifiedSignals: [],
		routingPolicy: 'locked',
		lockedRouteId: 'fixture-route',
		displayOrder: 0,
		routes: [
			{
				id: 'fixture-route',
				state: 'enabled',
				equivalenceApproved: true,
				targetType: 'content',
				minimumQuantity: 100,
				maximumQuantity: 10000,
				quantityStep: null,
				verifiedSignals: [],
				audienceTags: [],
				verifiedRefillDays: null,
				reliabilityScore: 1,
				reliabilityObservations: 5,
				providerService: {
					id: 'fixture-service',
					provider: 'smm_raja',
					serviceId: 'FIXTURE-NOT-REAL',
					name: 'TikTok Likes',
					category: 'TikTok Likes',
					providerType: 'Default',
					platforms: ['tiktok'],
					outcomes: ['likes'],
					targetType: 'content',
					ratePerThousand: 0.1,
					minQuantity: 100,
					maxQuantity: 10000,
					unavailableAt: null,
					catalogueStatus: 'ready_for_review',
					lastSeenAt: now,
					refillAdvertised: false,
					providerState: {
						provider: 'smm_raja',
						enabled: true,
						circuitOpen: false,
						currency: 'USD',
						projectedBalance: 100,
						balance: 100,
						lastCatalogueSuccessAt: now,
						lastBalanceSuccessAt: now
					}
				}
			}
		]
	} as unknown as BoostSaleOffer;
}
