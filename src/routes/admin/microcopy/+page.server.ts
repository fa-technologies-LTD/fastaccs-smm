import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return { microcopy: [] };
		}

		const microcopy = await prisma.microcopy.findMany({
			orderBy: [{ category: 'asc' }, { key: 'asc' }]
		});

		return { microcopy };
	} catch (error) {
		console.error('Error loading microcopy:', error);
		return { microcopy: [] };
	}
};
