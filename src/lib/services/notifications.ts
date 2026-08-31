import { prisma } from '$lib/prisma';

/**
 * The user activity feed behind the notification bell. A notification earns its place only when it
 * tells the user something they'd want to know or act on — a code arrived, a refund landed, an
 * order is ready, a commission was earned, a new sign-in. Creation is ALWAYS best-effort: it must
 * never break the money/fulfillment path it's attached to.
 */

export type NotificationType =
	| 'code_arrived'
	| 'order_delivered'
	| 'store_credit'
	| 'new_login'
	| 'affiliate_unlock'
	| 'affiliate_store_credit'
	| 'affiliate_referral_signup'
	| 'affiliate_payout';

export function getNotificationActionUrl(type: string, orderId?: string | null): string | null {
	if (orderId) return `/order/${encodeURIComponent(orderId)}`;
	if (String(type || '').startsWith('affiliate_')) return '/dashboard?tab=affiliate';
	if (type === 'store_credit') return '/dashboard';
	return null;
}

export async function createUserNotification(input: {
	userId: string;
	type: NotificationType;
	title: string;
	message: string;
	orderId?: string | null;
	expiresAt?: Date | null;
}): Promise<void> {
	try {
		await prisma.notification.create({
			data: {
				userId: input.userId,
				type: input.type,
				title: input.title,
				message: input.message,
				orderId: input.orderId ?? null,
				expiresAt: input.expiresAt ?? null
			}
		});
	} catch (error) {
		console.error('[notifications] create failed:', (error as Error).message);
	}
}
