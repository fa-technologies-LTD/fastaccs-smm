import { getOrders } from '$lib/services/orders';

export const load = async () => {
	const result = await getOrders();

	return {
		orders: result.data || [],
		error: result.error?.message || null
	};
};
