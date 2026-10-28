import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { canViewRevenue } from '$lib/services/admin-revenue-visibility';
import { parseTierUnitCost } from '$lib/helpers/tier-unit-cost';
import { normalizeTierDeliveryMode } from '$lib/helpers/tier-delivery-config';

export interface AccountPriceRow {
	id: string;
	name: string;
	platform: string;
	priceNgn: number;
	/** Null when not entered, or hidden from roles that cannot see costs. */
	costNgn: number | null;
	delivery: 'instant' | 'whatsapp';
	affiliateExcluded: boolean;
}

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage'))
		redirect(303, '/admin');
	setHeaders({ 'cache-control': 'private, no-store' });
	const showCosts = canViewRevenue(locals);
	const tiers = await prisma.category.findMany({
		where: { categoryType: 'tier', isActive: true, parentId: { not: null } },
		select: {
			id: true,
			name: true,
			metadata: true,
			parent: { select: { name: true, sortOrder: true } }
		},
		orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
	});
	const rows: AccountPriceRow[] = tiers
		.map((tier) => {
			const metadata = (tier.metadata ?? {}) as Record<string, unknown>;
			const pricing = (metadata.pricing ?? {}) as Record<string, unknown>;
			const mode = normalizeTierDeliveryMode(metadata.delivery_mode);
			return {
				mode,
				platformOrder: tier.parent?.sortOrder ?? 0,
				row: {
					id: tier.id,
					name: tier.name.trim(),
					platform: tier.parent?.name ?? 'Other',
					priceNgn: Number(pricing.base_price ?? metadata.price ?? 0) || 0,
					costNgn: showCosts ? parseTierUnitCost(metadata) : null,
					delivery: mode === 'manual_handover' ? ('whatsapp' as const) : ('instant' as const),
					affiliateExcluded: metadata.affiliate_excluded === true
				}
			};
		})
		// Numbers rows are priced automatically in Numbers Prices.
		.filter((entry) => entry.mode !== 'auto_sms')
		.sort(
			(a, b) => a.platformOrder - b.platformOrder || a.row.platform.localeCompare(b.row.platform)
		)
		.map((entry) => entry.row);
	return { rows, showCosts };
};
