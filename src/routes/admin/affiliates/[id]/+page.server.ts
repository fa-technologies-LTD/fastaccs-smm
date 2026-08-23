import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { error } from '@sveltejs/kit';
import { toSerializableDecimals } from '$lib/helpers/serialize';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';
import { toNetSales } from '$lib/helpers/order-revenue';
import { SC_AFFILIATE_ADJUSTMENT, SC_REDEEM_EARNED } from '$lib/services/store-credit';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		throw error(403, 'Unauthorized');
	}

	const { id } = params;

	try {
		const affiliate = await prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				fullName: true,
				email: true,
				avatarUrl: true,
				isAffiliateEnabled: true,
				createdAt: true,
				affiliateWelcomePopupSeenAt: true,
				affiliateProgress50PopupSeenAt: true,
				affiliateProgress80PopupSeenAt: true,
				affiliateProgress95PopupSeenAt: true,
				affiliateUnlockedPopupSeenAt: true,
				affiliatePrograms: {
					select: {
						id: true,
						affiliateCode: true,
						status: true,
						createdAt: true,
						totalReferrals: true
					},
					orderBy: { createdAt: 'asc' },
					take: 1
				}
			}
		});

		if (!affiliate) {
			throw error(404, 'Affiliate not found');
		}

		if (!affiliate.isAffiliateEnabled || affiliate.affiliatePrograms.length === 0) {
			throw error(404, 'User is not an active affiliate');
		}

		const affiliateProgram = affiliate.affiliatePrograms[0];

		const [orders, ledgerRows, bankDetails] = await Promise.all([
			prisma.order.findMany({
				where: {
					affiliateUserId: affiliate.id,
					...buildRevenueOrderWhere()
				},
				include: {
					user: {
						select: {
							email: true,
							fullName: true
						}
					},
					orderItems: {
						select: {
							id: true
						}
					}
				},
				orderBy: { createdAt: 'desc' }
			}),
			prisma.walletTransaction.findMany({
				where: {
					userId: affiliate.id,
					type: {
						in: ['affiliate_credit', 'affiliate_payout', SC_REDEEM_EARNED, SC_AFFILIATE_ADJUSTMENT]
					}
				},
				select: {
					id: true,
					type: true,
					status: true,
					amount: true,
					description: true,
					reference: true,
					metadata: true,
					createdAt: true,
					updatedAt: true
				},
				orderBy: { createdAt: 'desc' }
			}),
			prisma.affiliatePayoutDetails.findUnique({
				where: { userId: affiliate.id }
			})
		]);

		const creditByOrder = new Map<string, number>();
		const creditByStatus: Record<string, number> = {};
		const payoutByStatus: Record<string, number> = {};
		const redeemedByStatus: Record<string, number> = {};
		const adjustmentByStatus: Record<string, number> = {};

		for (const row of ledgerRows) {
			const status = String(row.status || '')
				.trim()
				.toLowerCase();
			const amount = Math.max(0, Number(row.amount || 0));
			const metadata =
				row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
					? (row.metadata as Record<string, unknown>)
					: null;
			const orderId =
				metadata && typeof metadata.orderId === 'string' ? metadata.orderId.trim() : '';

			if (row.type === 'affiliate_credit') {
				creditByStatus[status] = (creditByStatus[status] || 0) + amount;
				if (orderId) {
					creditByOrder.set(orderId, (creditByOrder.get(orderId) || 0) + amount);
				}
			} else if (row.type === 'affiliate_payout') {
				payoutByStatus[status] = (payoutByStatus[status] || 0) + amount;
			} else if (row.type === SC_REDEEM_EARNED) {
				redeemedByStatus[status] = (redeemedByStatus[status] || 0) + amount;
			} else if (row.type === SC_AFFILIATE_ADJUSTMENT) {
				adjustmentByStatus[status] = (adjustmentByStatus[status] || 0) + amount;
				if (status === 'available' && orderId) {
					creditByOrder.set(orderId, (creditByOrder.get(orderId) || 0) - amount);
				}
			}
		}
		const netCreditForOrder = (orderId: string): number =>
			Math.max(0, Number(creditByOrder.get(orderId) || 0));

		const payouts = ledgerRows
			.filter((row) => row.type === 'affiliate_payout')
			.map((row) => ({
				id: row.id,
				amount: Number(row.amount || 0),
				status: row.status,
				reference: row.reference,
				description: row.description,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt
			}));

		const monthlyStats = orders.reduce(
			(acc, order) => {
				const month = new Date(order.createdAt).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'short'
				});
				if (!acc[month]) {
					acc[month] = {
						month,
						orders: 0,
						sales: 0,
						storeCredit: 0
					};
				}

				const orderTotal = toNetSales(order.totalAmount, order.refundedAmount);
				const storeCredit = netCreditForOrder(order.id);
				acc[month].orders += 1;
				acc[month].sales += orderTotal;
				acc[month].storeCredit += storeCredit;
				return acc;
			},
			{} as Record<string, { month: string; orders: number; sales: number; storeCredit: number }>
		);
		const monthlyBreakdown = Object.values(monthlyStats).reverse();

		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		const recentOrders = orders.filter((order) => new Date(order.createdAt) >= thirtyDaysAgo);
		const recentSales = recentOrders.reduce(
			(sum, order) => sum + toNetSales(order.totalAmount, order.refundedAmount),
			0
		);
		const recentStoreCredit = recentOrders.reduce(
			(sum, order) => sum + netCreditForOrder(order.id),
			0
		);

		const ledgerSummary = {
			availableStoreCredit: Math.max(
				0,
				Number(creditByStatus.available || 0) -
					Number(payoutByStatus.requested || 0) -
					Number(payoutByStatus.under_review || 0) -
					Number(payoutByStatus.paid || 0) -
					Number(redeemedByStatus.available || 0) -
					Number(adjustmentByStatus.available || 0)
			),
			pendingStoreCredit: Number(creditByStatus.pending || 0),
			underReviewStoreCredit: Number(creditByStatus.under_review || 0),
			requestedStoreCredit:
				Number(payoutByStatus.requested || 0) + Number(payoutByStatus.under_review || 0),
			paidStoreCredit: Number(payoutByStatus.paid || 0),
			reversedStoreCredit:
				Number(creditByStatus.reversed || 0) + Number(payoutByStatus.reversed || 0),
			totalStoreCreditEarned: Math.max(
				0,
				Number(creditByStatus.available || 0) +
					Number(creditByStatus.pending || 0) +
					Number(creditByStatus.under_review || 0) +
					Number(creditByStatus.requested || 0) +
					Number(creditByStatus.paid || 0) -
					Number(adjustmentByStatus.available || 0)
			)
		};

		return toSerializableDecimals({
			affiliate: {
				id: affiliate.id,
				fullName: affiliate.fullName,
				email: affiliate.email,
				avatarUrl: affiliate.avatarUrl,
				isAffiliateEnabled: affiliate.isAffiliateEnabled,
				createdAt: affiliate.createdAt,
				popupsSeen: {
					welcome: affiliate.affiliateWelcomePopupSeenAt,
					progress50: affiliate.affiliateProgress50PopupSeenAt,
					progress80: affiliate.affiliateProgress80PopupSeenAt,
					progress95: affiliate.affiliateProgress95PopupSeenAt,
					unlocked: affiliate.affiliateUnlockedPopupSeenAt
				}
			},
			program: {
				id: affiliateProgram.id,
				affiliateCode: affiliateProgram.affiliateCode,
				totalReferrals: affiliateProgram.totalReferrals,
				totalSales: orders.reduce(
					(sum, order) => sum + toNetSales(order.totalAmount, order.refundedAmount),
					0
				),
				successfulOrders: orders.length,
				status: affiliateProgram.status,
				createdAt: affiliateProgram.createdAt
			},
			ledgerSummary,
			payouts,
			bankDetails,
			orders: orders.map((order) => ({
				id: order.id,
				orderNumber: order.orderNumber,
				customerEmail: order.user?.email || order.guestEmail,
				customerName: order.user?.fullName || 'Guest',
				totalAmount: toNetSales(order.totalAmount, order.refundedAmount),
				status: order.status,
				paymentStatus: order.paymentStatus,
				createdAt: order.createdAt,
				itemCount: order.orderItems.length,
				storeCredit: netCreditForOrder(order.id)
			})),
			monthlyBreakdown,
			recentLedger: ledgerRows.slice(0, 20).map((row) => ({
				id: row.id,
				type: row.type,
				status: row.status,
				amount: Number(row.amount || 0),
				description: row.description,
				reference: row.reference,
				createdAt: row.createdAt
			})),
			recentStats: {
				orders: recentOrders.length,
				sales: recentSales,
				storeCredit: recentStoreCredit
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error loading affiliate details:', err);
		throw error(500, 'Failed to load affiliate details');
	}
};
