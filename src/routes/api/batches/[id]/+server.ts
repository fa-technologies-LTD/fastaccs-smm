import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';

// GET /api/batches/[id] - Get specific batch
export async function GET({ params, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const data = await prisma.accountBatch.findUnique({
			where: { id: params.id },
			include: {
				category: true,
				accounts: true
			}
		});

		if (!data) {
			return json(
				{ data: null, error: 'Batch not found' },
				{ status: 404 }
			);
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

// PATCH /api/batches/[id] - Update batch
export async function PATCH({ params, request, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const updateData = await request.json();

		const data = await prisma.accountBatch.update({
			where: { id: params.id },
			data: {
				...updateData,
				updatedAt: new Date()
			},
			include: {
				category: true,
				accounts: true
			}
		});

		invalidateAdminStatsCache();
		void sendLowStockAdminAlertIfNeeded('batch_update').catch((error) => {
			console.error('Failed to evaluate low-stock alert after batch update:', error);
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

// DELETE /api/batches/[id] - Delete batch
export async function DELETE({ params, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		// First delete related accounts
		await prisma.account.deleteMany({
			where: { batchId: params.id }
		});

		// Then delete the batch
		const data = await prisma.accountBatch.delete({
			where: { id: params.id }
		});

		invalidateAdminStatsCache();
		void sendLowStockAdminAlertIfNeeded('batch_delete').catch((error) => {
			console.error('Failed to evaluate low-stock alert after batch delete:', error);
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
