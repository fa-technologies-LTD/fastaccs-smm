import type { BoostSupplierDetails } from './boosting-supplier-details';

export function supplierDetailsFixture(offerId = 'offer'): BoostSupplierDetails {
	const checkedAt = new Date().toISOString();
	return {
		offerId,
		providers: [
			{
				id: 'smm_raja',
				label: 'SMM Raja',
				balance: 5,
				currency: 'USD',
				balanceCheckedAt: checkedAt,
				enabled: true,
				healthPaused: false,
				services: [
					{
						id: 'demo-service-a',
						serviceId: 'DEMO',
						name: 'Illustrative service A · 30-day refill advertised',
						rateUsd: 0.2,
						min: 10,
						max: 100000,
						lastSeenAt: checkedAt,
						unavailable: false,
						state: 'enabled',
						approved: true,
						refillAdvertised: true,
						refillDaysClaimed: 30,
						recordedVerifiedRefillDays: null,
						recordedObservations: 0,
						consecutiveFailures: 0
					}
				]
			},
			{
				id: 'bulk_follows',
				label: 'BulkFollows',
				balance: 0,
				currency: 'USD',
				balanceCheckedAt: checkedAt,
				enabled: true,
				healthPaused: false,
				services: [
					{
						id: 'demo-service-b',
						serviceId: 'DEMO-B',
						name: 'Illustrative service B · 7-day refill advertised',
						rateUsd: 0.3,
						min: 100,
						max: 50000,
						lastSeenAt: checkedAt,
						unavailable: false,
						state: 'paused',
						approved: false,
						refillAdvertised: true,
						refillDaysClaimed: 7,
						recordedVerifiedRefillDays: 7,
						recordedObservations: 12,
						consecutiveFailures: 1
					}
				]
			}
		]
	};
}
