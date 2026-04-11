export type CookieConsentLevel = 'necessary' | 'analytics';

export const COOKIE_CONSENT_KEY = 'fa_cookie_consent_v1';
export const PRIVACY_OPEN_EVENT = 'fa:privacy-open';
export const PRIVACY_CONSENT_CHANGED_EVENT = 'fa:privacy-consent-changed';

const CONSENT_VERSION = 1;
const CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;

interface ConsentRecord {
	level: CookieConsentLevel;
	savedAt: number;
	version: number;
}

function isBrowser(): boolean {
	return typeof window !== 'undefined';
}

function parseConsent(raw: string | null): ConsentRecord | null {
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
		if (
			(parsed.level !== 'necessary' && parsed.level !== 'analytics') ||
			typeof parsed.savedAt !== 'number' ||
			typeof parsed.version !== 'number'
		) {
			return null;
		}

		return {
			level: parsed.level,
			savedAt: parsed.savedAt,
			version: parsed.version
		};
	} catch {
		return null;
	}
}

export function readCookieConsent(): CookieConsentLevel | null {
	if (!isBrowser()) return null;

	const record = parseConsent(window.localStorage.getItem(COOKIE_CONSENT_KEY));
	if (!record) return null;

	const isExpired = Date.now() - record.savedAt > CONSENT_TTL_MS;
	const versionMismatch = record.version !== CONSENT_VERSION;
	if (isExpired || versionMismatch) {
		window.localStorage.removeItem(COOKIE_CONSENT_KEY);
		return null;
	}

	return record.level;
}

export function saveCookieConsent(level: CookieConsentLevel): void {
	if (!isBrowser()) return;

	const payload: ConsentRecord = {
		level,
		savedAt: Date.now(),
		version: CONSENT_VERSION
	};

	window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(payload));
	window.dispatchEvent(
		new CustomEvent(PRIVACY_CONSENT_CHANGED_EVENT, {
			detail: { level }
		})
	);
}

export function hasAnalyticsConsent(): boolean {
	return readCookieConsent() === 'analytics';
}
