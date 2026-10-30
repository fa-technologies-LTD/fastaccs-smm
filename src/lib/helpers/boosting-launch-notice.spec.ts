import { afterEach, expect, it, vi } from 'vitest';
import { canShowBoostingLaunchNotice } from './boosting-launch-notice';

afterEach(() => vi.unstubAllGlobals());

it.each(['/', '/services', '/platforms', '/dashboard', '/numbers', '/blog/guide'])(
	'permits the browsing page %s',
	(path) => expect(canShowBoostingLaunchNotice(path)).toBe(true)
);
it.each([
	'/services/instagram',
	'/platforms/x',
	'/numbers/whatsapp/kenya',
	'/checkout',
	'/order/123',
	'/admin',
	'/admin/prices',
	'/login',
	'/auth/login',
	'/numbers/order/123'
])('keeps pop-ups off the buying page %s', (path) =>
	expect(canShowBoostingLaunchNotice(path)).toBe(false)
);

it('remembers an actual impression in local storage and session fallback without network writes', async () => {
	vi.resetModules();
	const localStorage = new Map<string, string>(),
		sessionStorage = new Map<string, string>();
	const storage = (map: Map<string, string>) => ({
		getItem: (key: string) => map.get(key),
		setItem: (key: string, value: string) => map.set(key, value)
	});
	vi.stubGlobal('window', {
		localStorage: storage(localStorage),
		sessionStorage: storage(sessionStorage)
	});
	const notice = await import('./boosting-launch-notice');
	expect(notice.hasSeenBoostingLaunchNotice()).toBe(false);
	notice.markBoostingLaunchNoticeSeen();
	expect(localStorage.get(notice.BOOSTING_LAUNCH_NOTICE_KEY)).toBe('1');
	expect(sessionStorage.get(notice.BOOSTING_LAUNCH_NOTICE_KEY)).toBe('1');
	vi.resetModules();
	expect((await import('./boosting-launch-notice')).hasSeenBoostingLaunchNotice()).toBe(true);
});

it('does not break browsing or repeat during the visit when browser storage is blocked', async () => {
	vi.resetModules();
	vi.stubGlobal('window', {
		get localStorage() {
			throw new Error('Storage blocked');
		},
		get sessionStorage() {
			throw new Error('Storage blocked');
		}
	});
	const notice = await import('./boosting-launch-notice');
	expect(notice.hasSeenBoostingLaunchNotice()).toBe(false);
	expect(() => notice.markBoostingLaunchNoticeSeen()).not.toThrow();
	expect(notice.hasSeenBoostingLaunchNotice()).toBe(true);
});

it('permits the revised announcement once despite the previous version being seen, without clearing preferences', async () => {
	vi.resetModules();
	const previousKey = 'fastaccs_boosting_back_20261019';
	const local = new Map([
		[previousKey, '1'],
		['unrelated-preference', 'keep']
	]);
	const session = new Map([
		[previousKey, '1'],
		['fastaccs_site_popup_checked', '1']
	]);
	const storage = (values: Map<string, string>) => ({
		getItem: (key: string) => values.get(key),
		setItem: (key: string, value: string) => values.set(key, value)
	});
	vi.stubGlobal('window', { localStorage: storage(local), sessionStorage: storage(session) });
	const notice = await import('./boosting-launch-notice');
	expect(notice.BOOSTING_LAUNCH_NOTICE_KEY).not.toBe(previousKey);
	expect(notice.hasSeenBoostingLaunchNotice()).toBe(false);
	notice.markBoostingLaunchNoticeSeen();
	expect(local.get(previousKey)).toBe('1');
	expect(local.get('unrelated-preference')).toBe('keep');
	expect(session.get('fastaccs_site_popup_checked')).toBe('1');
	vi.resetModules();
	expect((await import('./boosting-launch-notice')).hasSeenBoostingLaunchNotice()).toBe(true);
});
