import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getNumbersAnalytics } from '$lib/services/phone-analytics';
import { getBalanceCents, isHubmanConfigured } from '$lib/services/hubman';
import {
	getBalanceCents as getPvapinsBalanceCents,
	isPvapinsConfigured
} from '$lib/services/pvapins';
import { getPhonePricingConfig } from '$lib/services/phone-pricing';
import { getPhoneCatalogProbeSummary } from '$lib/services/phone-catalog-probe';
import { canViewRevenue, canViewOrderAmounts } from '$lib/services/admin-revenue-visibility';
import { numbersAnalyticsForAdmin } from '$lib/helpers/numbers-analytics-visibility';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		throw error(403, 'You do not have permission to view this.');
	}
	setHeaders({ 'cache-control': 'private, no-store' });
	const revenueVisible = canViewRevenue(locals);
	const orderAmountsVisible = canViewOrderAmounts(locals);

	const [analytics, pricing, hubBalanceCents, pvapinsBalanceCents, probeSummary] =
		await Promise.all([
			getNumbersAnalytics(),
			getPhonePricingConfig(),
			revenueVisible && isHubmanConfigured()
				? getBalanceCents().catch(() => null)
				: Promise.resolve(null),
			revenueVisible && isPvapinsConfigured()
				? getPvapinsBalanceCents().catch(() => null)
				: Promise.resolve(null),
			getPhoneCatalogProbeSummary().catch(() => null)
		]);

	return {
		analytics: numbersAnalyticsForAdmin(analytics, revenueVisible, orderAmountsVisible),
		canViewRevenue: revenueVisible,
		canViewOrderAmounts: orderAmountsVisible,
		hubBalanceCents,
		pvapinsBalanceCents,
		probeSummary,
		lowBalanceThresholdCents: pricing.lowBalanceThresholdCents
	};
};
