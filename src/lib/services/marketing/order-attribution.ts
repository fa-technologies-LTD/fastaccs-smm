import type { Attribution, LastTouch, RequestAttribution } from '$lib/services/attribution';

/**
 * Attribution snapshot stored on each order at creation (orders.analytics_metadata.attribution).
 * Private: customer-facing order responses go through sanitizeCustomerOrder's allow-list, which
 * excludes analytics metadata. Both touches come from locals.attribution, which hooks.server.ts
 * only fills from signed cookies AS FAR AS the signed server-side consent record allows.
 */
export interface OrderAttribution {
	consentLevel: RequestAttribution['consentLevel'];
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
	return {
		consentLevel: attribution?.consentLevel ?? null,
		first,
		last,
		capturedAt: now.toISOString()
	};
}
