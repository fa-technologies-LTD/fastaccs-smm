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

export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
	if (!isPushSupported()) {
		return { success: false, error: 'Push notifications are not supported on this device.' };
	}

	const publicKey = publicEnv.PUBLIC_VAPID_PUBLIC_KEY;
	if (!publicKey) {
		return { success: false, error: 'Push notifications are not configured.' };
	}

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		return { success: false, error: 'Notification permission was not granted.' };
	}

	const registration = await navigator.serviceWorker.register('/push-worker.js');
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
	});

	const response = await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ subscription: subscription.toJSON() })
	});

	if (!response.ok) {
		return { success: false, error: 'Could not save subscription on the server.' };
	}

	return { success: true };
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
