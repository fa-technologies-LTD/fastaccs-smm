import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { getBroadcastAudienceCount, getBroadcastHistory } from '$lib/services/admin-broadcast';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return {
			platforms: [],
			history: [],
			initialAudienceCount: 0
		};
	}

	const [platforms, history, initialAudienceCount] = await Promise.all([
		prisma.category.findMany({
			where: {
				categoryType: 'platform',
				isActive: true
			},
			select: {
				id: true,
				name: true,
				slug: true
			},
			orderBy: { name: 'asc' }
		}),
		getBroadcastHistory(30),
		getBroadcastAudienceCount('all_verified', [])
	]);

	return {
		platforms,
		history,
		initialAudienceCount
	};
};
