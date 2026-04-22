import { getOrders } from '$lib/services/orders';

export const load = async ({ fetch }) => {
	const result = await getOrders({}, fetch);
	const error =
		typeof result.error === 'string'
			? result.error
			: result.error && typeof result.error === 'object' && 'message' in result.error
				? String(result.error.message)
				: null;

	return {
		orders: result.data || [],
		error
	};
};
