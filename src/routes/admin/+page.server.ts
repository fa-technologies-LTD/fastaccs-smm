import type { PageServerLoad } from './$types';
import {
	getRecentActivityFeed,
	getDashboardIssues,
	type RecentActivityItem,
	type DashboardIssues
} from '$lib/services/admin-dashboard';
import {
	getNumbersDashboardSummary,
	type NumbersDashboardSummary
} from '$lib/services/phone-analytics';

const EMPTY_NUMBERS_SUMMARY: NumbersDashboardSummary = {
	totalRents: 0,
	receivedRents: 0,
	inFlightRents: 0,
	successRatePct: null,
	revenueNgn: 0,
	marginNgn: 0,
	hubBalanceCents: null,
	lowBalance: false
};

export const load: PageServerLoad = async () => {
	try {
		const [recentActivity, dashboardIssues, numbersSummary] = await Promise.all([
			getRecentActivityFeed(),
			getDashboardIssues(),
			getNumbersDashboardSummary()
		]);

		return { recentActivity, dashboardIssues, numbersSummary };
	} catch (err) {
		console.error('Error loading admin dashboard activity/issues:', err);
		return {
			recentActivity: [] as RecentActivityItem[],
			dashboardIssues: { failedEmails: [], unhealthyJobs: [] } as DashboardIssues,
			numbersSummary: EMPTY_NUMBERS_SUMMARY
		};
	}
};
