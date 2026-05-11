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
			const nextData: Record<string, unknown> = { ...updateData };
			const normalizedStatus =
				typeof updateData?.status === 'string' && updateData.status.trim()
					? updateData.status.trim().toLowerCase()
					: typeof updateData?.importStatus === 'string' && updateData.importStatus.trim()
						? updateData.importStatus.trim().toLowerCase()
						: null;

			const descriptorsSource =
				updateData?.descriptors && typeof updateData.descriptors === 'object'
					? updateData.descriptors
					: updateData?.metadata && typeof updateData.metadata === 'object'
						? updateData.metadata
						: null;
			if (descriptorsSource) {
				nextData.descriptors = { ...(descriptorsSource as Record<string, unknown>) };
			}
			if (normalizedStatus) {
				nextData.importStatus = normalizedStatus;
				const nextDescriptors =
					nextData.descriptors && typeof nextData.descriptors === 'object'
						? { ...(nextData.descriptors as Record<string, unknown>) }
						: {};
				nextDescriptors.status = normalizedStatus;
				nextData.descriptors = nextDescriptors;
			}
			delete nextData.status;
			delete nextData.metadata;

			const data = await prisma.accountBatch.update({
				where: { id: params.id },
				data: {
					...nextData,
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

		const statusCounts = await prisma.account.groupBy({
			by: ['status'],
			where: { batchId: params.id },
			_count: { _all: true }
		});
		const byStatus = new Map(statusCounts.map((row) => [row.status, row._count._all]));
		const allocatedCount = byStatus.get('allocated') || 0;
		const deliveredCount = byStatus.get('delivered') || 0;
		const nonAvailableCount = statusCounts
			.filter((row) => row.status !== 'available')
			.reduce((sum, row) => sum + row._count._all, 0);

		if (allocatedCount > 0 || deliveredCount > 0) {
			return json(
				{
					data: null,
					error: `Batch recall blocked. ${allocatedCount} allocated and ${deliveredCount} delivered account(s) detected. Only fully available batches can be recalled.`,
					code: 'BATCH_RECALL_BLOCKED_ALLOCATED_OR_DELIVERED'
				},
				{ status: 409 }
			);
		}

		if (nonAvailableCount > 0) {
			return json(
				{
					data: null,
					error: `Batch recall blocked. ${nonAvailableCount} account(s) are not available. Recall/delete is allowed only when every account in the batch is available.`,
					code: 'BATCH_RECALL_BLOCKED_NOT_FULLY_AVAILABLE'
				},
				{ status: 409 }
			);
		}

		// Delete related accounts only after safety checks pass.
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
