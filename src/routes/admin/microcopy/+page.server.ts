import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { isHiddenFromMicrocopy } from '$lib/helpers/promo-campaign-rules';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return { microcopy: [] };
		}

		const microcopy = await prisma.microcopy.findMany({
			orderBy: [{ category: 'asc' }, { key: 'asc' }]
		});

		// Business rules (config.*) live in Settings › Business Rules; this page is wording only.
		return {
			microcopy: microcopy.filter(
				(row) => !isHiddenFromMicrocopy(row.key) && !row.key.startsWith('config.')
			)
		};
	} catch (error) {
		console.error('Error loading microcopy:', error);
		return { microcopy: [] };
	}
};
