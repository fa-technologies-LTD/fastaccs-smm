import { isProductionTrackingHost } from '$lib/helpers/tracking-host';
import { hasAnalyticsConsent } from '$lib/helpers/privacyConsent';

// Canonical funnel order, shared by the recording endpoint (validation) and
// the admin "Traffic & Funnel" view (labels + step ordering).
export const ANALYTICS_FUNNEL_STEPS = [
	{ type: 'page_view', label: 'Page View' },
	{ type: 'confirmed_visit', label: 'Confirmed Visit' },
	{ type: 'view_content', label: 'View Content' },
	{ type: 'add_cart', label: 'Add to Cart' },
	{ type: 'start_checkout', label: 'Start Checkout' },
	{ type: 'purchase', label: 'Purchase' }
] as const;

export const ANALYTICS_PRODUCT_EVENT_TYPES = [
	'numbers_service_open',
	'post_purchase_upsell_view',
	'post_purchase_upsell_click'
] as const;
export const ANALYTICS_EVENT_TYPES = [
	...ANALYTICS_FUNNEL_STEPS.map((step) => step.type),
	...ANALYTICS_PRODUCT_EVENT_TYPES
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

const MAX_PATH_LENGTH = 300;

// First-party funnel tracking is independent of advertising pixels and requires consent.
// Return whether recording was attempted so callers can deduplicate without marking denied events.
export function recordAnalyticsEvent(type: AnalyticsEventType, path: string): boolean {
	if (!isProductionTrackingHost() || !hasAnalyticsConsent()) return false;
	if (!path.startsWith('/') || path.startsWith('//')) return false;
	const pathname = path.split(/[?#]/, 1)[0].slice(0, MAX_PATH_LENGTH);
	if (/^\/(?:admin|api)(?:\/|$)/.test(pathname)) return false;
	try {
		void fetch('/api/analytics/event', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type, path: pathname }),
			keepalive: true
		}).catch(() => {});
		return true;
	} catch {
		// Analytics failure must never interrupt buying or payment verification.
		return false;
	}
}

const TRACKED_PURCHASES_KEY = 'fa_analytics_purchases';

/** Called only after server payment verification. Browser reloads must not recount a purchase. */
export function recordAnalyticsPurchase(orderId: string): boolean {
	if (!orderId || !isProductionTrackingHost() || !hasAnalyticsConsent()) return false;
	let tracked: string[] = [];
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(TRACKED_PURCHASES_KEY) || '[]');
		if (Array.isArray(stored))
			tracked = stored.filter((id): id is string => typeof id === 'string');
	} catch {
		/* Optional storage must not interrupt payment verification. */
	}
	if (tracked.includes(orderId)) return false;
	if (!recordAnalyticsEvent('purchase', '/checkout/verify')) return false;
	try {
		localStorage.setItem(TRACKED_PURCHASES_KEY, JSON.stringify([...tracked, orderId].slice(-50)));
	} catch {
		/* If storage is unavailable, financial totals still come from server orders. */
	}
	return true;
}
