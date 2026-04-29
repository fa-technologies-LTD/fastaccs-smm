import { json } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { triggerRestockNotificationsForTier } from '$lib/services/restock-notifications';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';
import { normalizeAccountDataForPersistence } from '$lib/helpers/account-credentials';

// GET /api/accounts - Get all accounts with optional filters
export async function GET({ url, locals }) {
		try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const categoryId = url.searchParams.get('categoryId');
		const status = url.searchParams.get('status');
		const platform = url.searchParams.get('platform');
		const batchId = url.searchParams.get('batchId');

		const where: Record<string, string> = {};
		if (categoryId) where.categoryId = categoryId;
		if (status) where.status = status;
		if (platform) where.platform = platform;
		if (batchId) where.batchId = batchId;

		const data = await prisma.account.findMany({
			where,
			orderBy: { createdAt: 'desc' }
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

// POST /api/accounts - Create new account
export async function POST({ request, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

			const rawAccountData = await request.json();
			const accountData =
				rawAccountData && typeof rawAccountData === 'object' && !Array.isArray(rawAccountData)
					? normalizeAccountDataForPersistence(rawAccountData as Record<string, unknown>)
					: {};
			const categoryId = typeof accountData.categoryId === 'string' ? accountData.categoryId : '';
			const batchId = typeof accountData.batchId === 'string' ? accountData.batchId : '';
			const platform = typeof accountData.platform === 'string' ? accountData.platform : '';

			if (!categoryId || !batchId || !platform) {
				return json(
					{ data: null, error: 'batchId, categoryId, and platform are required fields' },
					{ status: 400 }
				);
			}

		let availableBefore = 0;
		if (categoryId) {
			availableBefore = await prisma.account.count({
				where: {
					categoryId,
					status: 'available'
				}
			});
		}

			const data = await prisma.account.create({
				data: accountData as Prisma.AccountUncheckedCreateInput
			});

		if (categoryId && data.status === 'available' && availableBefore === 0) {
			void triggerRestockNotificationsForTier(categoryId).catch((error) => {
				console.error('Failed to trigger restock notifications:', error);
			});
		}

		invalidateAdminStatsCache();
		void sendLowStockAdminAlertIfNeeded('account_create').catch((error) => {
			console.error('Failed to evaluate low-stock alert after account create:', error);
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
