import { browser } from '$app/environment';
import {
	PRIVACY_CONSENT_CHANGED_EVENT,
	readCookieConsent,
	type CookieConsentLevel
} from '$lib/helpers/privacyConsent';

/**
 * Consent-first acquisition capture. The landing URL and referrer stay in memory only (no storage)
 * until the visitor accepts; then the server sets the attribution cookies. Choosing "necessary"
 * later removes them. Client-side navigations keep this module alive, so accepting on any page
 * of the visit still credits the original landing.
 */

let landing: { landing: string; referrer: string } | null = null;
let sentForLevel: CookieConsentLevel | null = null;
let listening = false;

async function send(level: CookieConsentLevel): Promise<void> {
	if (!landing || level === 'necessary' || sentForLevel === level) return;
	sentForLevel = level;
	try {
		await fetch('/api/attribution/touch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ consent: level, ...landing }),
			keepalive: true
		});
	} catch {
		sentForLevel = null; // retry on the next consent signal
	}
}

async function revoke(level: CookieConsentLevel): Promise<void> {
	sentForLevel = null;
	try {
		await fetch(`/api/attribution/touch?consent=${level}`, { method: 'DELETE', keepalive: true });
	} catch {
		/* best-effort */
	}
}

function onConsentChanged(event: Event): void {
	const level = (event as CustomEvent<{ level?: CookieConsentLevel }>).detail?.level;
	if (!level) return;
	if (level === 'marketing' || level === 'analytics') void send(level);
	if (level !== 'marketing') void revoke(level);
}

/** Call once on app start (root layout). */
export function initAttributionCapture(): void {
	if (!browser) return;
	if (!landing) {
		landing = {
			landing: `${window.location.pathname}${window.location.search}`.slice(0, 500),
			referrer: (document.referrer || '').slice(0, 500)
		};
	}
	if (!listening) {
		window.addEventListener(PRIVACY_CONSENT_CHANGED_EVENT, onConsentChanged);
		listening = true;
	}
	const level = readCookieConsent();
	if (level === 'analytics' || level === 'marketing') void send(level);
}

/** Test hook. */
export function resetAttributionCaptureForTests(): void {
	landing = null;
	sentForLevel = null;
	if (listening && browser)
		window.removeEventListener(PRIVACY_CONSENT_CHANGED_EVENT, onConsentChanged);
	listening = false;
}
