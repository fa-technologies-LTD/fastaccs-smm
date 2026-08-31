import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { getStoreCreditTotalsForUsers } from '$lib/services/store-credit';

export const load: PageServerLoad = async () => {
	try {
		// Get all wallets with user info
		const walletsRaw = await prisma.wallet.findMany({
			where: {
				user: {
					OR: [{ isAffiliateEnabled: true }, { affiliatePrograms: { some: {} } }]
				}
			},
			include: {
				user: {
					select: {
						id: true,
						email: true,
						fullName: true,
						isAffiliateEnabled: true
					}
				}
			},
			orderBy: {
				balance: 'desc'
			}
		});

		// Get recent transactions (last 100)
		const transactionsRaw = await prisma.walletTransaction.findMany({
			where: {
				user: {
					OR: [{ isAffiliateEnabled: true }, { affiliatePrograms: { some: {} } }]
				}
			},
			take: 100,
			include: {
				user: {
					select: {
						id: true,
						email: true,
						fullName: true,
						isAffiliateEnabled: true
					}
				}
			},
			orderBy: {
				createdAt: 'desc'
			}
		});

		// The ledger is authoritative. wallet.balance is only a write-path cache and can
		// drift after payout lifecycle changes, so it must not drive admin decisions.
		const storeCreditByUser = await getStoreCreditTotalsForUsers(
			walletsRaw.map((wallet) => wallet.userId)
		);
		const wallets = walletsRaw
			.map((wallet) => ({
				...wallet,
				balance: storeCreditByUser.get(wallet.userId) ?? 0
			}))
			.sort((a, b) => b.balance - a.balance);

		const transactions = transactionsRaw.map((txn) => ({
			...txn,
			amount: Number(txn.amount),
			balanceBefore: txn.balanceBefore == null ? null : Number(txn.balanceBefore),
			balanceAfter: txn.balanceAfter == null ? null : Number(txn.balanceAfter)
		}));

		// Calculate total balance
		const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);

		const affiliateUserWhere = {
			OR: [{ isAffiliateEnabled: true }, { affiliatePrograms: { some: {} } }]
		};
		const [affiliateCredits, affiliateAdjustments, affiliateUsed] = await Promise.all([
			prisma.walletTransaction.aggregate({
				where: {
					type: 'affiliate_credit',
					status: { in: ['pending', 'available', 'under_review', 'requested', 'paid'] },
					user: affiliateUserWhere
				},
				_sum: { amount: true }
			}),
			prisma.walletTransaction.aggregate({
				where: {
					type: 'affiliate_credit_adjustment',
					status: 'available',
					user: affiliateUserWhere
				},
				_sum: { amount: true }
			}),
			prisma.walletTransaction.aggregate({
				where: {
					OR: [
						{ type: 'store_credit_redemption_earned', status: 'available' },
						{ type: 'affiliate_payout', status: 'paid' }
					],
					user: affiliateUserWhere
				},
				_sum: { amount: true }
			})
		]);

		return {
			wallets,
			transactions,
			stats: {
				totalWallets: wallets.length,
				totalBalance,
				totalDeposits: Math.max(
					0,
					Number(affiliateCredits._sum.amount || 0) - Number(affiliateAdjustments._sum.amount || 0)
				),
				totalWithdrawals: Number(affiliateUsed._sum.amount || 0)
			},
			error: null
		};
	} catch (error) {
		console.error('Error loading wallet data:', error);
		return {
			wallets: [],
			transactions: [],
			stats: {
				totalWallets: 0,
				totalBalance: 0,
				totalDeposits: 0,
				totalWithdrawals: 0
			},
			error: 'Database connection failed. Please check your connection and try again.'
		};
	}
};
