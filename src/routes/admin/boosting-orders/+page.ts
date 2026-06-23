import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/admin/boosting-orders');
		const result = await response.json();

		if (!response.ok) {
			return {
				items: [],
				error: result.error || 'Failed to load boosting orders'
			};
		}

		return {
			items: result.data || [],
			error: null
		};
	} catch (error) {
		console.error('Failed to load boosting orders:', error);
		return {
			items: [],
			error: 'Failed to load boosting orders'
		};
	}
};
