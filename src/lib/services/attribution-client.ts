import { browser } from '$app/environment';
import {
	COOKIE_CONSENT_KEY,
	PRIVACY_CONSENT_CHANGED_EVENT,
	readCookieConsent,
	type CookieConsentLevel
} from '$lib/helpers/privacyConsent';
import { hasTrackingTags } from '$lib/services/attribution';

/**
 * Keeps the server's consent record (and the acquisition cookies it allows) in step with the
 * visitor's banner choice. The landing URL + referrer stay in memory only until the visitor
 * accepts.
 *
 * - One request at a time: jobs run in a queue and each reads the CURRENT choice when it runs, so
 *   a slow "accept" can never land after "necessary only".
 * - Reconciles on every app start against the server's view (from the root layout), including
 *   clearing cookies left over from an earlier choice.
 * - A request only counts once the server confirms it; failures retry with backoff, then wait for
 *   the next app start or consent change.
 */

export interface ServerAttributionState {
	level: CookieConsentLevel | null;
	hasFirst: boolean;
	hasLast: boolean;
}

const RETRY_DELAYS_MS = [2_000, 8_000, 20_000];

let landing: { landing: string; referrer: string } | null = null;
let landingTagged = false;
// True while the server holds THIS visit's tagged ad click. Cleared whenever the server reports it
// no longer has a last touch (e.g. after "Necessary only"), so re-accepting restores it.
let landingClickStored = false;
let server: ServerAttributionState = { level: null, hasFirst: false, hasLast: false };
let queue: Promise<void> = Promise.resolve();
let listening = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let signingUnavailable = false;

function wantsLanding(level: CookieConsentLevel | null): boolean {
	if (!landing) return false;
	if (level === 'analytics') return !server.hasFirst;
	if (level === 'marketing') return !server.hasFirst || (landingTagged && !landingClickStored);
	return false;
}

function needsSync(level: CookieConsentLevel | null): boolean {
	if (signingUnavailable) return false;
	return level !== server.level || wantsLanding(level);
}

async function runSync(): Promise<void> {
	const level = readCookieConsent();
	if (!needsSync(level)) return;
	const includeLanding = wantsLanding(level);
	try {
		const response = await fetch('/api/attribution/sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ consent: level, ...(includeLanding ? landing : {}) }),
			keepalive: true
		});
		const result = response.ok ? await response.json().catch(() => null) : null;
		if (!result?.ok) throw new Error(`attribution sync failed (${response.status})`);

		server = {
			level: result.level ?? null,
			hasFirst: Boolean(result.first),
			hasLast: Boolean(result.last)
		};
		if (!server.hasLast) landingClickStored = false;
		else if (includeLanding && level === 'marketing' && landingTagged) landingClickStored = true;
		if (result.signing === false) signingUnavailable = true; // server can't store choices
		attempt = 0;
		// The choice changed while this request was in flight: converge on the newer one.
		if (readCookieConsent() !== level) schedule();
	} catch {
		scheduleRetry();
	}
}

function schedule(): void {
	queue = queue.then(runSync, runSync);
}

function scheduleRetry(): void {
	if (attempt >= RETRY_DELAYS_MS.length) {
		attempt = 0;
		return;
	}
	const delay = RETRY_DELAYS_MS[attempt++];
	if (retryTimer) clearTimeout(retryTimer);
	retryTimer = setTimeout(() => {
		retryTimer = null;
		schedule();
	}, delay);
}

// Another tab changed the choice (localStorage is shared): reconcile this tab's view too.
function onStorage(event: StorageEvent): void {
	if (!event || event.key === COOKIE_CONSENT_KEY || event.key === null) onConsentChanged();
}

function onConsentChanged(): void {
	attempt = 0;
	if (retryTimer) {
		clearTimeout(retryTimer);
		retryTimer = null;
	}
	schedule();
}

/** Call once on app start (root layout) with the server's attribution state. */
export function initAttributionCapture(serverState?: ServerAttributionState | null): void {
	if (!browser) return;
	if (serverState) server = { ...serverState };
	if (!landing) {
		const search = window.location.search;
		landing = {
			landing: `${window.location.pathname}${search}`.slice(0, 500),
			referrer: (document.referrer || '').slice(0, 500)
		};
		landingTagged = hasTrackingTags(new URLSearchParams(search));
	}
	if (!listening) {
		window.addEventListener(PRIVACY_CONSENT_CHANGED_EVENT, onConsentChanged);
		window.addEventListener('storage', onStorage as EventListener);
		listening = true;
	}
	schedule();
}

/** Test hooks. */
export function settleAttributionQueueForTests(): Promise<void> {
	return queue;
}

export function resetAttributionCaptureForTests(): void {
	landing = null;
	landingTagged = false;
	landingClickStored = false;
	server = { level: null, hasFirst: false, hasLast: false };
	queue = Promise.resolve();
	attempt = 0;
	signingUnavailable = false;
	if (retryTimer) clearTimeout(retryTimer);
	retryTimer = null;
	if (listening && browser) {
		window.removeEventListener(PRIVACY_CONSENT_CHANGED_EVENT, onConsentChanged);
		window.removeEventListener('storage', onStorage as EventListener);
	}
	listening = false;
}
