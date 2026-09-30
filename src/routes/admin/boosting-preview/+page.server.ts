import { error } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	BOOSTING_ACTION_LABELS,
	BOOSTING_PLATFORM_LABELS
} from '$lib/helpers/boosting-service-config';
import { prisma } from '$lib/prisma';
import type { PageServerLoad } from './$types';

const PLATFORM_ORDER = ['instagram', 'tiktok', 'youtube', 'facebook', 'x', 'spotify', 'telegram'];
const OUTCOME_ORDER = [
	'followers',
	'subscribers',
	'members',
	'likes',
	'views',
	'comments',
	'streams',
	'monthly_listeners',
	'reposts',
	'reactions',
	'shares',
	'saves',
	'watch_time'
];
const TIER_ORDER: Record<string, number> = { value: 0, stable: 1, premium: 2 };

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		throw error(403, 'Catalogue permission is required.');
	}

	const rows = await prisma.boostCustomerOffer.findMany({
		where: {
			status: { in: ['reviewed', 'live'] },
			category: { categoryType: 'boosting_service' }
		},
		select: {
			id: true,
			categoryId: true,
			platform: true,
			outcome: true,
			qualityTier: true,
			customerName: true,
			shortPromise: true,
			expectationChips: true,
			minQuantity: true,
			stepQuantity: true,
			quantityPresets: true,
			pricePerStepNgn: true,
			refillDays: true,
			status: true,
			displayOrder: true,
			category: { select: { name: true, isActive: true } }
		},
		orderBy: [{ displayOrder: 'asc' }, { customerName: 'asc' }]
	});

	const groups = new Map<
		string,
		{
			categoryId: string;
			categoryName: string;
			platform: string;
			platformLabel: string;
			outcome: string;
			outcomeLabel: string;
			categoryActive: boolean;
			offers: Array<{
				id: string;
				qualityTier: string;
				customerName: string;
				shortPromise: string;
				expectationChips: string[];
				minQuantity: number;
				stepQuantity: number;
				quantityPresets: number[];
				pricePerStepNgn: number;
				refillDays: number | null;
				status: string;
			}>;
		}
	>();

	for (const row of rows) {
		const group = groups.get(row.categoryId) ?? {
			categoryId: row.categoryId,
			categoryName: row.category.name,
			platform: row.platform,
			platformLabel:
				BOOSTING_PLATFORM_LABELS[row.platform as keyof typeof BOOSTING_PLATFORM_LABELS] ?? row.platform,
			outcome: row.outcome,
			outcomeLabel:
				BOOSTING_ACTION_LABELS[row.outcome as keyof typeof BOOSTING_ACTION_LABELS] ?? row.outcome,
			categoryActive: row.category.isActive,
			offers: []
		};
		group.offers.push({
			id: row.id,
			qualityTier: row.qualityTier,
			customerName: row.customerName,
			shortPromise: row.shortPromise,
			expectationChips: row.expectationChips,
			minQuantity: row.minQuantity,
			stepQuantity: row.stepQuantity,
			quantityPresets: row.quantityPresets,
			pricePerStepNgn: Number(row.pricePerStepNgn),
			refillDays: row.refillDays,
			status: row.status
		});
		groups.set(row.categoryId, group);
	}

	return {
		groups: [...groups.values()]
			.map((group) => ({
				...group,
				offers: group.offers.sort(
					(left, right) =>
						(TIER_ORDER[left.qualityTier] ?? 99) - (TIER_ORDER[right.qualityTier] ?? 99)
				)
			}))
			.sort(
				(left, right) =>
					PLATFORM_ORDER.indexOf(left.platform) - PLATFORM_ORDER.indexOf(right.platform) ||
					OUTCOME_ORDER.indexOf(left.outcome) - OUTCOME_ORDER.indexOf(right.outcome) ||
					left.categoryName.localeCompare(right.categoryName)
			)
	};
};
