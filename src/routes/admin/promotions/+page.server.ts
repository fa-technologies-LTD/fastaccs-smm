import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getFeatureFlagSnapshot } from '$lib/services/feature-flags';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const flags = await getFeatureFlagSnapshot();
	if (!flags.adminPromotions) {
		throw error(404, 'Not found');
	}

	if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:access')) {
		throw error(403, 'Unauthorized');
	}

	const [promotionsRaw, platforms] = await Promise.all([
		prisma.promotionCode.findMany({
			orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
		}),
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
			orderBy: { sortOrder: 'asc' }
		})
	]);

	return {
		promotions: promotionsRaw.map((item: (typeof promotionsRaw)[number]) => ({
			...item,
			value: Number(item.value),
			minOrderValue: Number(item.minOrderValue)
		})),
		platforms,
		canManagePromotions: hasAdminPermission(locals.adminContext, 'admin:promotions:manage')
	};
};
