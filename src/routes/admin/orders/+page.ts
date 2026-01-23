import { getOrders } from '$lib/services/orders';

export const load = async ({ fetch }) => {
	const result = await getOrders({}, fetch);

	return {
		orders: result.data || [],
		error: result.error?.message || null
	};
};
