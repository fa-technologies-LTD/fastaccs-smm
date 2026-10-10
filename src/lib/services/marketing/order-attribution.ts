import type { Attribution, LastTouch, RequestAttribution } from '$lib/services/attribution';

/**
 * Attribution snapshot stored on each order at creation (orders.analytics_metadata.attribution).
 * Private: customer-facing order responses go through sanitizeCustomerOrder's allow-list, which
 * excludes analytics metadata. Both touches come from cookies that are only set with consent, and
 * were already validated/clamped when parsed in hooks.server.ts.
 */
export interface OrderAttribution {
	first: Attribution | null;
	last: LastTouch | null;
	capturedAt: string;
}

export function buildOrderAttribution(
	attribution: RequestAttribution | undefined | null,
	now: Date = new Date()
): OrderAttribution | null {
	const first = attribution?.first ?? null;
	const last = attribution?.last ?? null;
	if (!first && !last) return null;
	return { first, last, capturedAt: now.toISOString() };
}
