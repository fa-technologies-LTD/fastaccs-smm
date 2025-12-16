import { prisma } from '$lib/prisma';
import type { Wallet, WalletTransaction, Prisma } from '@prisma/client';

/**
 * Get or create user's wallet
 */
export async function getOrCreateWallet(userId: string): Promise<Wallet> {
	let wallet = await prisma.wallet.findUnique({
		where: { userId }
	});

	if (!wallet) {
		wallet = await prisma.wallet.create({
			data: {
				userId,
				balance: 0,
				currency: 'NGN'
			}
		});
	}

	return wallet;
}

/**
 * Get wallet balance
 */
export async function getWalletBalance(userId: string): Promise<{
	success: boolean;
	balance?: number;
	currency?: string;
	error?: string;
}> {
	try {
		const wallet = await getOrCreateWallet(userId);
		return {
			success: true,
			balance: Number(wallet.balance),
			currency: wallet.currency
		};
	} catch (error) {
		console.error('Error getting wallet balance:', error);
		return { success: false, error: 'Failed to get wallet balance' };
	}
}

/**
 * Fund wallet (called after successful payment)
 */
export async function fundWallet(
	userId: string,
	amount: number,
	reference: string,
	paymentMethod: string = 'korapay'
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
	try {
		const wallet = await getOrCreateWallet(userId);
		const balanceBefore = Number(wallet.balance);
		const balanceAfter = balanceBefore + amount;

		// Create transaction and update wallet balance in a transaction
		const result = await prisma.$transaction(async (tx) => {
			// Update wallet balance
			const updatedWallet = await tx.wallet.update({
				where: { id: wallet.id },
				data: { balance: balanceAfter }
			});

			// Create transaction record
			const transaction = await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId,
					type: 'deposit',
					amount,
					balanceBefore,
					balanceAfter,
					description: `Wallet funding via ${paymentMethod}`,
					reference,
					paymentMethod,
					status: 'completed'
				}
			});

			return { wallet: updatedWallet, transaction };
		});

		return { success: true, transaction: result.transaction };
	} catch (error) {
		console.error('Error funding wallet:', error);
		return { success: false, error: 'Failed to fund wallet' };
	}
}

/**
 * Debit wallet (for purchases)
 */
export async function debitWallet(
	userId: string,
	amount: number,
	orderId: string,
	description: string = 'Order payment'
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
	try {
		const wallet = await getOrCreateWallet(userId);
		const balanceBefore = Number(wallet.balance);

		// Check sufficient balance
		if (balanceBefore < amount) {
			return {
				success: false,
				error: `Insufficient balance. Available: ₦${balanceBefore.toLocaleString()}, Required: ₦${amount.toLocaleString()}`
			};
		}

		const balanceAfter = balanceBefore - amount;

		// Debit wallet and create transaction
		const result = await prisma.$transaction(async (tx) => {
			// Update wallet balance
			const updatedWallet = await tx.wallet.update({
				where: { id: wallet.id },
				data: { balance: balanceAfter }
			});

			// Create transaction record
			const transaction = await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId,
					type: 'debit',
					amount,
					balanceBefore,
					balanceAfter,
					description,
					reference: orderId,
					status: 'completed'
				}
			});

			return { wallet: updatedWallet, transaction };
		});

		return { success: true, transaction: result.transaction };
	} catch (error) {
		console.error('Error debiting wallet:', error);
		return { success: false, error: 'Failed to debit wallet' };
	}
}

/**
 * Refund to wallet
 */
export async function refundWallet(
	userId: string,
	amount: number,
	orderId: string,
	description: string = 'Order refund'
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
	try {
		const wallet = await getOrCreateWallet(userId);
		const balanceBefore = Number(wallet.balance);
		const balanceAfter = balanceBefore + amount;

		// Refund to wallet and create transaction
		const result = await prisma.$transaction(async (tx) => {
			// Update wallet balance
			const updatedWallet = await tx.wallet.update({
				where: { id: wallet.id },
				data: { balance: balanceAfter }
			});

			// Create transaction record
			const transaction = await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId,
					type: 'refund',
					amount,
					balanceBefore,
					balanceAfter,
					description,
					reference: orderId,
					status: 'completed'
				}
			});

			return { wallet: updatedWallet, transaction };
		});

		return { success: true, transaction: result.transaction };
	} catch (error) {
		console.error('Error refunding wallet:', error);
		return { success: false, error: 'Failed to refund wallet' };
	}
}

/**
 * Get wallet transaction history
 */
export async function getWalletTransactions(
	userId: string,
	options: {
		limit?: number;
		offset?: number;
		type?: 'deposit' | 'debit' | 'refund';
	} = {}
): Promise<{
	success: boolean;
	transactions?: WalletTransaction[];
	total?: number;
	error?: string;
}> {
	try {
		const { limit = 50, offset = 0, type } = options;

		const where: Prisma.WalletTransactionWhereInput = { userId };
		if (type) where.type = type;

		const [transactions, total] = await Promise.all([
			prisma.walletTransaction.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				take: limit,
				skip: offset
			}),
			prisma.walletTransaction.count({ where })
		]);

		return {
			success: true,
			transactions,
			total
		};
	} catch (error) {
		console.error('Error getting wallet transactions:', error);
		return { success: false, error: 'Failed to get transactions' };
	}
}

/**
 * Get transaction by reference
 */
export async function getTransactionByReference(reference: string): Promise<{
	success: boolean;
	transaction?: WalletTransaction;
	error?: string;
}> {
	try {
		const transaction = await prisma.walletTransaction.findUnique({
			where: { reference }
		});

		if (!transaction) {
			return { success: false, error: 'Transaction not found' };
		}

		return { success: true, transaction };
	} catch (error) {
		console.error('Error getting transaction:', error);
		return { success: false, error: 'Failed to get transaction' };
	}
}
