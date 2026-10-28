import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { applyTierSettingsPatch, parseTierSettingsPatch } from '$lib/helpers/tier-settings-patch';
import { isManualHandoverTier } from '$lib/helpers/tier-delivery-config';

// PATCH /api/admin/account-types/[id]  { manualAvailable?, basePrice?, unitCostNgn? }
// Changes one account-type setting from the page that owns it: availability from Inventory,
// price and cost from Pricing. Each setting checks its own permission.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const context = locals.adminContext;
	if (!locals.user || !context || !hasAdminPermission(context, 'admin:inventory:manage'))
		return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = parseTierSettingsPatch(await request.json().catch(() => null));
	if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });
	const { patch } = parsed;
	if (patch.basePrice !== undefined && !hasAdminPermission(context, 'admin:catalog:manage'))
		return json({ error: 'Only catalogue managers can change prices.' }, { status: 403 });
	const canEditCost = Boolean(context.canViewRevenue);
	if (patch.unitCostNgn !== undefined && !canEditCost)
		return json({ error: 'Only admins who can see costs can change them.' }, { status: 403 });

	const category = await prisma.category.findUnique({
		where: { id: String(params.id) },
		select: { id: true, categoryType: true, metadata: true }
	});
	if (!category || category.categoryType !== 'tier')
		return json({ error: 'Account type not found' }, { status: 404 });

	if (patch.manualAvailable !== undefined && !isManualHandoverTier(category.metadata))
		return json(
			{ error: 'Only WhatsApp handover account types have an availability switch.' },
			{ status: 400 }
		);

	const metadata = applyTierSettingsPatch(category.metadata, patch, { canEditCost });
	const updated = await prisma.category.update({
		where: { id: category.id },
		data: { metadata: JSON.parse(JSON.stringify(metadata)) },
		select: { id: true, metadata: true }
	});
	invalidateAdminStatsCache();
	return json({ success: true, data: updated });
};
