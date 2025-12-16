import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

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

		// Update user's affiliate enabled status
		const updatedUser = await prisma.user.update({
			where: { id: userId },
			data: { isAffiliateEnabled },
			select: {
				id: true,
				email: true,
				fullName: true,
				isAffiliateEnabled: true
			}
		});

		return json({
			success: true,
			user: updatedUser
		});
	} catch (error) {
		console.error('Error toggling affiliate status:', error);
		return json(
			{ success: false, error: 'Failed to update affiliate status' },
			{ status: 500 }
		);
	}
};
