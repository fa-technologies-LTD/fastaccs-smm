import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// POST /api/admin/cleanup/allocated-accounts - Reset orphaned allocated accounts
export async function POST({ locals }) {
	// Admin only endpoint
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Find accounts that are allocated but their orders are not in processing/completed state
		const orphanedAccounts = await prisma.account.findMany({
			where: {
				status: 'allocated',
				OR: [
					{ orderItemId: null }, // No order item linked
					{
						orderItem: {
							order: {
								status: { notIn: ['pending', 'completed'] } // Order not in valid processing state
							}
						}
					}
				]
			},
			include: {
				orderItem: {
					include: {
						order: true
					}
				}
			}
		});

		if (orphanedAccounts.length === 0) {
			return json({
				message: 'No orphaned allocated accounts found',
				accountsReset: 0
			});
		}

		// Reset orphaned accounts to available
		const resetResult = await prisma.account.updateMany({
			where: {
				id: { in: orphanedAccounts.map((acc) => acc.id) }
			},
			data: {
				status: 'available',
				orderItemId: null
			}
		});

		return json({
			message: `Successfully reset ${resetResult.count} orphaned allocated accounts`,
			accountsReset: resetResult.count,
			details: orphanedAccounts.map((acc) => ({
				accountId: acc.id,
				platform: acc.platform,
				orderStatus: acc.orderItem?.order?.status || 'no-order',
				orderId: acc.orderItem?.orderId || null
			}))
		});
	} catch (error) {
		console.error('Cleanup error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Cleanup failed' },
			{ status: 500 }
		);
	}
}
