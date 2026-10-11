import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ consent: true, environment: { browser: true, dev: false } }));
vi.mock('$app/environment', () => mocks.environment);
vi.mock('$lib/helpers/privacyConsent', () => ({ hasAnalyticsConsent: () => mocks.consent }));
import { recordAnalyticsEvent, recordAnalyticsPurchase } from './analytics-events';
import { isProductionTrackingHost } from '$lib/helpers/tracking-host';

let values: Map<string, string>;
beforeEach(() => {
	mocks.consent = true;
	mocks.environment.browser = true;
	mocks.environment.dev = false;
	values = new Map();
	vi.stubGlobal('window', { location: { hostname: 'smm.fastaccs.com' } });
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value)
	});
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => vi.unstubAllGlobals());
it('records first-party events without Snapchat and strips query strings containing private data', () => {
	expect(recordAnalyticsEvent('page_view', '/checkout/verify?reference=private-token#secret')).toBe(
		true
	);
	expect(fetch).toHaveBeenCalledWith(
		'/api/analytics/event',
		expect.objectContaining({
			body: JSON.stringify({ type: 'page_view', path: '/checkout/verify' }),
			keepalive: true
		})
	);
});
it('records the Boosting view, cart, checkout and verified-purchase funnel independently', () => {
	for (const type of ['view_content', 'add_cart', 'start_checkout'] as const)
		expect(recordAnalyticsEvent(type, '/services/tiktok/likes')).toBe(true);
	expect(recordAnalyticsPurchase('verified-order')).toBe(true);
	expect(
		vi.mocked(fetch).mock.calls.map((call) => JSON.parse(call[1]!.body as string).type)
	).toEqual(['view_content', 'add_cart', 'start_checkout', 'purchase']);
});
it('fails closed without consent and allows recording after consent is granted', () => {
	mocks.consent = false;
	expect(recordAnalyticsEvent('page_view', '/services')).toBe(false);
	expect(recordAnalyticsPurchase('order')).toBe(false);
	expect(fetch).not.toHaveBeenCalled();
	expect(values.size).toBe(0);
	mocks.consent = true;
	expect(recordAnalyticsPurchase('order')).toBe(true);
});
it('blocks localhost, previews, unrelated hosts and SSR even with consent', () => {
	for (const hostname of [
		'localhost',
		'127.0.0.1',
		'::1',
		'0.0.0.0',
		'preview.vercel.app',
		'fastaccs.com.attacker.invalid'
	]) {
		window.location.hostname = hostname;
		expect(isProductionTrackingHost()).toBe(false);
		expect(recordAnalyticsEvent('page_view', '/')).toBe(false);
	}
	window.location.hostname = 'smm.fastaccs.com';
	mocks.environment.dev = true;
	expect(recordAnalyticsEvent('page_view', '/')).toBe(false);
	mocks.environment.dev = false;
	mocks.environment.browser = false;
	expect(recordAnalyticsEvent('page_view', '/')).toBe(false);
	expect(fetch).not.toHaveBeenCalled();
});
it('does not track admin/API visits or external paths', () => {
	for (const path of [
		'/admin',
		'/admin/boosting-orders',
		'/api/orders',
		'//external.invalid/',
		'https://external.invalid/'
	])
		expect(recordAnalyticsEvent('page_view', path)).toBe(false);
	expect(fetch).not.toHaveBeenCalled();
});
it('does not count a verified purchase again after a return to its verification page', () => {
	expect(recordAnalyticsPurchase('order')).toBe(true);
	expect(recordAnalyticsPurchase('order')).toBe(false);
	expect(recordAnalyticsPurchase('other-order')).toBe(true);
	expect(fetch).toHaveBeenCalledTimes(2);
});
it('makes storage and network failures harmless to checkout', () => {
	vi.stubGlobal('localStorage', {
		getItem: () => {
			throw new Error('denied');
		},
		setItem: () => {
			throw new Error('denied');
		}
	});
	expect(recordAnalyticsPurchase('order')).toBe(true);
	vi.mocked(fetch).mockImplementation(() => {
		throw new Error('blocked');
	});
	expect(recordAnalyticsEvent('page_view', '/services')).toBe(false);
});
it('keeps purchase dedup storage bounded and tolerates invalid old values', () => {
	values.set('fa_analytics_purchases', '{}');
	for (let i = 0; i < 55; i++) recordAnalyticsPurchase(`order-${i}`);
	expect(JSON.parse(values.get('fa_analytics_purchases')!)).toHaveLength(50);
});
