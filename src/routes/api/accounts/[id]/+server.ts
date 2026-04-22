import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { triggerRestockNotificationsForTier } from '$lib/services/restock-notifications';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';

// PUT /api/accounts/[id] - Update account
export async function PUT({ params, request, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const id = params.id;
		const updates = await request.json();
		const existing = await prisma.account.findUnique({
			where: { id },
			select: {
				id: true,
				categoryId: true,
				status: true
			}
		});

		if (!existing) {
			return json({ data: null, error: 'Account not found' }, { status: 404 });
		}

		const targetCategoryId =
			typeof updates.categoryId === 'string' && updates.categoryId.trim()
				? updates.categoryId.trim()
				: existing.categoryId;
		const targetStatus =
			typeof updates.status === 'string' && updates.status.trim()
				? updates.status.trim()
				: existing.status;

		let availableBefore = 0;
		if (targetCategoryId) {
			availableBefore = await prisma.account.count({
				where: {
					categoryId: targetCategoryId,
					status: 'available'
				}
			});
		}

		const data = await prisma.account.update({
			where: { id },
			data: {
				...updates,
				...(updates.metadata && { metadata: JSON.parse(JSON.stringify(updates.metadata)) })
			}
		});

		if (targetCategoryId && targetStatus === 'available' && availableBefore === 0) {
			void triggerRestockNotificationsForTier(targetCategoryId).catch((error) => {
				console.error('Failed to trigger restock notifications:', error);
			});
		}

		invalidateAdminStatsCache();
		void sendLowStockAdminAlertIfNeeded('account_update').catch((error) => {
			console.error('Failed to evaluate low-stock alert after account update:', error);
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

// DELETE /api/accounts/[id] - Delete account
export async function DELETE({ params, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const id = params.id;

		const data = await prisma.account.delete({
			where: { id }
		});

		invalidateAdminStatsCache();
		void sendLowStockAdminAlertIfNeeded('account_delete').catch((error) => {
			console.error('Failed to evaluate low-stock alert after account delete:', error);
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
