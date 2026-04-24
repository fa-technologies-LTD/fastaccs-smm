import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { triggerRestockNotificationsForTier } from '$lib/services/restock-notifications';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';
import { sanitizeStoredCredentialValue } from '$lib/helpers/credential-links';

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

		const accountData = await request.json();
		const categoryId = typeof accountData.categoryId === 'string' ? accountData.categoryId : '';

		if (Object.prototype.hasOwnProperty.call(accountData, 'twoFa')) {
			accountData.twoFa = sanitizeStoredCredentialValue(accountData.twoFa);
		}

		if (Object.prototype.hasOwnProperty.call(accountData, 'linkUrl')) {
			accountData.linkUrl = sanitizeStoredCredentialValue(accountData.linkUrl);
		}

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
