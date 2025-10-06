import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET /api/orders/[id] - Get specific order
export async function GET({ params }) {
	try {
		const data = await prisma.order.findUnique({
			where: { id: params.id },
			include: {
				orderItems: {
					include: {
						accounts: true
					}
				},
				user: true
			}
		});

		if (!data) {
			return json({ data: null, error: 'Order not found' }, { status: 404 });
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

// PATCH /api/orders/[id] - Update order
export async function PATCH({ params, request }) {
	try {
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
}

// DELETE /api/orders/[id] - Delete order
export async function DELETE({ params }) {
	try {
		// First delete related order items
		await prisma.orderItem.deleteMany({
			where: { orderId: params.id }
		});

		// Then delete the order
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
}
