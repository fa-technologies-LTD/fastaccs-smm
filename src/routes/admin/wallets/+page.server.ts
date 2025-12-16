import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return {
				wallets: [],
				transactions: [],
				stats: {
					totalWallets: 0,
					totalBalance: 0,
					totalDeposits: 0,
					totalWithdrawals: 0
				}
			};
		}

		// Get all wallets with user info
		const wallets = await prisma.wallet.findMany({
			include: {
				user: {
					select: {
						id: true,
						email: true,
						fullName: true
					}
				}
			},
			orderBy: {
				balance: 'desc'
			}
		});

		// Get recent transactions (last 100)
		const transactions = await prisma.walletTransaction.findMany({
			take: 100,
			include: {
				user: {
					select: {
						id: true,
						email: true,
						fullName: true
					}
				}
			},
			orderBy: {
				createdAt: 'desc'
			}
		});

		// Calculate stats
		const totalBalance = wallets.reduce((sum, wallet) => sum + Number(wallet.balance), 0);

		const deposits = await prisma.walletTransaction.aggregate({
			where: { type: 'deposit', status: 'completed' },
			_sum: { amount: true }
		});

		const debits = await prisma.walletTransaction.aggregate({
			where: { type: 'debit', status: 'completed' },
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
			}
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
			}
		};
	}
};
