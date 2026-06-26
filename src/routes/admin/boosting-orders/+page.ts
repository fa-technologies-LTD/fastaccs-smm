import type { PageLoad } from './$types';

const DEFAULT_STATS = {
	total_orders: 0,
	pending_fulfillment: 0,
	in_progress_fulfillment: 0,
	completed_fulfillment: 0,
	total_revenue: 0,
	todays_revenue: 0,
	this_month_revenue: 0
};

export const load: PageLoad = async ({ fetch }) => {
	let items: any[] = [];
	let error: string | null = null;

	try {
		const response = await fetch('/api/admin/boosting-orders');
		const result = await response.json();

		if (!response.ok) {
			error = result.error || 'Failed to load boosting orders';
		} else {
			items = result.data || [];
		}
	} catch (err) {
		console.error('Failed to load boosting orders:', err);
		error = 'Failed to load boosting orders';
	}

	let stats = DEFAULT_STATS;
	try {
		const statsResponse = await fetch('/api/orders/stats');
		if (statsResponse.ok) {
			const statsResult = await statsResponse.json();
			stats = statsResult.boostingData || DEFAULT_STATS;
		}
	} catch (err) {
		console.error('Failed to load boosting stats:', err);
	}

	return { items, stats, error };
};
