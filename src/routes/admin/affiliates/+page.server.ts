import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';
import { toNetSales } from '$lib/helpers/order-revenue';
import { SC_AFFILIATE_ADJUSTMENT, SC_REDEEM_EARNED } from '$lib/services/store-credit';
import {
	calculateAffiliateLedgerSummary,
	calculateAffiliateRewardCostSummary,
	getCanonicalReferralCounts
} from '$lib/services/affiliate';
import { calculateRetainedAffiliateBuyerDiscount } from '$lib/services/affiliate-policy';
import { hasAdminPermission } from '$lib/auth/admin-roles';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:affiliates:manage')) {
			return {
				affiliates: [],
				stats: {
					totalAffiliates: 0,
					activeAffiliates: 0,
					totalStoreCreditEarned: 0,
					totalAvailableStoreCredit: 0,
					totalSuccessfulOrders: 0,
					totalPayoutRequested: 0,
					pendingBankDetailsReviews: 0,
					trackedLinkOpens: 0,
					dashboardViews: 0,
					shareActions: 0,
					linkedUsers: 0,
					referredBuyers: 0,
					productiveAffiliates: 0,
					netReferredSales: 0,
					buyerDiscountCost: 0,
					regularRewardCost: 0,
					superRewardCost: 0,
					totalRewardCost: 0,
					outstandingAffiliateLiability: 0,
					paidAffiliateCash: 0
				}
			};
		}

		const affiliatesRaw = await prisma.user.findMany({
			where: {
				OR: [{ isAffiliateEnabled: true }, { affiliatePrograms: { some: {} } }]
			},
			select: {
				id: true,
				fullName: true,
				email: true,
				createdAt: true,
				isAffiliateEnabled: true,
				affiliatePrograms: {
					select: {
						id: true,
						affiliateCode: true,
						status: true,
						createdAt: true,
						isSuperAffiliate: true
					},
					orderBy: { createdAt: 'asc' },
					take: 1
				}
			},
			orderBy: { createdAt: 'desc' }
		});

		const userIds = affiliatesRaw.map((row) => row.id);

		const [
			successfulOrdersAgg,
			payingBuyerPairs,
			ledgerGrouped,
			pendingBankDetailsRows,
			referralCounts,
			affiliateEventCounts,
			rewardCostRows,
			referredOrderEconomics
		] = await Promise.all([
			userIds.length
				? prisma.order.groupBy({
						by: ['affiliateUserId'],
						where: {
							affiliateUserId: { in: userIds },
							orderType: 'account',
							...buildRevenueOrderWhere()
						},
						_count: { _all: true },
						_sum: { totalAmount: true, refundedAmount: true }
					})
				: Promise.resolve([]),
			userIds.length
				? prisma.order.findMany({
						where: {
							affiliateUserId: { in: userIds },
							userId: { not: null },
							orderType: 'account',
							...buildRevenueOrderWhere()
						},
						select: { affiliateUserId: true, userId: true },
						distinct: ['affiliateUserId', 'userId']
					})
				: Promise.resolve([]),
			userIds.length
				? prisma.walletTransaction.groupBy({
						by: ['userId', 'type', 'status'],
						where: {
							userId: { in: userIds },
							type: {
								in: [
									'affiliate_credit',
									'affiliate_payout',
									SC_REDEEM_EARNED,
									SC_AFFILIATE_ADJUSTMENT
								]
							}
						},
						_sum: { amount: true }
					})
				: Promise.resolve([]),
			userIds.length
				? prisma.affiliatePayoutDetails.findMany({
						where: { userId: { in: userIds }, status: 'pending' },
						select: { userId: true }
					})
				: Promise.resolve([]),
			getCanonicalReferralCounts(userIds),
			prisma.affiliateEvent
				.groupBy({
					by: ['type'],
					where: {
						type: {
							in: [
								'referral_link_opened',
								'affiliate_dashboard_viewed',
								'affiliate_code_copied',
								'affiliate_link_copied',
								'affiliate_whatsapp_share_started',
								'affiliate_message_copied'
							]
						}
					},
					_count: { _all: true }
				})
				.catch((error) => {
					if ((error as { code?: string })?.code === 'P2021') return [];
					throw error;
				}),
			userIds.length
				? prisma.walletTransaction.findMany({
						where: {
							userId: { in: userIds },
							type: { in: ['affiliate_credit', SC_AFFILIATE_ADJUSTMENT] }
						},
						select: {
							type: true,
							status: true,
							amount: true,
							reference: true,
							metadata: true
						}
					})
				: Promise.resolve([]),
			userIds.length
				? prisma.order.findMany({
						where: {
							affiliateUserId: { in: userIds },
							orderType: 'account',
							...buildRevenueOrderWhere()
						},
						select: {
							totalAmount: true,
							refundedAmount: true,
							discountAmount: true
						}
					})
				: Promise.resolve([])
		]);
		const eventCountByType = new Map(
			affiliateEventCounts.map((row) => [row.type, Number(row._count._all || 0)])
		);
		const shareActions = [
			'affiliate_code_copied',
			'affiliate_link_copied',
			'affiliate_whatsapp_share_started',
			'affiliate_message_copied'
		].reduce((sum, type) => sum + (eventCountByType.get(type) || 0), 0);

		const pendingBankDetailsUserIds = new Set(pendingBankDetailsRows.map((row) => row.userId));
		const paidBuyersByAffiliate = new Map<string, number>();
		for (const pair of payingBuyerPairs) {
			if (!pair.affiliateUserId) continue;
			paidBuyersByAffiliate.set(
				pair.affiliateUserId,
				(paidBuyersByAffiliate.get(pair.affiliateUserId) || 0) + 1
			);
		}

		const successfulOrdersByUser = new Map(
			successfulOrdersAgg.map((row) => [
				String(row.affiliateUserId),
				{
					count: Number(row._count._all || 0),
					totalSales: toNetSales(row._sum.totalAmount, row._sum.refundedAmount)
				}
			])
		);

		const ledgerByUser = new Map<string, typeof ledgerGrouped>();
		for (const row of ledgerGrouped) {
			const userId = String(row.userId);
			const userRows = ledgerByUser.get(userId) || [];
			userRows.push(row);
			ledgerByUser.set(userId, userRows);
		}

		const affiliates = affiliatesRaw.map((row) => {
			const program = row.affiliatePrograms[0] || null;
			const orderAgg = successfulOrdersByUser.get(row.id) || { count: 0, totalSales: 0 };
			const ledger = calculateAffiliateLedgerSummary(ledgerByUser.get(row.id) || []);

			return {
				id: row.id,
				fullName: row.fullName,
				email: row.email,
				createdAt: row.createdAt,
				isAffiliateEnabled: row.isAffiliateEnabled,
				affiliateCode: program?.affiliateCode || null,
				programStatus: program?.status || 'inactive',
				totalReferrals: referralCounts.get(row.id) || 0,
				paidReferredUsers: paidBuyersByAffiliate.get(row.id) || 0,
				isSuperAffiliate: Boolean(program?.isSuperAffiliate),
				successfulOrders: orderAgg.count,
				totalSales: orderAgg.totalSales,
				...ledger,
				joinedAt: program?.createdAt || row.createdAt,
				hasPendingBankDetails: pendingBankDetailsUserIds.has(row.id)
			};
		});

		const rewardCosts = calculateAffiliateRewardCostSummary(rewardCostRows);
		const stats = {
			totalAffiliates: affiliates.length,
			activeAffiliates: affiliates.filter(
				(row) => row.isAffiliateEnabled && row.programStatus === 'active'
			).length,
			totalStoreCreditEarned: affiliates.reduce((sum, row) => sum + row.totalStoreCreditEarned, 0),
			totalAvailableStoreCredit: affiliates.reduce((sum, row) => sum + row.availableStoreCredit, 0),
			totalSuccessfulOrders: affiliates.reduce((sum, row) => sum + row.successfulOrders, 0),
			totalPayoutRequested: affiliates.reduce((sum, row) => sum + row.requestedStoreCredit, 0),
			pendingBankDetailsReviews: pendingBankDetailsUserIds.size,
			trackedLinkOpens: eventCountByType.get('referral_link_opened') || 0,
			dashboardViews: eventCountByType.get('affiliate_dashboard_viewed') || 0,
			shareActions,
			linkedUsers: [...referralCounts.values()].reduce((sum, count) => sum + count, 0),
			referredBuyers: [...paidBuyersByAffiliate.values()].reduce((sum, count) => sum + count, 0),
			productiveAffiliates: affiliates.filter((row) => row.successfulOrders > 0).length,
			netReferredSales: affiliates.reduce((sum, row) => sum + row.totalSales, 0),
			buyerDiscountCost: referredOrderEconomics.reduce(
				(sum, order) => sum + calculateRetainedAffiliateBuyerDiscount(order),
				0
			),
			...rewardCosts,
			outstandingAffiliateLiability: affiliates.reduce(
				(sum, row) =>
					sum +
					row.pendingStoreCredit +
					row.underReviewStoreCredit +
					row.availableStoreCredit +
					row.requestedStoreCredit,
				0
			),
			paidAffiliateCash: affiliates.reduce((sum, row) => sum + row.paidStoreCredit, 0)
		};

		return {
			affiliates,
			stats
		};
	} catch (error) {
		console.error('Error loading affiliate data:', error);
		return {
			affiliates: [],
			stats: {
				totalAffiliates: 0,
				activeAffiliates: 0,
				totalStoreCreditEarned: 0,
				totalAvailableStoreCredit: 0,
				totalSuccessfulOrders: 0,
				totalPayoutRequested: 0,
				pendingBankDetailsReviews: 0,
				trackedLinkOpens: 0,
				dashboardViews: 0,
				shareActions: 0,
				linkedUsers: 0,
				referredBuyers: 0,
				productiveAffiliates: 0,
				netReferredSales: 0,
				buyerDiscountCost: 0,
				regularRewardCost: 0,
				superRewardCost: 0,
				totalRewardCost: 0,
				outstandingAffiliateLiability: 0,
				paidAffiliateCash: 0
			}
		};
	}
};
