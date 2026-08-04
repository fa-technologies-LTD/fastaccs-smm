import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getNumbersCatalogForAdmin, seedNumbersCatalog } from '$lib/services/phone-catalog';
import { getPhonePricingConfig } from '$lib/services/phone-pricing';
import { getBalanceCents, isHubmanConfigured } from '$lib/services/hubman';
import { getBalanceCents as getPvapinsBalanceCents, isPvapinsConfigured } from '$lib/services/pvapins';
import { getNumbersCampaignState } from '$lib/services/numbers-campaign';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		throw error(403, 'You do not have permission to manage the catalog.');
	}

	// Seed the curated tiers on first visit so the table is never empty.
	let catalog = await getNumbersCatalogForAdmin();
	if (catalog.rows.length === 0 && isHubmanConfigured()) {
		await seedNumbersCatalog().catch((e) => console.error('[admin.numbers] initial seed failed:', e));
		catalog = await getNumbersCatalogForAdmin();
	}

	const pricing = await getPhonePricingConfig();
	const [hubBalanceCents, pvapinsBalanceCents] = await Promise.all([
		isHubmanConfigured() ? getBalanceCents().catch(() => null) : null,
		isPvapinsConfigured() ? getPvapinsBalanceCents().catch(() => null) : null
	]);
	const campaign = await getNumbersCampaignState();
	const canManageCampaign = hasAdminPermission(locals.adminContext, 'admin:settings:manage');

	return {
		rows: catalog.rows,
		usdNgnRate: catalog.usdNgnRate,
		marginPercent: catalog.marginPercent,
		minProfitNgn: pricing.minProfitNgn,
		lowBalanceThresholdCents: pricing.lowBalanceThresholdCents,
		hubBalanceCents,
		pvapinsBalanceCents,
		hubmanConfigured: isHubmanConfigured(),
		campaign,
		canManageCampaign
	};
};
