import type { PageServerLoad } from './$types';
import {
	getRecentActivityFeed,
	getDashboardIssues,
	type RecentActivityItem,
	type DashboardIssues
} from '$lib/services/admin-dashboard';

export const load: PageServerLoad = async () => {
	try {
		const [recentActivity, dashboardIssues] = await Promise.all([
			getRecentActivityFeed(),
			getDashboardIssues()
		]);

		return { recentActivity, dashboardIssues };
	} catch (err) {
		console.error('Error loading admin dashboard activity/issues:', err);
		return {
			recentActivity: [] as RecentActivityItem[],
			dashboardIssues: { failedEmails: [], unhealthyJobs: [] } as DashboardIssues
		};
	}
};
