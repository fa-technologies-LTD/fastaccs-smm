import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const { id } = params;
		const { isActive } = await request.json();

		const microcopy = await prisma.microcopy.update({
			where: { id },
			data: {
				isActive,
				updatedAt: new Date()
			}
		});

		return json({ microcopy });
	} catch (error) {
		console.error('Error toggling microcopy status:', error);
		return json({ error: 'Failed to toggle status' }, { status: 500 });
	}
};
