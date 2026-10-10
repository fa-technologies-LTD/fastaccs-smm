import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));

import { COOKIE_CONSENT_KEY, PRIVACY_CONSENT_CHANGED_EVENT } from '$lib/helpers/privacyConsent';
import { initAttributionCapture, resetAttributionCaptureForTests } from './attribution-client';

const fetchMock = vi.fn(
	async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}')
);
let consent: string | null = null;
const listeners = new Map<string, (event: Event) => void>();

function emit(level: string) {
	listeners.get(PRIVACY_CONSENT_CHANGED_EVENT)?.(
		new CustomEvent(PRIVACY_CONSENT_CHANGED_EVENT, { detail: { level } })
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	listeners.clear();
	consent = null;
	vi.stubGlobal('fetch', fetchMock);
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
		addEventListener: (type: string, fn: (event: Event) => void) => listeners.set(type, fn),
		removeEventListener: (type: string) => listeners.delete(type)
	});
});

afterEach(() => {
	resetAttributionCaptureForTests();
	vi.unstubAllGlobals();
});

const posts = () =>
	fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST');

describe('attribution capture', () => {
	it('sends nothing until the visitor makes a choice', () => {
		initAttributionCapture();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends the original landing once the visitor accepts', () => {
		initAttributionCapture();
		emit('marketing');
		expect(posts()).toHaveLength(1);
		expect(JSON.parse(String((posts()[0][1] as RequestInit).body))).toEqual({
			consent: 'marketing',
			landing: '/platforms/x?utm_source=nairaland&utm_campaign=sports',
			referrer: 'https://www.nairaland.com/'
		});
	});

	it('uses a choice made on an earlier visit straight away', () => {
		consent = 'analytics';
		initAttributionCapture();
		expect(posts()).toHaveLength(1);
		expect(JSON.parse(String((posts()[0][1] as RequestInit).body)).consent).toBe('analytics');
	});

	it('removes cookies when the visitor chooses necessary only', () => {
		initAttributionCapture();
		emit('necessary');
		expect(posts()).toHaveLength(0);
		expect(fetchMock).toHaveBeenCalledWith('/api/attribution/touch?consent=necessary', {
			method: 'DELETE',
			keepalive: true
		});
	});

	it('does not resend for the same level', () => {
		initAttributionCapture();
		emit('marketing');
		emit('marketing');
		expect(posts()).toHaveLength(1);
	});
});
