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

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		throw error(403, 'You do not have permission to view this.');
	}

	const [analytics, pricing, hubBalanceCents, pvapinsBalanceCents, probeSummary] =
		await Promise.all([
			getNumbersAnalytics(),
			getPhonePricingConfig(),
			isHubmanConfigured() ? getBalanceCents().catch(() => null) : Promise.resolve(null),
			isPvapinsConfigured() ? getPvapinsBalanceCents().catch(() => null) : Promise.resolve(null),
			getPhoneCatalogProbeSummary().catch(() => null)
		]);

	return {
		analytics,
		hubBalanceCents,
		pvapinsBalanceCents,
		probeSummary,
		lowBalanceThresholdCents: pricing.lowBalanceThresholdCents
	};
};
