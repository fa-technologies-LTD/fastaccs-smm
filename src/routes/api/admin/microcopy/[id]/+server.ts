import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// PATCH update microcopy
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const { id } = params;
		const { value, description, category } = await request.json();

		const microcopy = await prisma.microcopy.update({
			where: { id },
			data: {
				value,
				description,
				category,
				updatedAt: new Date()
			}
		});

		return json({ microcopy });
	} catch (error) {
		console.error('Error updating microcopy:', error);
		return json({ error: 'Failed to update microcopy' }, { status: 500 });
	}
};

// DELETE microcopy
export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const { id } = params;

		await prisma.microcopy.delete({
			where: { id }
		});

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting microcopy:', error);
		return json({ error: 'Failed to delete microcopy' }, { status: 500 });
	}
};
