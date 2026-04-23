import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async () => {
	try {
		// Get all wallets with user info
		const walletsRaw = await prisma.wallet.findMany({
			where: {
				user: {
					isAffiliateEnabled: true
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
					isAffiliateEnabled: true
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

		// Convert Decimal types to numbers for serialization
		const wallets = walletsRaw.map((wallet) => ({
			...wallet,
			balance: Number(wallet.balance)
		}));

		const transactions = transactionsRaw.map((txn) => ({
			...txn,
			amount: Number(txn.amount),
			balanceBefore: txn.balanceBefore ? Number(txn.balanceBefore) : null,
			balanceAfter: txn.balanceAfter ? Number(txn.balanceAfter) : null
		}));

		// Calculate total balance
		const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);

		const deposits = await prisma.walletTransaction.aggregate({
			where: { type: 'deposit', status: 'completed', user: { isAffiliateEnabled: true } },
			_sum: { amount: true }
		});

		const debits = await prisma.walletTransaction.aggregate({
			where: { type: 'debit', status: 'completed', user: { isAffiliateEnabled: true } },
			_sum: { amount: true }
		});

		return {
			wallets,
			transactions,
			stats: {
				totalWallets: wallets.length,
				totalBalance,
				totalDeposits: Number(deposits._sum.amount || 0),
				totalWithdrawals: Number(debits._sum.amount || 0)
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
