import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AdminRole } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getFeatureFlagSnapshot } from '$lib/services/feature-flags';

function parseRole(value: unknown): AdminRole | null {
	if (
		value === 'FULL_ADMIN' ||
		value === 'ORDER_MANAGER' ||
		value === 'READ_ONLY' ||
		value === 'ASSISTANT'
	) {
		return value;
	}
	return null;
}

// POST /api/admin/roles — add an admin by email. Looks up the account, promotes
// it to ADMIN, and assigns the role (defaults to ASSISTANT). FULL_ADMIN only.
export const POST: RequestHandler = async ({ locals, request }) => {
	const flags = await getFeatureFlagSnapshot().catch(() => ({ adminRoleManagement: true }));
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
			{ success: false, error: 'Only FULL_ADMIN can add admins.' },
			{ status: 403 }
		);
	}

	const payload = await request.json().catch(() => ({}));
	const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
	const role = parseRole(payload?.role) ?? 'ASSISTANT';
	if (!email) {
		return json({ success: false, error: 'Email is required.' }, { status: 400 });
	}

	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, email: true, fullName: true }
	});
	if (!user) {
		return json(
			{ success: false, error: 'No account found with that email. Ask them to sign up first.' },
			{ status: 404 }
		);
	}

	// Promote to ADMIN and assign the role atomically. The permission system reads
	// role + userType fresh per request, so it takes effect on their next request.
	await prisma.$transaction([
		prisma.user.update({ where: { id: user.id }, data: { userType: 'ADMIN' } }),
		prisma.adminRoleAssignment.upsert({
			where: { userId: user.id },
			update: { role },
			create: { userId: user.id, role, createdBy: locals.user.id }
		})
	]);

	return json({
		success: true,
		data: { id: user.id, email: user.email, fullName: user.fullName, role }
	});
};
