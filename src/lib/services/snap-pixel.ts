import { browser, dev } from '$app/environment';

const SNAP_PIXEL_ID = 'c375a46a-6194-4916-ae1c-7660f6d5847f';
const SNAP_SCRIPT_SRC = 'https://sc-static.net/scevent.min.js';

export type SnapPixelEvent =
	| 'PAGE_VIEW'
	| 'VIEW_CONTENT'
	| 'ADD_CART'
	| 'START_CHECKOUT'
	| 'PURCHASE';

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

function isProductionTrackingHost(): boolean {
	if (!browser || dev) return false;
	const hostname = window.location.hostname.toLowerCase();
	return !['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);
}

function cleanPayload(payload: SnapPixelPayload): Record<string, string | number | boolean | Array<string | number>> {
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
		window.snaptr?.('init', SNAP_PIXEL_ID, {});
		initialized = true;
	}

	return true;
}

export function trackSnapEvent(event: SnapPixelEvent, payload: SnapPixelPayload = {}): boolean {
	if (!initializeSnapPixel()) return false;

	window.snaptr?.('track', event, cleanPayload(payload));
	return true;
}

export function trackSnapPageView(url: URL): boolean {
	return trackSnapEvent('PAGE_VIEW', {
		page_url: url.href,
		page_path: `${url.pathname}${url.search}`
	});
}
