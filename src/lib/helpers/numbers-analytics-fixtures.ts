import type { NumbersAnalytics } from '$lib/services/phone-analytics';

export function numbersAnalyticsFixture(): NumbersAnalytics {
	return {
		overall: {
			total: 3,
			received: 2,
			refunded: 1,
			inFlight: 0,
			successRatePct: 67,
			revenueNgn: 11000,
			costNgn: 2500,
			marginNgn: 8500
		},
		byService: [
			{
				serviceName: 'WhatsApp',
				countryName: 'Brazil',
				total: 3,
				received: 2,
				refunded: 1,
				inFlight: 0,
				successRatePct: 67,
				avgTimeToOtpSec: 30,
				revenueNgn: 11000,
				costNgn: 2500,
				marginNgn: 8500,
				needsAttention: false
			}
		],
		demand30d: [],
		recent: [
			{
				createdAt: '2026-10-12T11:00:00Z',
				serviceName: 'WhatsApp',
				countryName: 'Brazil',
				phoneNumber: null,
				status: 'received',
				provider: 'hubman',
				saleNgn: 5500,
				costUsd: 0.75,
				buyer: null,
				buyerUserId: null
			}
		]
	};
}
