import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	// Verify admin authentication
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;

	if (!id) {
		return json({ success: false, error: 'Affiliate ID is required' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const { commissionRate } = body;

		// Validate commission rate
		if (typeof commissionRate !== 'number') {
			return json({ success: false, error: 'Commission rate must be a number' }, { status: 400 });
		}

		if (commissionRate < 0 || commissionRate > 100) {
			return json(
				{ success: false, error: 'Commission rate must be between 0 and 100' },
				{ status: 400 }
			);
		}

		// Find the affiliate program for this user
		const affiliateProgram = await prisma.affiliateProgram.findFirst({
			where: { userId: id }
		});

		if (!affiliateProgram) {
			return json(
				{ success: false, error: 'Affiliate program not found for this user' },
				{ status: 404 }
			);
		}

		// Update commission rate
		const updated = await prisma.affiliateProgram.update({
			where: { id: affiliateProgram.id },
			data: { commissionRate }
		});

		return json({
			success: true,
			program: {
				id: updated.id,
				commissionRate: Number(updated.commissionRate)
			}
		});
	} catch (error) {
		console.error('Error updating commission rate:', error);
		return json({ success: false, error: 'Failed to update commission rate' }, { status: 500 });
	}
};
