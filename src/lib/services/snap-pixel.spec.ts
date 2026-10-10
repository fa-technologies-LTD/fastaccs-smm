import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));

import {
	initializeSnapPixel,
	trackPendingSnapSignup,
	trackSnapEvent,
	trackSnapPageView,
	trackSnapPurchase
} from './snap-pixel';

describe('Snap Pixel (removed)', () => {
	const createElement = vi.fn();
	let cookie = '';

	beforeEach(() => {
		createElement.mockClear();
		cookie = 'fa_snap_signup=google; other=1';
		vi.stubGlobal('window', { location: { hostname: 'smm.fastaccs.com' } });
		vi.stubGlobal('document', {
			createElement,
			get cookie() {
				return cookie;
			},
			set cookie(value: string) {
				cookie = value;
			}
		});
	});

	afterEach(() => vi.unstubAllGlobals());

	it('never loads Snap or sends events, even on the production host', () => {
		expect(initializeSnapPixel()).toBe(false);
		expect(trackSnapEvent('VIEW_CONTENT', { item_ids: ['x'] })).toBe(false);
		expect(trackSnapPurchase({ transaction_id: 'ORD-1' })).toBe(false);
		expect(trackSnapPageView(new URL('https://smm.fastaccs.com/'))).toBe(false);
		expect(createElement).not.toHaveBeenCalled();
		expect((globalThis as { window: { snaptr?: unknown } }).window.snaptr).toBeUndefined();
	});

	it('clears the leftover signup flag cookie without tracking', () => {
		expect(trackPendingSnapSignup()).toBe(false);
		expect(cookie).toBe('fa_snap_signup=; Path=/; Max-Age=0; SameSite=Lax');
	});
});
