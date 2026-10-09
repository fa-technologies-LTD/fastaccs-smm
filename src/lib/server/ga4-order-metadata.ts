/** Versioned only on newly created, explicitly consented orders. Never upgrade old sales. */
export function captureGa4OrderMetadata(
	input?: {
		ga4ClientId?: unknown;
		consentGranted?: unknown;
	},
	serverReportingAvailable = true
): Record<string, string | number | boolean> {
	const clientId = normalizeGa4OrderClientId(input?.ga4ClientId);
	if (!clientId || input?.consentGranted !== true) return {};
	return {
		ga4ClientId: clientId,
		ga4ConsentGranted: true,
		// Do not disable the working browser receipt reporter when server credentials
		// are missing. Reporting ownership is immutable for this order thereafter.
		ga4EcommerceVersion: serverReportingAvailable ? 2 : 1,
		capturedAt: new Date().toISOString(),
		source: 'checkout'
	};
}

export function readGa4OrderMetadata(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function normalizeGa4OrderClientId(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length <= 100 && /^\d+\.\d+$/.test(trimmed) ? trimmed : null;
}

export function usesManagedGa4Ecommerce(metadata: Record<string, unknown>): boolean {
	return (
		metadata.ga4EcommerceVersion === 2 &&
		metadata.ga4ConsentGranted === true &&
		Boolean(normalizeGa4OrderClientId(metadata.ga4ClientId))
	);
}

/** Safe public routing enum, never the client id or private analytics metadata. */
export function ga4PurchaseReporter(order: { analyticsMetadata?: unknown }): 'server' | 'browser' {
	return usesManagedGa4Ecommerce(readGa4OrderMetadata(order.analyticsMetadata))
		? 'server'
		: 'browser';
}
