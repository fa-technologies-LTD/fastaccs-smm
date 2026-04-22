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

	if (!nextIsActive) {
		await invalidateUserSessions(targetUserId);
	}

	return json({ success: true, data: updated });
};
