import { getOrderById, getOrderItems } from '$lib/services/orders';
import { error } from '@sveltejs/kit';

export const load = async ({ params }: { params: { id: string } }) => {
	const orderId = params.id;

	// Load order details
	const orderResult = await getOrderById(orderId);
	if (orderResult.error || !orderResult.data) {
		throw error(404, 'Order not found');
	}

	// Load order items (allocated accounts)
	const itemsResult = await getOrderItems(orderId);

	return {
		order: orderResult.data,
		items: itemsResult.data || [],
		error: itemsResult.error?.message || null
	};
};
