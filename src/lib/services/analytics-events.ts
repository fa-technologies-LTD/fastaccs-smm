import { isProductionTrackingHost } from './snap-pixel';

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

export const ANALYTICS_EVENT_TYPES = ANALYTICS_FUNNEL_STEPS.map((step) => step.type);

export type AnalyticsEventType = (typeof ANALYTICS_FUNNEL_STEPS)[number]['type'];

const MAX_PATH_LENGTH = 300;

// Internal funnel tracking, recorded alongside Snap events. Gated to the same
// production hosts as Snap so local `npm run dev` (which shares the live DB)
// never writes rows here.
export function recordAnalyticsEvent(type: AnalyticsEventType, path: string): void {
	if (!isProductionTrackingHost()) return;

	fetch('/api/analytics/event', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ type, path: path.slice(0, MAX_PATH_LENGTH) }),
		keepalive: true
	}).catch(() => {});
}
