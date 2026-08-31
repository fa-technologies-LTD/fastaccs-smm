import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { recordAffiliateEvent } from '$lib/services/affiliate-events';

// Mark notifications read for the bell (all types — the feed is universal now).
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
			where: { userId: locals.user.id, read: false },
			data: { read: true, readAt: now }
		});
		return json({ success: true });
	}

	if (!notificationId) {
		return json({ success: false, error: 'notificationId is required' }, { status: 400 });
	}
	const notification = await prisma.notification.findFirst({
		where: { id: notificationId, userId: locals.user.id },
		select: { id: true, type: true }
	});
	if (!notification) {
		return json({ success: false, error: 'Notification not found' }, { status: 404 });
	}

	const result = await prisma.notification.updateMany({
		where: { id: notificationId, userId: locals.user.id },
		data: { read: true, readAt: now }
	});

	if (result.count > 0 && notification.type.startsWith('affiliate_')) {
		await recordAffiliateEvent({
			type: 'affiliate_notification_opened',
			dedupeKey: `affiliate:notification_opened:${notification.id}`,
			affiliateUserId: locals.user.id,
			source: 'notification_bell',
			metadata: { notificationType: notification.type }
		});
	}

	return json({ success: true });
};
