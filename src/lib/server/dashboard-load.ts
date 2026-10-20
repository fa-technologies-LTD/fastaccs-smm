import { getBusinessSettingsSnapshot } from '$lib/services/admin-settings';
import { getStoreCreditBuckets } from '$lib/services/store-credit';
import { getDashboardMetrics } from '$lib/server/dashboard-metrics';
import { getDashboardOrdersPage } from '$lib/server/dashboard-orders';
import { getCustomerRewards } from '$lib/server/customer-rewards';

export async function getDashboardInitialData(userId: string) {
	const [ordersPage, metrics, business, storeCredit, rewards] = await Promise.all([
		getDashboardOrdersPage({ userId }),
		getDashboardMetrics(userId),
		getBusinessSettingsSnapshot().catch(() => null),
		getStoreCreditBuckets(userId).catch(() => ({
			earnedAvailable: 0,
			refundAvailable: 0,
			promoAvailable: 0,
			promo: [],
			totalAvailable: 0
		})),
		getCustomerRewards(userId).catch(() => null)
	]);

	return {
		orders: ordersPage.orders,
		ordersNextCursor: ordersPage.nextCursor,
		metrics,
		affiliateData: null,
		affiliateLoaded: false,
		storeCredit,
		rewards,
		purchases: [],
		purchasesNextCursor: null,
		purchasesLoaded: false,
		support: {
			whatsappNumber: business?.whatsappNumber || ''
		}
	};
}
