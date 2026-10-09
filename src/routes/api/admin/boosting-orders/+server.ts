import { json } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { canViewRevenue } from '$lib/services/admin-revenue-visibility';
import {
	BOOST_ITEM_STATUSES,
	BOOST_ACTIVE_ITEM_STATUSES,
	BOOST_OPEN_COMPLAINT_STATUSES
} from '$lib/helpers/boosting-admin-status';

const ISSUE_EVENT_TYPES = ['boosting_link_review_requested', 'boosting_rejected'] as const;
const CONFIRMED_PAYMENT_STATUSES = ['paid', 'success', 'overpaid'] as const;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

function positiveInteger(
	value: string | null,
	fallback: number,
	maximum = Number.MAX_SAFE_INTEGER
): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.min(Math.floor(parsed), maximum);
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (
		!locals.user ||
		!locals.adminContext ||
		!hasAdminPermission(locals.adminContext, 'admin:access')
	) {
		return json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
	}

	const statusFilter = String(url.searchParams.get('status') || 'active').toLowerCase();
	if (!['active', 'all', ...BOOST_ITEM_STATUSES].includes(statusFilter)) {
		return json({ success: false, error: 'Choose a valid status.' }, { status: 400 });
	}
	const sort = url.searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest';
	const search = String(url.searchParams.get('q') || '')
		.trim()
		.slice(0, 100);
	const page = positiveInteger(url.searchParams.get('page'), 1);
	const pageSize = positiveInteger(
		url.searchParams.get('pageSize'),
		DEFAULT_PAGE_SIZE,
		MAX_PAGE_SIZE
	);

	const conditions: Prisma.OrderItemWhereInput[] = [
		{ boostTargetUrl: { not: null } },
		{ order: { paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] } } }
	];

	const activeCondition: Prisma.OrderItemWhereInput = {
		OR: [
			{ boostFulfillmentStatus: null },
			{ boostFulfillmentStatus: { in: [...BOOST_ACTIVE_ITEM_STATUSES] } },
			{
				boostFulfillment: {
					is: { complaints: { some: { status: { in: [...BOOST_OPEN_COMPLAINT_STATUSES] } } } }
				}
			}
		]
	};
	if (statusFilter === 'active') {
		conditions.push(activeCondition);
	} else if (BOOST_ITEM_STATUSES.includes(statusFilter as (typeof BOOST_ITEM_STATUSES)[number])) {
		conditions.push({ boostFulfillmentStatus: statusFilter });
	}

	if (search) {
		conditions.push({
			OR: [
				{ productName: { contains: search, mode: 'insensitive' } },
				{ boostTargetUrl: { contains: search, mode: 'insensitive' } },
				{ boostProviderReference: { contains: search, mode: 'insensitive' } },
				{
					order: {
						is: {
							OR: [
								{ orderNumber: { contains: search, mode: 'insensitive' } },
								{ guestEmail: { contains: search, mode: 'insensitive' } },
								{ user: { is: { email: { contains: search, mode: 'insensitive' } } } },
								{ user: { is: { fullName: { contains: search, mode: 'insensitive' } } } }
							]
						}
					}
				}
			]
		});
	}

	const where: Prisma.OrderItemWhereInput = { AND: conditions };
	const baseWhere: Prisma.OrderItemWhereInput = {
		boostTargetUrl: { not: null },
		order: { paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] } }
	};

	const [total, items, statusGroups, activeCount] = await Promise.all([
		prisma.orderItem.count({ where }),
		prisma.orderItem.findMany({
			where,
			select: {
				id: true,
				productName: true,
				boostTargetUrl: true,
				boostQuantity: true,
				boostFulfillmentStatus: true,
				boostProviderReference: true,
				boostCompletedAt: true,
				createdAt: true,
				order: {
					select: {
						id: true,
						orderNumber: true,
						guestEmail: true,
						createdAt: true,
						paidAt: true,
						user: { select: { email: true, fullName: true } }
					}
				},
				category: { select: { metadata: true } }
			},
			orderBy: { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
			skip: (page - 1) * pageSize,
			take: pageSize
		}),
		prisma.orderItem.groupBy({
			by: ['boostFulfillmentStatus'],
			where: baseWhere,
			_count: { _all: true }
		}),
		prisma.orderItem.count({ where: { AND: [baseWhere, activeCondition] } })
	]);

	const issueEvents = items.length
		? await prisma.orderEvent.findMany({
				where: {
					orderItemId: { in: items.map((item) => item.id) },
					type: { in: [...ISSUE_EVENT_TYPES] }
				},
				select: { orderItemId: true, type: true, description: true, occurredAt: true },
				orderBy: { occurredAt: 'desc' }
			})
		: [];

	let shadowDecisions: Array<{
		orderItemId: string;
		provider: string | null;
		quotedSupplierCostUsd: Prisma.Decimal | null;
		projectedMarginNgn: Prisma.Decimal | null;
		lastSafeErrorCategory: string | null;
		lastCheckedAt: Date | null;
		status: string;
		fulfillmentMode: string;
		complaints: Array<{
			id: string;
			type: string;
			status: string;
			createdAt: Date;
			refillState: string | null;
			refillCheckedAt: Date | null;
		}>;
		selectedRoute: {
			providerService: { serviceId: string; name: string };
		} | null;
	}> = [];
	if (items.length) {
		try {
			shadowDecisions = await prisma.boostFulfillment.findMany({
				where: {
					orderItemId: { in: items.map((item) => item.id) }
				},
				select: {
					orderItemId: true,
					provider: true,
					quotedSupplierCostUsd: true,
					projectedMarginNgn: true,
					lastSafeErrorCategory: true,
					lastCheckedAt: true,
					status: true,
					fulfillmentMode: true,
					complaints: {
						where: {
							status: { in: [...BOOST_OPEN_COMPLAINT_STATUSES] }
						},
						select: {
							id: true,
							type: true,
							status: true,
							createdAt: true,
							refillState: true,
							refillCheckedAt: true
						},
						orderBy: { createdAt: 'desc' }
					},
					selectedRoute: {
						select: { providerService: { select: { serviceId: true, name: true } } }
					}
				}
			});
		} catch (error) {
			const migrationMissing =
				error instanceof Prisma.PrismaClientKnownRequestError &&
				(error.code === 'P2021' || error.code === 'P2022');
			if (!migrationMissing) throw error;
		}
	}
	const shadowByItem = new Map(shadowDecisions.map((decision) => [decision.orderItemId, decision]));

	const latestIssueByItem = new Map<
		string,
		{ type: string; reason: string | null; occurredAt: Date }
	>();
	for (const event of issueEvents) {
		if (!event.orderItemId || latestIssueByItem.has(event.orderItemId)) continue;
		latestIssueByItem.set(event.orderItemId, {
			type: event.type,
			reason: event.description,
			occurredAt: event.occurredAt
		});
	}

	const statusCounts: Record<string, number> = {
		pending: 0,
		in_progress: 0,
		needs_link: 0,
		under_review: 0,
		partial: 0,
		cancelled: 0,
		completed: 0,
		rejected: 0
	};
	for (const group of statusGroups) {
		const status = group.boostFulfillmentStatus || 'pending';
		statusCounts[status] = (statusCounts[status] || 0) + group._count._all;
	}

	return json({
		success: true,
		data: items.map((item) => {
			const shadow = shadowByItem.get(item.id);
			return {
				...item,
				latestIssue: latestIssueByItem.get(item.id) || null,
				shadowDecision:
					shadow && canViewRevenue(locals)
						? {
								provider: shadow.provider,
								providerServiceId: shadow.selectedRoute?.providerService.serviceId || null,
								providerServiceName: shadow.selectedRoute?.providerService.name || null,
								quotedSupplierCostUsd:
									shadow.quotedSupplierCostUsd === null
										? null
										: Number(shadow.quotedSupplierCostUsd),
								projectedMarginNgn:
									shadow.projectedMarginNgn === null ? null : Number(shadow.projectedMarginNgn),
								attention: shadow.lastSafeErrorCategory,
								checkedAt: shadow.lastCheckedAt
							}
						: null,
				complaints: shadow?.complaints || [],
				fulfillmentState: shadow ? { status: shadow.status, mode: shadow.fulfillmentMode } : null
			};
		}),
		meta: {
			page,
			pageSize,
			total,
			totalPages: Math.max(1, Math.ceil(total / pageSize)),
			sort,
			status: statusFilter,
			search,
			statusCounts,
			activeCount,
			canRunShadowRouting: hasAdminPermission(locals.adminContext, 'admin:settings:manage')
		},
		error: null
	});
};
