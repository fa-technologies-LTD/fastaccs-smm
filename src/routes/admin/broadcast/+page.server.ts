import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { getBroadcastAudienceCount, getBroadcastHistory } from '$lib/services/admin-broadcast';
import { getNumbersCampaignState } from '$lib/services/numbers-campaign';
import { hasAdminPermission } from '$lib/auth/admin-roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return {
			platforms: [],
			tiers: [],
			history: [],
			initialAudienceCount: 0
		};
	}

	const [platforms, tiers, history, initialAudienceCount] = await Promise.all([
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
		prisma.category.findMany({
			where: {
				categoryType: 'tier',
				isActive: true,
				parentId: { not: null },
				parent: {
					is: {
						isActive: true,
						categoryType: 'platform'
					}
				}
			},
			select: {
				id: true,
				name: true,
				slug: true,
				parentId: true,
				parent: {
					select: {
						name: true
					}
				}
			},
			orderBy: [{ parent: { name: 'asc' } }, { name: 'asc' }]
		}),
		getBroadcastHistory(30),
		getBroadcastAudienceCount('all_verified', [], [])
	]);

	// Numbers customer emails sit here with the other emails; changing them needs settings rights.
	const canManageNumbersEmails = hasAdminPermission(locals.adminContext, 'admin:settings:manage');
	const numbersCampaign = canManageNumbersEmails
		? await getNumbersCampaignState().catch(() => null)
		: null;

	return {
		platforms,
		tiers,
		history,
		initialAudienceCount,
		canManageNumbersEmails,
		numbersCampaign
	};
};
