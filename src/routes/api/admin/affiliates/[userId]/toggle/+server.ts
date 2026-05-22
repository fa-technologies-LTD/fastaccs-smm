import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { enableAffiliateMode } from '$lib/services/affiliate';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	// Verify admin authentication
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { userId } = params;

	if (!userId) {
		return json({ success: false, error: 'User ID is required' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const { isAffiliateEnabled } = body;

		if (typeof isAffiliateEnabled !== 'boolean') {
			return json(
				{ success: false, error: 'isAffiliateEnabled must be a boolean' },
				{ status: 400 }
			);
		}

		if (isAffiliateEnabled) {
			const enabled = await enableAffiliateMode(userId, { force: true });
			if (!enabled.success) {
				return json(
					{ success: false, error: enabled.error || 'Failed to enable affiliate user.' },
					{ status: 400 }
				);
			}
		} else {
			await prisma.$transaction(async (tx) => {
				await tx.affiliateProgram.updateMany({
					where: { userId },
					data: { status: 'inactive' }
				});

				await tx.user.update({
					where: { id: userId },
					data: { isAffiliateEnabled: false }
				});
			});
		}

		const updatedUser = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				email: true,
				fullName: true,
				isAffiliateEnabled: true
			}
		});

		if (!updatedUser) {
			return json({ success: false, error: 'User not found after update.' }, { status: 404 });
		}

		return json({
			success: true,
			user: updatedUser
		});
	} catch (error) {
		console.error('Error toggling affiliate status:', error);
		return json({ success: false, error: 'Failed to update affiliate status' }, { status: 500 });
	}
};
