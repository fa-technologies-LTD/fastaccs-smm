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
	const limit = Number.isFinite(requestedLimit)
		? Math.max(1, Math.min(50, Math.floor(requestedLimit)))
		: 20;

	const notReadHidden = { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };

	const [notifications, unreadCount] = await Promise.all([
		prisma.notification.findMany({
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
			orderBy: { createdAt: 'desc' },
			take: limit
		}),
		prisma.notification.count({
			where: { userId: locals.user.id, read: false, ...notReadHidden }
		})
	]);

	return json({
		success: true,
		data: {
			canShowBell: true,
			unreadCount,
			notifications
		}
	});
};
