import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ record: vi.fn(), afterNavigate: null as (() => void) | null }));
vi.mock('$app/navigation', () => ({
	afterNavigate: (handler: () => void) => {
		mocks.afterNavigate = handler;
	},
	onNavigate: vi.fn()
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://smm.fastaccs.com/services'), route: { id: '/services' }, data: {} }
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/services/analytics-events', () => ({ recordAnalyticsEvent: mocks.record }));
vi.mock('$lib/services/ga4', () => ({
	syncGa4Consent: vi.fn(),
	trackGa4PageView: vi.fn().mockReturnValue(true)
}));
vi.mock('$lib/components/ToastContainer.svelte', () => ({ default: () => {} }));
vi.mock('$lib/components/PageLoadingBar.svelte', () => ({ default: () => {} }));
vi.mock('$lib/components/CookieConsentBar.svelte', () => ({ default: () => {} }));
vi.mock('$lib/components/SitePopupHost.svelte', () => ({ default: () => {} }));
vi.mock('$lib/components/PushNotificationPrompt.svelte', () => ({ default: () => {} }));
import Layout from './+layout.svelte';
import { PRIVACY_CONSENT_CHANGED_EVENT } from '$lib/helpers/privacyConsent';
beforeEach(() => {
	vi.clearAllMocks();
	mocks.record.mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());
const mount = () =>
	render(Layout, {
		data: {},
		children: createRawSnippet(() => ({ render: () => '<div>Test shop</div>' }))
	} as never);
it('records page and confirmed visits without Snap, deduplicating mount and navigation', async () => {
	mount();
	await expect.poll(() => mocks.record.mock.calls.length).toBe(2);
	expect(mocks.record.mock.calls.map((c) => c[0])).toEqual(['page_view', 'confirmed_visit']);
	mocks.afterNavigate?.();
	expect(mocks.record).toHaveBeenCalledTimes(2);
});
it('can record the current visit after consent is granted without treating denied calls as sent', async () => {
	mocks.record.mockReturnValue(false);
	mount();
	await expect.poll(() => mocks.record.mock.calls.length).toBe(2);
	mocks.record.mockReturnValue(true);
	window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_CHANGED_EVENT));
	await expect.poll(() => mocks.record.mock.calls.length).toBe(4);
	window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_CHANGED_EVENT));
	expect(mocks.record).toHaveBeenCalledTimes(4);
});
