import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AdminRole } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getFeatureFlagSnapshot } from '$lib/services/feature-flags';

function parseRole(value: unknown): AdminRole | null {
	if (value === 'FULL_ADMIN' || value === 'ORDER_MANAGER' || value === 'READ_ONLY') {
		return value;
	}
	return null;
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const flags = await getFeatureFlagSnapshot().catch(() => ({
		adminPromotions: true,
		adminAnnouncementBanner: false,
		adminAdvancedAnalytics: true,
		adminRoleManagement: true,
		adminStoreControls: true
	}));
	if (!flags.adminRoleManagement) {
		return json(
			{ success: false, error: 'Admin role management is currently disabled.' },
			{ status: 403 }
		);
	}

	if (
		!locals.user ||
		!locals.adminContext ||
		!hasAdminPermission(locals.adminContext, 'admin:users:manage')
	) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.adminContext.role !== 'FULL_ADMIN') {
		return json(
			{ success: false, error: 'Only FULL_ADMIN can change admin roles.' },
			{ status: 403 }
		);
	}

	const payload = await request.json().catch(() => ({}));
	const role = parseRole(payload?.role);
	if (!role) {
		return json({ success: false, error: 'Invalid admin role.' }, { status: 400 });
	}

	const targetUserId = params.userId;
	if (!targetUserId) {
		return json({ success: false, error: 'User is required.' }, { status: 400 });
	}

	const targetUser = await prisma.user.findUnique({
		where: { id: targetUserId },
		select: {
			id: true,
			userType: true
		}
	});

	if (!targetUser || targetUser.userType !== 'ADMIN') {
		return json({ success: false, error: 'Target user is not an admin.' }, { status: 404 });
	}

	const assignment = await prisma.adminRoleAssignment.upsert({
		where: { userId: targetUserId },
		update: {
			role
		},
		create: {
			userId: targetUserId,
			role,
			createdBy: locals.user.id
		},
		select: {
			userId: true,
			role: true
		}
	});

	return json({
		success: true,
		data: assignment
	});
};
