import { browser, dev } from '$app/environment';

const SNAP_PIXEL_ID = 'fb90d7cc-7b96-45ad-9a9f-fcb84409119e';
const SNAP_SCRIPT_SRC = 'https://sc-static.net/scevent.min.js';
const TRACKED_PURCHASES_KEY = 'fastaccs_snap_tracked_purchases_v1';
export const SNAP_SIGNUP_COOKIE = 'fa_snap_signup';

export type SnapPixelEvent =
	| 'PAGE_VIEW'
	| 'VIEW_CONTENT'
	| 'ADD_CART'
	| 'START_CHECKOUT'
	| 'ADD_BILLING'
	| 'PURCHASE'
	| 'SIGN_UP'
	| 'CUSTOM_EVENT_1';

type SnapTrackFunction = ((command: 'init' | 'track', ...args: unknown[]) => void) & {
	queue: unknown[];
	handleRequest?: (...args: unknown[]) => void;
};

export type SnapPixelPayload = Record<
	string,
	string | number | boolean | Array<string | number> | null | undefined
>;

let initialized = false;
let scriptRequested = false;

export function isProductionTrackingHost(): boolean {
	if (!browser || dev) return false;
	const hostname = window.location.hostname.toLowerCase();
	return !['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);
}

function cleanPayload(
	payload: SnapPixelPayload
): Record<string, string | number | boolean | Array<string | number>> {
	const cleaned: Record<string, string | number | boolean | Array<string | number>> = {};

	for (const [key, value] of Object.entries(payload)) {
		if (value === null || value === undefined) continue;
		if (Array.isArray(value)) {
			const compact = value.filter((item) => String(item).trim().length > 0);
			if (compact.length === 0) continue;
			cleaned[key] = compact;
			continue;
		}
		if (typeof value === 'string' && value.trim().length === 0) continue;
		cleaned[key] = value;
	}

	return cleaned;
}

function ensureSnapStub(): void {
	if (!browser || window.snaptr) return;

	const snaptr = function (...args: unknown[]) {
		if (snaptr.handleRequest) {
			snaptr.handleRequest(...args);
		} else {
			snaptr.queue.push(args);
		}
	} as SnapTrackFunction;

	snaptr.queue = [];
	window.snaptr = snaptr;
}

function requestSnapScript(): void {
	if (!browser || scriptRequested) return;

	const existingScript = document.querySelector<HTMLScriptElement>(
		'script[data-snap-pixel-loader="true"]'
	);
	if (existingScript) {
		scriptRequested = true;
		return;
	}

	const script = document.createElement('script');
	script.async = true;
	script.src = SNAP_SCRIPT_SRC;
	script.setAttribute('data-snap-pixel-loader', 'true');

	const firstScript = document.getElementsByTagName('script')[0];
	firstScript?.parentNode?.insertBefore(script, firstScript);
	scriptRequested = true;
}

export function initializeSnapPixel(): boolean {
	if (!browser || !isProductionTrackingHost()) return false;

	ensureSnapStub();
	requestSnapScript();

	if (!initialized) {
		// src/app.html's inline snippet already called 'init' synchronously
		// before hydration on production hosts - don't call it twice.
		if (!window.__snapPixelBootstrapped) {
			window.snaptr?.('init', SNAP_PIXEL_ID, {});
		}
		initialized = true;
	}

	return true;
}

export function trackSnapEvent(event: SnapPixelEvent, payload: SnapPixelPayload = {}): boolean {
	if (!initializeSnapPixel()) return false;

	window.snaptr?.('track', event, cleanPayload(payload));
	return true;
}

function readTrackedPurchases(): string[] {
	if (!browser) return [];

	try {
		const parsed = JSON.parse(localStorage.getItem(TRACKED_PURCHASES_KEY) || '[]');
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === 'string')
			: [];
	} catch {
		return [];
	}
}

function markPurchaseTracked(transactionId: string): void {
	if (!browser || !transactionId) return;

	try {
		const tracked = Array.from(new Set([...readTrackedPurchases(), transactionId])).slice(-50);
		localStorage.setItem(TRACKED_PURCHASES_KEY, JSON.stringify(tracked));
	} catch {
		// Storage can be unavailable in strict/private browser modes. The event still fires.
	}
}

/**
 * Record a verified purchase once per browser. The same order ID is supplied as
 * Snap's transaction and deduplication IDs so a future Conversions API event can
 * be safely matched without inflating revenue.
 */
export function trackSnapPurchase(
	payload: SnapPixelPayload & { transaction_id?: string }
): boolean {
	const transactionId = String(payload.transaction_id || '').trim();
	if (!transactionId || readTrackedPurchases().includes(transactionId)) return false;

	const tracked = trackSnapEvent('PURCHASE', {
		...payload,
		transaction_id: transactionId,
		client_dedup_id: transactionId
	});
	if (tracked) markPurchaseTracked(transactionId);
	return tracked;
}

/** Consume the short-lived signal set after a successful Google signup redirect. */
export function trackPendingSnapSignup(): boolean {
	if (!browser) return false;

	const cookie = document.cookie
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${SNAP_SIGNUP_COOKIE}=`));
	if (!cookie) return false;

	const method = decodeURIComponent(cookie.slice(SNAP_SIGNUP_COOKIE.length + 1));
	document.cookie = `${SNAP_SIGNUP_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
	if (method !== 'google') return false;

	return trackSnapEvent('SIGN_UP', { sign_up_method: method });
}

export function trackSnapPageView(url: URL): boolean {
	return trackSnapEvent('PAGE_VIEW', {
		page_url: url.href,
		page_path: `${url.pathname}${url.search}`
	});
}

// Fired once the SvelteKit app has hydrated, as a separate signal from the
// PAGE_VIEW fired by src/app.html's pre-hydration snippet. Bots/crawlers that
// load the raw HTML rarely run far enough to trigger this, so comparing this
// count against PAGE_VIEW gives a rough "real visitor" ratio.
export function trackSnapConfirmedVisit(url: URL): boolean {
	return trackSnapEvent('CUSTOM_EVENT_1', {
		description: 'confirmed_visit',
		page_path: `${url.pathname}${url.search}`
	});
}
