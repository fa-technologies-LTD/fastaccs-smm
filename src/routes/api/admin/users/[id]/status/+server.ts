import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { invalidateUserSessions } from '$lib/auth/session';

interface StatusPayload {
	isActive?: unknown;
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = (await request.json().catch(() => ({}))) as StatusPayload;
	const nextIsActive = payload.isActive;

	if (typeof nextIsActive !== 'boolean') {
		return json({ success: false, error: 'isActive must be a boolean' }, { status: 400 });
	}

	const targetUserId = params.id;
	if (!targetUserId) {
		return json({ success: false, error: 'User ID is required' }, { status: 400 });
	}

	if (targetUserId === locals.user.id && nextIsActive === false) {
		return json(
			{ success: false, error: 'You cannot suspend your own admin account.' },
			{ status: 400 }
		);
	}

	const existingUser = await prisma.user.findUnique({
		where: { id: targetUserId },
		select: {
			id: true,
			email: true,
			isActive: true,
			fullName: true
		}
	});

	if (!existingUser) {
		return json({ success: false, error: 'User not found' }, { status: 404 });
	}

	if (existingUser.isActive === nextIsActive) {
		return json({
			success: true,
			data: {
				id: existingUser.id,
				email: existingUser.email,
				fullName: existingUser.fullName,
				isActive: existingUser.isActive
			}
		});
	}

	const updated = await prisma.user.update({
		where: { id: targetUserId },
		data: { isActive: nextIsActive },
		select: {
			id: true,
			email: true,
			fullName: true,
			isActive: true
		}
	});

	try {
		const actionLabel = nextIsActive ? 'unblocked' : 'suspended';
		const adminActor =
			locals.user.fullName || locals.user.email || `admin:${locals.user.id.slice(0, 8)}`;
		const targetLabel =
			existingUser.email || existingUser.fullName || `user:${targetUserId.slice(0, 8)}`;

		await prisma.emailNotification.create({
			data: {
				userId: targetUserId,
				email: existingUser.email || `${targetUserId.slice(0, 8)}@users.fastaccs.local`,
				notificationType: 'admin_user_status',
				referenceId: targetUserId,
				subject: `User access ${actionLabel}`,
				body: `${adminActor} ${actionLabel} ${targetLabel}.`,
				status: 'sent',
				sentAt: new Date()
			}
		});
	} catch (auditError) {
		console.warn('Failed to persist admin user status audit log:', auditError);
	}

	if (!nextIsActive) {
		await invalidateUserSessions(targetUserId);
	}

	return json({ success: true, data: updated });
};
