import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));

import { COOKIE_CONSENT_KEY, PRIVACY_CONSENT_CHANGED_EVENT } from '$lib/helpers/privacyConsent';
import {
	initAttributionCapture,
	resetAttributionCaptureForTests,
	settleAttributionQueueForTests
} from './attribution-client';

type Body = { consent: string | null; landing?: string; referrer?: string };

let consent: string | null = null;
const listeners = new Map<string, () => void>();
const sent: Body[] = [];
let respond: (body: Body) => Promise<Response>;

const ok = (body: Body) =>
	Promise.resolve(
		new Response(
			JSON.stringify({
				ok: true,
				level: body.consent,
				first: body.consent === 'analytics' || body.consent === 'marketing',
				last: body.consent === 'marketing' && Boolean(body.landing),
				signing: true
			})
		)
	);

function choose(level: string) {
	consent = level;
	listeners.get(PRIVACY_CONSENT_CHANGED_EVENT)?.();
}

const settle = async () => {
	for (let i = 0; i < 5; i++) await settleAttributionQueueForTests();
};

beforeEach(() => {
	vi.useFakeTimers();
	listeners.clear();
	sent.length = 0;
	consent = null;
	respond = ok;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(String(init.body)) as Body;
			sent.push(body);
			return respond(body);
		})
	);
	vi.stubGlobal('document', { referrer: 'https://www.nairaland.com/' });
	vi.stubGlobal('window', {
		location: { pathname: '/platforms/x', search: '?utm_source=nairaland&utm_campaign=sports' },
		localStorage: {
			getItem: (key: string) =>
				key === COOKIE_CONSENT_KEY && consent
					? JSON.stringify({ level: consent, savedAt: Date.now(), version: 1 })
					: null,
			removeItem: vi.fn()
		},
		addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
		removeEventListener: (type: string) => listeners.delete(type)
	});
});

afterEach(() => {
	resetAttributionCaptureForTests();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('attribution sync', () => {
	it('sends nothing for an undecided visitor with no server record', async () => {
		initAttributionCapture({ level: null, hasFirst: false, hasLast: false });
		await settle();
		expect(sent).toEqual([]);
	});

	it('sends the original landing once the visitor accepts', async () => {
		initAttributionCapture({ level: null, hasFirst: false, hasLast: false });
		choose('marketing');
		await settle();
		expect(sent).toEqual([
			{
				consent: 'marketing',
				landing: '/platforms/x?utm_source=nairaland&utm_campaign=sports',
				referrer: 'https://www.nairaland.com/'
			}
		]);
	});

	it('a slow "accept" cannot finish after "necessary only": requests are serialized', async () => {
		let release!: () => void;
		respond = (body) =>
			body.consent === 'marketing'
				? new Promise((resolve) => (release = () => resolve(ok(body) as unknown as Response)))
				: ok(body);
		initAttributionCapture({ level: null, hasFirst: false, hasLast: false });
		choose('marketing');
		await Promise.resolve();
		choose('necessary'); // revoked while the accept request is still in flight
		await Promise.resolve();
		expect(sent.map((b) => b.consent)).toEqual(['marketing']); // not sent concurrently
		release();
		await settle();
		expect(sent.map((b) => b.consent)).toEqual(['marketing', 'necessary']); // latest wins last
	});

	it('on reload with analytics, reconciles a server record that still allows the ad click', async () => {
		consent = 'analytics';
		initAttributionCapture({ level: 'marketing', hasFirst: true, hasLast: true });
		await settle();
		expect(sent).toEqual([{ consent: 'analytics' }]);
	});

	it('on reload with necessary only, clears earlier attribution', async () => {
		consent = 'necessary';
		initAttributionCapture({ level: 'analytics', hasFirst: true, hasLast: false });
		await settle();
		expect(sent).toEqual([{ consent: 'necessary' }]);
	});

	it('does nothing when the server already matches and the landing is untagged', async () => {
		consent = 'analytics';
		(window as unknown as { location: { search: string } }).location.search = '';
		initAttributionCapture({ level: 'analytics', hasFirst: true, hasLast: false });
		await settle();
		expect(sent).toEqual([]);
	});

	it('does not count an HTTP error as synced and retries with backoff', async () => {
		let failures = 1;
		respond = (body) =>
			failures-- > 0 ? Promise.resolve(new Response('', { status: 500 })) : ok(body);
		consent = 'necessary';
		initAttributionCapture({ level: 'marketing', hasFirst: true, hasLast: true });
		await settle();
		expect(sent).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(2_000);
		await settle();
		expect(sent.map((b) => b.consent)).toEqual(['necessary', 'necessary']);
		await vi.advanceTimersByTimeAsync(60_000);
		await settle();
		expect(sent).toHaveLength(2); // confirmed: no further requests
	});

	it('stops when the server reports it cannot store choices (fail closed)', async () => {
		respond = () =>
			Promise.resolve(
				new Response(
					JSON.stringify({ ok: true, level: null, first: false, last: false, signing: false })
				)
			);
		consent = 'marketing';
		initAttributionCapture({ level: null, hasFirst: false, hasLast: false });
		await settle();
		await vi.advanceTimersByTimeAsync(60_000);
		await settle();
		expect(sent).toHaveLength(1);
	});
});
