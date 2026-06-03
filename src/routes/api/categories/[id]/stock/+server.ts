import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { releaseExpiredExactPreviewReservations } from '$lib/services/exact-preview';

// GET /api/categories/[id]/stock - Get available account count for a tier
export async function GET({ params }) {
	try {
		const categoryId = params.id;
		await releaseExpiredExactPreviewReservations(prisma, categoryId);

		const availableCount = await prisma.account.count({
			where: {
				categoryId: categoryId,
				status: 'available'
			}
		});

		return json({
			available: availableCount,
			categoryId: categoryId,
			error: null
		});
	} catch (error) {
		console.error('Failed to fetch stock:', error);
		return json({ available: 0, error: 'Failed to fetch stock' }, { status: 500 });
	}
}
