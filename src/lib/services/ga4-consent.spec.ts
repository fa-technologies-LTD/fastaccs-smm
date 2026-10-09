import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
import { getGa4ClientId, shouldTrackBrowserGa4Purchase } from './ga4';
import { COOKIE_CONSENT_KEY, readCookieConsent } from '$lib/helpers/privacyConsent';

describe('GA4 checkout client-id consent', () => {
	const storage = { getItem: vi.fn(), removeItem: vi.fn() };
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('window', { localStorage: storage });
		vi.stubGlobal('document', { cookie: '_ga=GA1.1.123.456' });
		storage.getItem.mockReturnValue(
			JSON.stringify({ level: 'analytics', savedAt: Date.now() - 1000, version: 1 })
		);
	});
	afterEach(() => vi.unstubAllGlobals());
	it('captures the client id only with current analytics consent', () => {
		expect(getGa4ClientId()).toBe('123.456');
		expect(storage.getItem).toHaveBeenCalledWith(COOKIE_CONSENT_KEY);
	});
	it.each(['necessary', null])('does not reuse an old cookie after consent becomes %s', (level) => {
		storage.getItem.mockReturnValue(
			level ? JSON.stringify({ level, savedAt: Date.now(), version: 1 }) : null
		);
		expect(getGa4ClientId()).toBeNull();
	});
	it.each([Date.now() - 181 * 86400000, Date.now() + 86400000])(
		'rejects expired or future-dated consent (%s)',
		(savedAt) => {
			storage.getItem.mockReturnValue(JSON.stringify({ level: 'analytics', savedAt, version: 1 }));
			expect(getGa4ClientId()).toBeNull();
		}
	);
	it('fails closed without breaking checkout when browser storage is blocked', () => {
		storage.getItem.mockImplementation(() => {
			throw new Error('SecurityError');
		});
		expect(readCookieConsent()).toBeNull();
		expect(getGa4ClientId()).toBeNull();
	});
	it('ignores a malformed encoded GA cookie instead of throwing', () => {
		vi.stubGlobal('document', { cookie: '_ga=%E0%A4%A' });
		expect(getGa4ClientId()).toBeNull();
	});
	it('does not emit browser purchases for server-managed orders, even if one source is lost', () => {
		expect(shouldTrackBrowserGa4Purchase('server', undefined)).toBe(false);
		expect(shouldTrackBrowserGa4Purchase(undefined, 'server')).toBe(false);
		expect(shouldTrackBrowserGa4Purchase('browser', 'browser')).toBe(true);
		expect(shouldTrackBrowserGa4Purchase(undefined, undefined)).toBe(true);
	});
});
