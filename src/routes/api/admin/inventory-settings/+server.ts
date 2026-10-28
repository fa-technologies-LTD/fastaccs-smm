import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { saveLowStockThresholdSetting } from '$lib/services/admin-settings';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';

// POST /api/admin/inventory-settings  { lowStockThreshold }
// The low-stock level, set from Inventory where stock is managed.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:inventory:manage'))
		return json({ error: 'Unauthorized' }, { status: 401 });
	const body = (await request.json().catch(() => ({}))) as { lowStockThreshold?: unknown };
	const value = Number(body.lowStockThreshold);
	if (!Number.isInteger(value) || value < 1 || value > 999)
		return json({ error: 'Enter a whole number from 1 to 999.' }, { status: 400 });
	const lowStockThreshold = await saveLowStockThresholdSetting(value);
	invalidateAdminStatsCache();
	return json({ success: true, lowStockThreshold });
};
