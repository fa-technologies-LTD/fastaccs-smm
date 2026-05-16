import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

const AFFILIATE_NOTIFICATION_TYPES = [
	'affiliate_unlock',
	'affiliate_store_credit',
	'affiliate_referral_signup',
	'affiliate_payout'
] as const;

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = await request.json().catch(() => ({}));
	const notificationId = String(payload?.notificationId || '').trim();
	const markAll = Boolean(payload?.markAll);
	const now = new Date();

	if (markAll) {
		await prisma.notification.updateMany({
			where: {
				userId: locals.user.id,
				type: { in: [...AFFILIATE_NOTIFICATION_TYPES] },
				read: false
			},
			data: {
				read: true,
				readAt: now
			}
		});
		return json({ success: true });
	}

	if (!notificationId) {
		return json({ success: false, error: 'notificationId is required' }, { status: 400 });
	}

	const result = await prisma.notification.updateMany({
		where: {
			id: notificationId,
			userId: locals.user.id,
			type: { in: [...AFFILIATE_NOTIFICATION_TYPES] }
		},
		data: {
			read: true,
			readAt: now
		}
	});

	if (result.count === 0) {
		return json({ success: false, error: 'Notification not found' }, { status: 404 });
	}

	return json({ success: true });
};
