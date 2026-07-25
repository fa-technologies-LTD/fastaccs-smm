import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getNumbersAnalytics } from '$lib/services/phone-analytics';
import { getBalanceCents, isHubmanConfigured } from '$lib/services/hubman';
import { getPhonePricingConfig } from '$lib/services/phone-pricing';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		throw error(403, 'You do not have permission to view this.');
	}

	const analytics = await getNumbersAnalytics();
	const pricing = await getPhonePricingConfig();
	const hubBalanceCents = isHubmanConfigured() ? await getBalanceCents().catch(() => null) : null;

	return {
		analytics,
		hubBalanceCents,
		lowBalanceThresholdCents: pricing.lowBalanceThresholdCents
	};
};
