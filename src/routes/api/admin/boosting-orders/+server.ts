import { json } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { canViewRevenue } from '$lib/services/admin-revenue-visibility';
import { overdueBoostItemsWhere } from '$lib/services/boosting-support-review';
import { isBoostOrderOverdue } from '$lib/helpers/boosting-overdue-review';
import { boostHoldReasons } from '$lib/helpers/boosting-hold-reason';
import { BOOST_SUPPORT_EVENT_TYPES, getBoostSupportState } from '$lib/helpers/boosting-support';
import {
	BOOST_ITEM_STATUSES,
	BOOST_ACTIVE_ITEM_STATUSES,
	BOOST_OPEN_COMPLAINT_STATUSES,
	normalizeBoostItemStatus
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
	if (!['active', 'all', 'overdue', ...BOOST_ITEM_STATUSES].includes(statusFilter)) {
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
			{ boostFulfillmentStatus: { notIn: [...BOOST_ITEM_STATUSES] } },
			{
				boostFulfillment: {
					is: { complaints: { some: { status: { in: [...BOOST_OPEN_COMPLAINT_STATUSES] } } } }
				}
			}
		]
	};
	const now = new Date();
	if (statusFilter === 'overdue') {
		conditions.push(overdueBoostItemsWhere(now));
	} else if (statusFilter === 'active') {
		conditions.push(activeCondition);
	} else if (BOOST_ITEM_STATUSES.includes(statusFilter as (typeof BOOST_ITEM_STATUSES)[number])) {
		conditions.push(
			statusFilter === 'pending'
				? { OR: [{ boostFulfillmentStatus: 'pending' }, { boostFulfillmentStatus: null }] }
				: statusFilter === 'under_review'
					? {
							OR: [
								{ boostFulfillmentStatus: 'under_review' },
								{ boostFulfillmentStatus: { notIn: [...BOOST_ITEM_STATUSES] } }
							]
						}
					: { boostFulfillmentStatus: statusFilter }
		);
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

	const [total, items, statusGroups, activeCount, overdueCount] = await Promise.all([
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
						paymentStatus: true,
						status: true,
						deliveryStatus: true,
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
		prisma.orderItem.count({ where: { AND: [baseWhere, activeCondition] } }),
		prisma.orderItem.count({ where: overdueBoostItemsWhere(now) })
	]);

	const issueEvents = items.length
		? await prisma.orderEvent.findMany({
				where: {
					orderItemId: { in: items.map((item) => item.id) },
					type: { in: [...ISSUE_EVENT_TYPES, ...BOOST_SUPPORT_EVENT_TYPES] }
				},
				select: {
					id: true,
					orderItemId: true,
					type: true,
					description: true,
					occurredAt: true,
					metadata: true
				},
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
		customerStatus: string;
		startCount: number | null;
		remains: number | null;
		supplierOrderId: string | null;
		rawProviderStatus: string | null;
		offerSnapshot: Prisma.JsonValue;
		attempts?: Array<{ safeSummary: Prisma.JsonValue; createdAt: Date }>;
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
					customerStatus: true,
					startCount: true,
					remains: true,
					supplierOrderId: true,
					rawProviderStatus: true,
					offerSnapshot: true,
					attempts: {
						where: { type: 'route_decision' },
						orderBy: { createdAt: 'desc' },
						take: 1,
						select: { safeSummary: true, createdAt: true }
					},
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
		if (!ISSUE_EVENT_TYPES.includes(event.type as never)) continue;
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
		const status = normalizeBoostItemStatus(group.boostFulfillmentStatus);
		statusCounts[status] = (statusCounts[status] || 0) + group._count._all;
	}

	return json(
		{
			success: true,
			data: items.map((item) => {
				const shadow = shadowByItem.get(item.id);
				const snapshot =
					shadow?.offerSnapshot &&
					typeof shadow.offerSnapshot === 'object' &&
					!Array.isArray(shadow.offerSnapshot)
						? (shadow.offerSnapshot as Record<string, unknown>)
						: null;
				const refillDays =
					typeof snapshot?.refillDays === 'number' &&
					Number.isInteger(snapshot.refillDays) &&
					snapshot.refillDays > 0
						? snapshot.refillDays
						: null;
				return {
					...item,
					support: getBoostSupportState(
						issueEvents.filter((event) => event.orderItemId === item.id)
					),
					overdueReview: isBoostOrderOverdue(item, now),
					latestIssue: latestIssueByItem.get(item.id) || null,
					holdReasons:
						shadow &&
						!['completed', 'cancelled'].includes(
							normalizeBoostItemStatus(item.boostFulfillmentStatus)
						)
							? boostHoldReasons(shadow.lastSafeErrorCategory, shadow.attempts?.[0]?.safeSummary)
							: [],
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
					fulfillmentState: shadow ? { status: shadow.status, mode: shadow.fulfillmentMode } : null,
					progress: shadow
						? {
								customerStatus: shadow.customerStatus ?? null,
								startCount: shadow.startCount ?? null,
								remains: shadow.remains ?? null,
								supplierOrderId: shadow.supplierOrderId ?? null,
								rawProviderStatus: shadow.rawProviderStatus ?? null,
								lastCheckedAt: shadow.lastCheckedAt,
								refillDays
							}
						: null
				};
			}),
			meta: {
				canManageOrders: hasAdminPermission(locals.adminContext, 'admin:orders:manage'),
				page,
				pageSize,
				total,
				totalPages: Math.max(1, Math.ceil(total / pageSize)),
				sort,
				status: statusFilter,
				search,
				statusCounts,
				totalItems: statusGroups.reduce((sum, group) => sum + group._count._all, 0),
				activeCount,
				overdueCount,
				canRunShadowRouting: hasAdminPermission(locals.adminContext, 'admin:settings:manage')
			},
			error: null
		},
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
