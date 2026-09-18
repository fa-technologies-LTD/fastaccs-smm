import { error } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	BOOSTING_ACTION_LABELS,
	BOOSTING_PLATFORM_LABELS,
	getBoostingServiceConfig
} from '$lib/helpers/boosting-service-config';
import { prisma } from '$lib/prisma';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		throw error(403, 'Catalogue permission is required.');
	}
	const categories = await prisma.category.findMany({
		where: { categoryType: 'boosting_service' },
		select: { id: true, name: true, metadata: true, isActive: true },
		orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
	});
	return {
		offers: categories.map((category) => {
			const config = getBoostingServiceConfig(category.metadata);
			return {
				id: category.id,
				name: category.name,
				isActive: category.isActive,
				platform: config.platform,
				platformLabel: BOOSTING_PLATFORM_LABELS[config.platform],
				outcome: config.actionType,
				outcomeLabel: BOOSTING_ACTION_LABELS[config.actionType],
				pricePerStepNgn: config.pricePerStep
			};
		})
	};
};
