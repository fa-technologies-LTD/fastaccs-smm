import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { createPromotion, listPromotions } from '$lib/services/promotions';
import { getFeatureFlagSnapshot } from '$lib/services/feature-flags';

async function promotionsEnabled(): Promise<boolean> {
	const flags = await getFeatureFlagSnapshot().catch(() => ({
		adminPromotions: false,
		adminAnnouncementBanner: false,
		adminAdvancedAnalytics: true,
		adminRoleManagement: true,
		adminStoreControls: true
	}));
	return Boolean(flags.adminPromotions);
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!(await promotionsEnabled())) {
		return json({ success: false, error: 'Promotions module is disabled.' }, { status: 404 });
	}

	if (
		!locals.user ||
		!locals.adminContext ||
		!hasAdminPermission(locals.adminContext, 'admin:access')
	) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const rows = await listPromotions();
	return json({
		success: true,
		data: rows.map((row) => ({
			...row,
			value: Number(row.value),
			minOrderValue: Number(row.minOrderValue)
		}))
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!(await promotionsEnabled())) {
		return json({ success: false, error: 'Promotions module is disabled.' }, { status: 404 });
	}

	if (
		!locals.user ||
		!locals.adminContext ||
		!hasAdminPermission(locals.adminContext, 'admin:promotions:manage')
	) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const payload = await request.json();
		const created = await createPromotion({
			code: String(payload.code || ''),
			type: payload.type === 'FIXED' ? 'FIXED' : 'PERCENT',
			value: Number(payload.value || 0),
			currency: String(payload.currency || 'NGN'),
			minOrderValue: Number(payload.minOrderValue || 0),
			usageCap:
				payload.usageCap === null || payload.usageCap === undefined || payload.usageCap === ''
					? null
					: Number(payload.usageCap),
			singleUsePerUser: Boolean(payload.singleUsePerUser),
			platformIds: Array.isArray(payload.platformIds)
				? payload.platformIds.filter((value: unknown): value is string => typeof value === 'string')
				: [],
			startsAt: payload.startsAt ? String(payload.startsAt) : null,
			endsAt: payload.endsAt ? String(payload.endsAt) : null,
			isActive: payload.isActive !== false,
			createdBy: locals.user.id
		});

		return json({
			success: true,
			data: {
				...created,
				value: Number(created.value),
				minOrderValue: Number(created.minOrderValue)
			}
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to create promotion'
			},
			{ status: 400 }
		);
	}
};
