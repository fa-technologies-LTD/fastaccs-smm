import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

// The universal activity feed behind the bell — every signed-in user, ALL notification types
// (code arrived, order ready, store credit, affiliate, new login…). (Kept at this path for the
// existing bell client; it is no longer affiliate-only.)
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const requestedLimit = Number(url.searchParams.get('limit') || 20);
	const summaryOnly = url.searchParams.get('summary') === '1';
	const cursor = String(url.searchParams.get('cursor') || '').trim() || null;
	const limit = Number.isFinite(requestedLimit)
		? Math.max(1, Math.min(50, Math.floor(requestedLimit)))
		: 20;

	const notReadHidden = { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };

	const [notificationRows, unreadCount] = await Promise.all([
		summaryOnly
			? Promise.resolve([])
			: prisma.notification.findMany({
					where: { userId: locals.user.id, ...notReadHidden },
					select: {
						id: true,
						type: true,
						title: true,
						message: true,
						read: true,
						readAt: true,
						createdAt: true,
						orderId: true
					},
					orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
					...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
					take: limit + 1
				}),
		prisma.notification.count({
			where: { userId: locals.user.id, read: false, ...notReadHidden }
		})
	]);
	const hasMore = notificationRows.length > limit;
	const notifications = hasMore ? notificationRows.slice(0, limit) : notificationRows;

	return json({
		success: true,
		data: {
			canShowBell: true,
			unreadCount,
			notifications,
			nextCursor: hasMore ? notifications.at(-1)?.id || null : null
		}
	});
};
