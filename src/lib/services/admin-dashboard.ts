import { prisma } from '$lib/prisma';

export type RecentActivityItem = {
	id: string;
	type: 'order' | 'signup' | 'admin_action';
	label: string;
	href: string | null;
	timestamp: Date;
};

export interface DashboardIssues {
	failedEmails: Array<{
		id: string;
		email: string;
		notificationType: string;
		errorMessage: string | null;
		failedAt: Date | null;
	}>;
	unhealthyJobs: Array<{
		id: string;
		jobName: string;
		status: string;
		errorSummary: string | null;
		startedAt: Date;
	}>;
}

export async function getRecentActivityFeed(limit = 10): Promise<RecentActivityItem[]> {
	const [orders, signups, adminActions] = await Promise.all([
		prisma.order.findMany({
			orderBy: { createdAt: 'desc' },
			take: 5,
			select: { id: true, orderNumber: true, status: true, createdAt: true }
		}),
		prisma.user.findMany({
			orderBy: { registeredAt: 'desc' },
			take: 5,
			select: { id: true, email: true, fullName: true, registeredAt: true }
		}),
		prisma.adminAuditLog.findMany({
			orderBy: { createdAt: 'desc' },
			take: 5,
			select: {
				id: true,
				description: true,
				targetUserId: true,
				createdAt: true
			}
		})
	]);

	const items: RecentActivityItem[] = [
		...orders.map((order) => ({
			id: `order-${order.id}`,
			type: 'order' as const,
			label: `New order ${order.orderNumber} — ${order.status}`,
			href: `/admin/orders/${order.id}`,
			timestamp: order.createdAt
		})),
		...signups.map((user) => ({
			id: `signup-${user.id}`,
			type: 'signup' as const,
			label: `New signup: ${user.fullName || user.email || 'Unknown user'}`,
			href: `/admin/users/${user.id}`,
			timestamp: user.registeredAt
		})),
		...adminActions.map((entry) => ({
			id: `admin-action-${entry.id}`,
			type: 'admin_action' as const,
			label: entry.description || 'Admin action',
			href: entry.targetUserId ? `/admin/users/${entry.targetUserId}` : null,
			timestamp: entry.createdAt
		}))
	];

	items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

	return items.slice(0, limit);
}

export async function getDashboardIssues(): Promise<DashboardIssues> {
	const [failedEmails, unhealthyJobs] = await Promise.all([
		prisma.emailNotification.findMany({
			where: { status: 'failed' },
			orderBy: { failedAt: 'desc' },
			take: 5,
			select: {
				id: true,
				email: true,
				notificationType: true,
				errorMessage: true,
				failedAt: true
			}
		}),
		prisma.automationJobRun.findMany({
			where: { status: { in: ['failed', 'unhealthy'] } },
			orderBy: { startedAt: 'desc' },
			take: 5,
			select: {
				id: true,
				jobName: true,
				status: true,
				errorSummary: true,
				startedAt: true
			}
		})
	]);

	return { failedEmails, unhealthyJobs };
}
