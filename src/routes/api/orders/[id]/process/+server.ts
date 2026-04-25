import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';

// POST /api/orders/[id]/process - Process order (allocate accounts)
export const POST: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const orderId = params.id;
		const allocationResult = await allocateAccountsForOrder(orderId);
		if (!allocationResult.success) {
			const errorMessage = allocationResult.error || 'Failed to process order';
			if (errorMessage === 'Order not found') {
				return json({ error: errorMessage }, { status: 404 });
			}
			if (errorMessage === 'Order already processed') {
				return json({ error: errorMessage }, { status: 409 });
			}
			return json({ error: errorMessage }, { status: 400 });
		}

		const updatedOrder = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
				orderItems: {
					include: {
						accounts: true
					}
				},
				user: true
			}
		});
		if (!updatedOrder) {
			return json({ error: 'Order not found after processing' }, { status: 404 });
		}

		return json({
			data: updatedOrder,
			allocation: allocationResult.data || [],
			message: 'Accounts allocated successfully. Use /deliver endpoint to send to customer.',
			error: null
		});
	} catch (error) {
		console.error('Database error during order processing:', error);

		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
