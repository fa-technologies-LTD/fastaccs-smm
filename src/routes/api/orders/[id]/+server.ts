import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

// GET /api/orders/[id] - Get specific order
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user) {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const data = await prisma.order.findUnique({
			where: { id: params.id },
			include: {
				orderItems: {
					include: {
						accounts: true,
						category: true
					}
				},
				user: true
			}
		});

		if (!data) {
			return json({ data: null, error: 'Order not found' }, { status: 404 });
		}

		const isAdmin = locals.user.userType === 'ADMIN';
		if (!isAdmin && data.userId !== locals.user.id) {
			return json({ data: null, error: 'Forbidden' }, { status: 403 });
		}

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

// PATCH /api/orders/[id] - Update order
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const updateData = await request.json();

		const data = await prisma.order.update({
			where: { id: params.id },
			data: {
				...updateData,
				updatedAt: new Date()
			},
			include: {
				orderItems: true,
				user: true
			}
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

// DELETE /api/orders/[id] - Delete order
export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		// First, release any allocated accounts back to available
		await prisma.account.updateMany({
			where: {
				orderItem: { orderId: params.id },
				status: { in: ['allocated'] } // Only reset allocated accounts, not delivered ones
			},
			data: {
				status: 'available',
				orderItemId: null
			}
		});

		// Then delete related order items
		await prisma.orderItem.deleteMany({
			where: { orderId: params.id }
		});

		// Finally delete the order
		const data = await prisma.order.delete({
			where: { id: params.id }
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
