import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { updatePromotion } from '$lib/services/promotions';
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

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
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
		const updated = await updatePromotion(params.id, {
			type: payload.type === 'FIXED' ? 'FIXED' : payload.type === 'PERCENT' ? 'PERCENT' : undefined,
			value: payload.value === undefined ? undefined : Number(payload.value),
			currency: payload.currency === undefined ? undefined : String(payload.currency),
			minOrderValue:
				payload.minOrderValue === undefined ? undefined : Number(payload.minOrderValue),
			usageCap:
				payload.usageCap === undefined
					? undefined
					: payload.usageCap === null || payload.usageCap === ''
						? null
						: Number(payload.usageCap),
			singleUsePerUser:
				payload.singleUsePerUser === undefined ? undefined : Boolean(payload.singleUsePerUser),
			platformIds: Array.isArray(payload.platformIds)
				? payload.platformIds.filter((value: unknown): value is string => typeof value === 'string')
				: undefined,
			startsAt:
				payload.startsAt === undefined
					? undefined
					: payload.startsAt
						? String(payload.startsAt)
						: null,
			endsAt:
				payload.endsAt === undefined ? undefined : payload.endsAt ? String(payload.endsAt) : null,
			isActive: payload.isActive === undefined ? undefined : Boolean(payload.isActive)
		});

		return json({
			success: true,
			data: {
				...updated,
				value: Number(updated.value),
				minOrderValue: Number(updated.minOrderValue)
			}
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to update promotion'
			},
			{ status: 400 }
		);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
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
		await prisma.promotionCode.delete({
			where: { id: params.id }
		});
		return json({ success: true });
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to delete promotion'
			},
			{ status: 400 }
		);
	}
};
