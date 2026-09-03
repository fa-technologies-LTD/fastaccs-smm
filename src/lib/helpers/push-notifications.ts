import { env as publicEnv } from '$env/dynamic/public';

export function isPushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

export function getPushPermissionState(): NotificationPermission | 'unsupported' {
	if (!isPushSupported()) return 'unsupported';
	return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

const PUSH_STEP_TIMEOUT_MS = 20_000;

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), PUSH_STEP_TIMEOUT_MS);
			})
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function saveSubscription(subscription: PushSubscription): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PUSH_STEP_TIMEOUT_MS);

	try {
		return await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subscription: subscription.toJSON() }),
			signal: controller.signal
		});
	} finally {
		clearTimeout(timer);
	}
}

export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
	if (!isPushSupported()) {
		return { success: false, error: 'Push notifications are not supported on this device.' };
	}

	const publicKey = publicEnv.PUBLIC_VAPID_PUBLIC_KEY;
	if (!publicKey) {
		return { success: false, error: 'Push notifications are not configured.' };
	}

	try {
		const permission = await withTimeout(
			Notification.requestPermission(),
			'The browser did not finish the notification request. Check this site’s notification permission and try again.'
		);
		if (permission !== 'granted') {
			return {
				success: false,
				error: 'Notifications are blocked. Allow them in your browser settings, then try again.'
			};
		}

		const registration = await withTimeout(
			navigator.serviceWorker.register('/push-worker.js'),
			'Notification setup took too long. Please try again.'
		);
		const existingSubscription = await withTimeout(
			registration.pushManager.getSubscription(),
			'Could not check your current notification setup. Please try again.'
		);
		const subscription =
			existingSubscription ??
			(await withTimeout(
				registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
				}),
				'Notification setup took too long. Please try again.'
			));

		const response = await saveSubscription(subscription);
		if (!response.ok) {
			return {
				success: false,
				error: 'We could not save this notification setup. Please try again.'
			};
		}

		return { success: true };
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			return { success: false, error: 'Notification setup timed out. Please try again.' };
		}

		return {
			success: false,
			error:
				error instanceof Error && error.message
					? error.message
					: 'Could not enable notifications. Please try again.'
		};
	}
}

export async function unsubscribeFromPush(): Promise<void> {
	if (!isPushSupported()) return;

	const registration = await navigator.serviceWorker.getRegistration('/push-worker.js');
	const subscription = await registration?.pushManager.getSubscription();
	if (!subscription) return;

	const endpoint = subscription.endpoint;
	await subscription.unsubscribe();
	await fetch('/api/push/unsubscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ endpoint })
	}).catch(() => {});
}
