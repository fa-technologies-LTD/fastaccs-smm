import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { getAffiliateDashboardState } from '$lib/services/affiliate';

const AFFILIATE_NOTIFICATION_TYPES = [
	'affiliate_unlock',
	'affiliate_store_credit',
	'affiliate_referral_signup',
	'affiliate_payout'
] as const;

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const dashboard = await getAffiliateDashboardState(locals.user.id);
	const canShowBell = Boolean(dashboard.unlocked || dashboard.isActive);
	if (!canShowBell) {
		return json({
			success: true,
			data: {
				canShowBell: false,
				unreadCount: 0,
				notifications: []
			}
		});
	}

	const requestedLimit = Number(url.searchParams.get('limit') || 20);
	const limit = Number.isFinite(requestedLimit)
		? Math.max(1, Math.min(50, Math.floor(requestedLimit)))
		: 20;

	const [notifications, unreadCount] = await Promise.all([
		prisma.notification.findMany({
			where: {
				userId: locals.user.id,
				type: { in: [...AFFILIATE_NOTIFICATION_TYPES] }
			},
			select: {
				id: true,
				type: true,
				title: true,
				message: true,
				read: true,
				readAt: true,
				createdAt: true
			},
			orderBy: { createdAt: 'desc' },
			take: limit
		}),
		prisma.notification.count({
			where: {
				userId: locals.user.id,
				type: { in: [...AFFILIATE_NOTIFICATION_TYPES] },
				read: false
			}
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
