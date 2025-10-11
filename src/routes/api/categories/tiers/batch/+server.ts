import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { ids } = await request.json();

		if (!Array.isArray(ids) || ids.length === 0) {
			return json({ error: 'Invalid tier IDs' }, { status: 400 });
		}

		const tiers = await prisma.category.findMany({
			where: {
				id: { in: ids },
				categoryType: 'tier',
				isActive: true
			},
			include: {
				parent: {
					select: {
						id: true,
						name: true,
						slug: true
					}
				}
			}
		});

		return json({
			success: true,
			data: tiers
		});
	} catch (error) {
		console.error('Error fetching tiers:', error);
		return json({ error: 'Failed to fetch tiers' }, { status: 500 });
	}
};
