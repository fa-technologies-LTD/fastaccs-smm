import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { triggerRestockNotificationsForTier } from '$lib/services/restock-notifications';

// GET /api/accounts - Get all accounts with optional filters
export async function GET({ url }) {
	try {
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
export async function POST({ request }) {
	try {
		const accountData = await request.json();
		const categoryId = typeof accountData.categoryId === 'string' ? accountData.categoryId : '';

		// Remove metadata field if it exists since Account model doesn't have it
		if ('metadata' in accountData) {
			delete accountData.metadata;
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
			data: accountData
		});

		if (categoryId && data.status === 'available' && availableBefore === 0) {
			void triggerRestockNotificationsForTier(categoryId).catch((error) => {
				console.error('Failed to trigger restock notifications:', error);
			});
		}

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
