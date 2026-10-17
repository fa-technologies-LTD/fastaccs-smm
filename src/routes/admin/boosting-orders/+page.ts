import type { PageLoad } from './$types';
import type { getBoostingAnalytics } from '$lib/services/boosting-analytics';

const DEFAULT_META = {
	page: 1,
	pageSize: 25,
	total: 0,
	totalPages: 1,
	sort: 'newest',
	status: 'active',
	search: '',
	canRunShadowRouting: false,
	activeCount: 0,
	overdueCount: 0,
	totalItems: 0,
	statusCounts: {
		pending: 0,
		in_progress: 0,
		needs_link: 0,
		under_review: 0,
		partial: 0,
		cancelled: 0,
		completed: 0,
		rejected: 0
	}
};

export const load: PageLoad = async ({ fetch }) => {
	let items: any[] = [];
	let meta = DEFAULT_META;
	let error: string | null = null;

	try {
		const response = await fetch(
			'/api/admin/boosting-orders?status=active&sort=newest&page=1&pageSize=25'
		);
		const result = await response.json();

		if (!response.ok) {
			error = result.error || 'Failed to load boosting orders';
		} else {
			items = result.data || [];
			meta = result.meta || DEFAULT_META;
		}
	} catch (err) {
		console.error('Failed to load boosting orders:', err);
		error = 'Failed to load boosting orders';
	}

	let analytics: Awaited<ReturnType<typeof getBoostingAnalytics>> | null = null;
	let analyticsError: string | null = null;
	try {
		const response = await fetch('/api/admin/boosting-orders/analytics');
		const result = await response.json();
		if (response.ok && result.success) analytics = result.data;
		else analyticsError = 'Analytics unavailable. Order management is still available.';
	} catch {
		analyticsError = 'Analytics unavailable. Order management is still available.';
	}

	return { items, meta, error, analytics, analyticsError };
};
