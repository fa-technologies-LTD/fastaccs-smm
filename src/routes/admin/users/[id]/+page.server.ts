import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { ORDER_STATUS_GROUPS, getOrderStatusLabel } from '$lib/helpers/order-status';
import { canViewRevenue, canViewOrderAmounts } from '$lib/services/admin-revenue-visibility';
import { isRevenueOrder } from '$lib/helpers/order-revenue';
import { getStoreCreditBuckets } from '$lib/services/store-credit';

interface TimelineEntry {
	id: string;
	type: 'account' | 'login' | 'order' | 'payment' | 'admin';
	title: string;
	description: string;
	at: string;
	orderId?: string;
	orderNumber?: string;
}

interface OrderSummary {
	id: string;
	orderNumber: string;
	status: string;
	paymentStatus: string;
	totalAmount: number;
	storeCreditApplied: number;
	paymentReference: string | null;
	currency: string;
	createdAt: Date;
	updatedAt: Date;
	paidAt: Date | null;
	itemCount: number;
}

const FAILED_ORDER_STATUS_SET = new Set<string>(ORDER_STATUS_GROUPS.failed);

function buildTimeline(input: {
	user: {
		id: string;
		registeredAt: Date;
		createdAt: Date;
		emailVerifiedAt: Date | null;
		lastLogin: Date | null;
		lastSeenAt: Date | null;
	};
	orders: Array<{
		id: string;
		orderNumber: string;
		status: string;
		paymentStatus: string;
		createdAt: Date;
		updatedAt: Date;
		paidAt: Date | null;
		totalAmount: number;
		storeCreditApplied: number;
		paymentReference: string | null;
	}>;
	sessionLogins: Date[];
	adminActionLogs: Array<{
		id: string;
		body: string | null;
		createdAt: Date;
	}>;
	adminAuditLogs: Array<{
		id: string;
		action: string;
		description: string | null;
		createdAt: Date;
		actorUser: {
			email: string | null;
			fullName: string | null;
		} | null;
	}>;
	revenueVisible: boolean;
}): TimelineEntry[] {
	const events: TimelineEntry[] = [];
	const registrationDate = input.user.registeredAt || input.user.createdAt;

	events.push({
		id: `${input.user.id}-registered`,
		type: 'account',
		title: 'Account created',
		description: 'User completed registration.',
		at: registrationDate.toISOString()
	});

	if (input.user.emailVerifiedAt) {
		events.push({
			id: `${input.user.id}-email-verified`,
			type: 'account',
			title: 'Email verified',
			description: 'User completed email verification.',
			at: input.user.emailVerifiedAt.toISOString()
		});
	}

	if (input.user.lastLogin) {
		events.push({
			id: `${input.user.id}-last-login`,
			type: 'login',
			title: 'Latest login',
			description: 'Most recent successful login.',
			at: input.user.lastLogin.toISOString()
		});
	}

	if (input.user.lastSeenAt) {
		events.push({
			id: `${input.user.id}-last-seen`,
			type: 'login',
			title: 'Latest return visit',
			description: 'Most recent storefront or dashboard visit.',
			at: input.user.lastSeenAt.toISOString()
		});
	}

	input.sessionLogins.forEach((sessionCreatedAt, index) => {
		events.push({
			id: `${input.user.id}-session-${index}-${sessionCreatedAt.getTime()}`,
			type: 'login',
			title: 'Session issued',
			description: 'A new session was created for this user.',
			at: sessionCreatedAt.toISOString()
		});
	});

	input.orders.forEach((order) => {
		events.push({
			id: `${order.id}-placed`,
			type: 'order',
			title: `Order placed (${order.orderNumber})`,
			description: `Status: ${getOrderStatusLabel(order.status)} • Payment: ${getOrderStatusLabel(order.paymentStatus)}`,
			at: order.createdAt.toISOString(),
			orderId: order.id,
			orderNumber: order.orderNumber
		});

		// Payment source, amount-free so it's safe to show even when amounts are hidden:
		// a gateway reference means a card was charged; no reference means pure store credit.
		const paidWithCard = Boolean(order.paymentReference);
		const usedStoreCredit = Number(order.storeCreditApplied || 0) > 0;
		const source = !paidWithCard
			? 'Store credit'
			: usedStoreCredit
				? 'Card + store credit'
				: 'Card';

		if (order.paidAt) {
			events.push({
				id: `${order.id}-paid`,
				type: 'payment',
				title: `Payment confirmed (${order.orderNumber})`,
				description: input.revenueVisible
					? `Amount: ₦${Number(order.totalAmount || 0).toLocaleString()} • via ${source}`
					: `Payment confirmed • via ${source}`,
				at: order.paidAt.toISOString(),
				orderId: order.id,
				orderNumber: order.orderNumber
			});
		} else if (FAILED_ORDER_STATUS_SET.has(order.status)) {
			events.push({
				id: `${order.id}-payment-outcome`,
				type: 'payment',
				title: `Payment outcome (${order.orderNumber})`,
				description: `Order ended as ${getOrderStatusLabel(order.status)}.`,
				at: order.updatedAt.toISOString(),
				orderId: order.id,
				orderNumber: order.orderNumber
			});
		}

		// Explicit refund event, so a refunded order doesn't just read as "Payment confirmed"
		// with no follow-up. Numbers (and our other refunds) return funds to store credit.
		if (order.status === 'refunded' || order.paymentStatus === 'refunded') {
			events.push({
				id: `${order.id}-refunded`,
				type: 'payment',
				title: `Refunded (${order.orderNumber})`,
				description: input.revenueVisible
					? `₦${Number(order.totalAmount || 0).toLocaleString()} refunded to store credit`
					: 'Order refunded to store credit.',
				at: order.updatedAt.toISOString(),
				orderId: order.id,
				orderNumber: order.orderNumber
			});
		}
	});

	input.adminActionLogs.forEach((log) => {
		events.push({
			id: `${log.id}-admin-action`,
			type: 'admin',
			title: 'Admin action',
			description: log.body || 'User access was updated by an admin.',
			at: log.createdAt.toISOString()
		});
	});

	input.adminAuditLogs.forEach((log) => {
		const actorLabel = log.actorUser?.fullName || log.actorUser?.email || 'An admin';
		const description = log.description?.trim() || log.action.replace(/_/g, ' ').toLowerCase();

		events.push({
			id: `${log.id}-admin-audit`,
			type: 'admin',
			title: 'Admin operation',
			description: `${actorLabel}: ${description}`,
			at: log.createdAt.toISOString()
		});
	});

	return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		throw error(403, 'Unauthorized');
	}
	const revenueVisible = canViewRevenue(locals);
	// Per-order amounts stay visible to order managers (refund workflow); only the
	// aggregate lifetime spend is gated on revenue visibility.
	const orderAmountsVisible = canViewOrderAmounts(locals);
	// Ledger-derived spendable store credit (source of truth), not cached balance.
	const storeCreditAvailable = await getStoreCreditBuckets(params.id)
		.then((b) => b.totalAvailable)
		.catch(() => 0);

	const [user, adminAuditLogs] = await Promise.all([
		prisma.user.findUnique({
			where: { id: params.id },
			select: {
				id: true,
				email: true,
				fullName: true,
				phone: true,
				userType: true,
				isActive: true,
				isAffiliateEnabled: true,
				affiliatePrograms: {
					select: { affiliateCode: true, isSuperAffiliate: true, status: true },
					take: 1
				},
				emailVerified: true,
				emailVerifiedAt: true,
				registeredAt: true,
				lastLogin: true,
				lastSeenAt: true,
				createdAt: true,
				updatedAt: true,
				wallet: {
					select: {
						balance: true
					}
				},
				sessions: {
					select: {
						id: true,
						createdAt: true,
						expiresAt: true,
						lastRefreshedAt: true
					},
					orderBy: { createdAt: 'desc' },
					take: 8
				},
				orders: {
					select: {
						id: true,
						orderNumber: true,
						orderType: true,
						status: true,
						paymentStatus: true,
						totalAmount: true,
						storeCreditApplied: true,
						paymentReference: true,
						currency: true,
						createdAt: true,
						updatedAt: true,
						paidAt: true,
						orderItems: {
							select: {
								quantity: true,
								productName: true,
								boostTargetUrl: true
							}
						}
					},
					orderBy: { createdAt: 'desc' },
					take: 80
				},
				emailNotifications: {
					where: {
						notificationType: 'admin_user_status'
					},
					select: {
						id: true,
						body: true,
						createdAt: true
					},
					orderBy: { createdAt: 'desc' },
					take: 30
				}
			}
		}),
		prisma.adminAuditLog.findMany({
			where: {
				targetUserId: params.id
			},
			select: {
				id: true,
				action: true,
				description: true,
				createdAt: true,
				actorUser: {
					select: {
						email: true,
						fullName: true
					}
				}
			},
			orderBy: { createdAt: 'desc' },
			take: 40
		})
	]);

	if (!user) {
		throw error(404, 'User not found');
	}

	const orderSummaries: OrderSummary[] = user.orders.map((order) => ({
		id: order.id,
		orderNumber: order.orderNumber,
		status: order.status,
		paymentStatus: order.paymentStatus,
		totalAmount: orderAmountsVisible ? Number(order.totalAmount || 0) : 0,
		storeCreditApplied: orderAmountsVisible ? Number(order.storeCreditApplied || 0) : 0,
		paymentReference: order.paymentReference ?? null,
		currency: order.currency,
		createdAt: order.createdAt,
		updatedAt: order.updatedAt,
		paidAt: order.paidAt,
		itemCount: order.orderItems.reduce(
			(sum: number, item: { quantity: number }) => sum + Number(item.quantity || 0),
			0
		)
	}));

	const paidOrderSummaries = orderSummaries.filter((order: OrderSummary) =>
		isRevenueOrder({
			status: order.status,
			paymentStatus: order.paymentStatus
		})
	);

	const totals = {
		orderCount: paidOrderSummaries.length,
		paidOrderCount: paidOrderSummaries.length,
		totalSpent: revenueVisible
			? paidOrderSummaries.reduce((sum: number, order: OrderSummary) => sum + order.totalAmount, 0)
			: 0
	};
	const timeline = buildTimeline({
		user: {
			id: user.id,
			registeredAt: user.registeredAt,
			createdAt: user.createdAt,
			emailVerifiedAt: user.emailVerifiedAt,
			lastLogin: user.lastLogin,
			lastSeenAt: user.lastSeenAt
		},
		orders: orderSummaries,
		sessionLogins: user.sessions.map((session: { createdAt: Date }) => session.createdAt),
		adminActionLogs: user.emailNotifications,
		adminAuditLogs,
		revenueVisible
	});

	return {
		user: {
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			phone: user.phone,
			userType: user.userType,
			isActive: user.isActive,
			isAffiliateEnabled: user.isAffiliateEnabled,
			affiliateCode: user.affiliatePrograms[0]?.affiliateCode ?? null,
			isSuperAffiliate: Boolean(user.affiliatePrograms[0]?.isSuperAffiliate),
			emailVerified: user.emailVerified,
			emailVerifiedAt: user.emailVerifiedAt,
			registeredAt: user.registeredAt,
			lastLogin: user.lastLogin,
			lastSeenAt: user.lastSeenAt || user.lastLogin || user.registeredAt,
			isInactive:
				(user.lastSeenAt || user.lastLogin || user.registeredAt).getTime() <
				Date.now() - 60 * 24 * 60 * 60 * 1000,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			storeCreditBalance: storeCreditAvailable
		},
		stats: totals,
		recentSessions: user.sessions.map(
			(session: { id: string; createdAt: Date; lastRefreshedAt: Date; expiresAt: Date }) => ({
				id: session.id,
				createdAt: session.createdAt,
				lastRefreshedAt: session.lastRefreshedAt,
				expiresAt: session.expiresAt
			})
		),
		orders: orderSummaries,
		timeline,
		canViewRevenue: revenueVisible
	};
};
