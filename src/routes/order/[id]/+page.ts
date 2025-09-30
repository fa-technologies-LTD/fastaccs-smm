import { getTierOrderDetails } from '$lib/services/orders';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const orderId = params.id;

	if (!orderId) {
		throw error(404, 'Order not found');
	}

	const orderDetails = await getTierOrderDetails(orderId);

	if (!orderDetails) {
		throw error(404, 'Order not found');
	}

	return {
		order: orderDetails
	};
};