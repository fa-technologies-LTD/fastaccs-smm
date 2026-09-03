import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_VAPID_PUBLIC_KEY: 'AQ' }
}));

import { subscribeToPush } from './push-notifications';

const subscription = {
	endpoint: 'https://push.example/subscription',
	toJSON: () => ({
		endpoint: 'https://push.example/subscription',
		keys: { p256dh: 'public-key', auth: 'auth-key' }
	})
};

function installBrowserMocks(options: {
	permission?: Promise<NotificationPermission>;
	existingSubscription?: typeof subscription | null;
}) {
	const requestPermission = vi.fn(
		() => options.permission ?? Promise.resolve<NotificationPermission>('granted')
	);
	const subscribe = vi.fn().mockResolvedValue(subscription);
	const getSubscription = vi.fn().mockResolvedValue(options.existingSubscription ?? null);
	const register = vi.fn().mockResolvedValue({
		pushManager: { getSubscription, subscribe }
	});
	const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

	vi.stubGlobal('window', { PushManager: function PushManager() {}, Notification: {} });
	vi.stubGlobal('navigator', { serviceWorker: { register } });
	vi.stubGlobal('Notification', { permission: 'default', requestPermission });
	vi.stubGlobal('fetch', fetchMock);

	return { requestPermission, subscribe, getSubscription, register, fetchMock };
}

describe('subscribeToPush', () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('reuses an existing browser subscription and saves it to FastAccs', async () => {
		const mocks = installBrowserMocks({ existingSubscription: subscription });

		await expect(subscribeToPush()).resolves.toEqual({ success: true });
		expect(mocks.subscribe).not.toHaveBeenCalled();
		expect(mocks.fetchMock).toHaveBeenCalledWith(
			'/api/push/subscribe',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('turns a browser rejection into a useful result instead of throwing', async () => {
		installBrowserMocks({
			permission: Promise.reject(new Error('Browser permission API failed'))
		});

		await expect(subscribeToPush()).resolves.toEqual({
			success: false,
			error: 'Browser permission API failed'
		});
	});

	it('times out a notification permission request that never settles', async () => {
		vi.useFakeTimers();
		installBrowserMocks({ permission: new Promise<NotificationPermission>(() => {}) });
		const resultPromise = subscribeToPush();

		await vi.advanceTimersByTimeAsync(20_001);
		await expect(resultPromise).resolves.toEqual({
			success: false,
			error:
				'The browser did not finish the notification request. Check this site’s notification permission and try again.'
		});
	});
});
