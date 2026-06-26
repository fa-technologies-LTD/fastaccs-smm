import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { prisma } from '$lib/prisma';

export interface PushPayload {
	title: string;
	body: string;
	url?: string;
}

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
	if (vapidConfigured) return true;

	const publicKey = publicEnv.PUBLIC_VAPID_PUBLIC_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;
	const subject = env.VAPID_SUBJECT;

	if (!publicKey || !privateKey || !subject) {
		return false;
	}

	webpush.setVapidDetails(subject, publicKey, privateKey);
	vapidConfigured = true;
	return true;
}

export async function saveSubscription(
	userId: string,
	subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
	userAgent?: string | null
): Promise<void> {
	await prisma.pushSubscription.upsert({
		where: { endpoint: subscription.endpoint },
		create: {
			userId,
			endpoint: subscription.endpoint,
			p256dh: subscription.keys.p256dh,
			auth: subscription.keys.auth,
			userAgent: userAgent ?? null
		},
		update: {
			userId,
			p256dh: subscription.keys.p256dh,
			auth: subscription.keys.auth,
			userAgent: userAgent ?? null
		}
	});
}

export async function removeSubscription(endpoint: string): Promise<void> {
	await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
	if (!ensureVapidConfigured()) return;

	const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
	if (subscriptions.length === 0) return;

	await Promise.all(subscriptions.map((sub) => deliver(sub, payload)));
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
	if (!ensureVapidConfigured() || userIds.length === 0) return;

	const subscriptions = await prisma.pushSubscription.findMany({
		where: { userId: { in: userIds } }
	});
	if (subscriptions.length === 0) return;

	await Promise.all(subscriptions.map((sub) => deliver(sub, payload)));
}

async function deliver(
	sub: { endpoint: string; p256dh: string; auth: string },
	payload: PushPayload
): Promise<void> {
	try {
		await webpush.sendNotification(
			{
				endpoint: sub.endpoint,
				keys: { p256dh: sub.p256dh, auth: sub.auth }
			},
			JSON.stringify(payload)
		);
	} catch (error) {
		const statusCode = (error as { statusCode?: number }).statusCode;
		if (statusCode === 404 || statusCode === 410) {
			await removeSubscription(sub.endpoint).catch(() => {});
		} else {
			console.error('Push delivery failed:', error);
		}
	}
}
