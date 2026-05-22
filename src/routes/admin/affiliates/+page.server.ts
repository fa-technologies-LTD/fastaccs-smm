import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return {
				affiliates: [],
				stats: {
					totalAffiliates: 0,
					activeAffiliates: 0,
					totalStoreCreditEarned: 0,
					totalAvailableStoreCredit: 0,
					totalSuccessfulOrders: 0,
					totalPayoutRequested: 0
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
						totalReferrals: true
					},
					orderBy: { createdAt: 'asc' },
					take: 1
				}
			},
			orderBy: { createdAt: 'desc' }
		});

		const userIds = affiliatesRaw.map((row) => row.id);

		const [successfulOrdersAgg, ledgerGrouped] = await Promise.all([
			userIds.length
				? prisma.order.groupBy({
						by: ['affiliateUserId'],
						where: {
							affiliateUserId: { in: userIds },
							OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }]
						},
						_count: { _all: true },
						_sum: { totalAmount: true }
					})
				: Promise.resolve([]),
			userIds.length
				? prisma.walletTransaction.groupBy({
						by: ['userId', 'type', 'status'],
						where: {
							userId: { in: userIds },
							type: { in: ['affiliate_credit', 'affiliate_payout'] }
						},
						_sum: { amount: true }
					})
				: Promise.resolve([])
		]);

		const successfulOrdersByUser = new Map(
			successfulOrdersAgg.map((row) => [
				String(row.affiliateUserId),
				{
					count: Number(row._count._all || 0),
					totalSales: Number(row._sum.totalAmount || 0)
				}
			])
		);

		type LedgerBucket = Record<
			string,
			{
				credit: number;
				payout: number;
			}
		>;
		const ledgerByUser = new Map<string, LedgerBucket>();

		for (const row of ledgerGrouped) {
			const userId = String(row.userId);
			const status = String(row.status || '').trim().toLowerCase();
			const type = String(row.type || '').trim().toLowerCase();
			const amount = Math.max(0, Number(row._sum.amount || 0));

			const userBucket = ledgerByUser.get(userId) || {};
			const statusBucket = userBucket[status] || { credit: 0, payout: 0 };
			if (type === 'affiliate_credit') {
				statusBucket.credit += amount;
			} else if (type === 'affiliate_payout') {
				statusBucket.payout += amount;
			}
			userBucket[status] = statusBucket;
			ledgerByUser.set(userId, userBucket);
		}

		const affiliates = affiliatesRaw.map((row) => {
			const program = row.affiliatePrograms[0] || null;
			const orderAgg = successfulOrdersByUser.get(row.id) || { count: 0, totalSales: 0 };
			const ledger = ledgerByUser.get(row.id) || {};
			const getCredit = (status: string) => Math.max(0, Number(ledger[status]?.credit || 0));
			const getPayout = (status: string) => Math.max(0, Number(ledger[status]?.payout || 0));

			const availableStoreCredit = Math.max(
				0,
				getCredit('available') - getPayout('requested') - getPayout('paid')
			);
			const pendingStoreCredit = getCredit('pending');
			const underReviewStoreCredit = getCredit('under_review');
			const requestedStoreCredit = getPayout('requested');
			const paidStoreCredit = getPayout('paid');
			const reversedStoreCredit = getCredit('reversed') + getPayout('reversed');
			const totalStoreCreditEarned =
				getCredit('available') +
				getCredit('pending') +
				getCredit('under_review') +
				getCredit('requested') +
				getCredit('paid');

			return {
				id: row.id,
				fullName: row.fullName,
				email: row.email,
				createdAt: row.createdAt,
				isAffiliateEnabled: row.isAffiliateEnabled,
				affiliateCode: program?.affiliateCode || null,
				programStatus: program?.status || 'inactive',
				totalReferrals: Number(program?.totalReferrals || 0),
				successfulOrders: orderAgg.count,
				totalSales: orderAgg.totalSales,
				availableStoreCredit,
				pendingStoreCredit,
				underReviewStoreCredit,
				requestedStoreCredit,
				paidStoreCredit,
				reversedStoreCredit,
				totalStoreCreditEarned,
				joinedAt: program?.createdAt || row.createdAt
			};
		});

		const stats = {
			totalAffiliates: affiliates.length,
			activeAffiliates: affiliates.filter(
				(row) => row.isAffiliateEnabled && row.programStatus === 'active'
			).length,
			totalStoreCreditEarned: affiliates.reduce((sum, row) => sum + row.totalStoreCreditEarned, 0),
			totalAvailableStoreCredit: affiliates.reduce((sum, row) => sum + row.availableStoreCredit, 0),
			totalSuccessfulOrders: affiliates.reduce((sum, row) => sum + row.successfulOrders, 0),
			totalPayoutRequested: affiliates.reduce((sum, row) => sum + row.requestedStoreCredit, 0)
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
				totalPayoutRequested: 0
			}
		};
	}
};
