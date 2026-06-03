import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const GA4_COLLECT_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const GA4_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';

export interface Ga4MeasurementProtocolEvent {
	name: string;
	params?: Record<string, unknown>;
}

export interface SendGa4MeasurementProtocolInput {
	clientId: string;
	userId?: string | null;
	events: Ga4MeasurementProtocolEvent[];
	timestampMicros?: string;
	debug?: boolean;
}

export interface SendGa4MeasurementProtocolResult {
	success: boolean;
	skipped?: boolean;
	error?: string;
	validationMessages?: unknown[];
}

function getMeasurementId(): string {
	const measurementId = String(publicEnv.PUBLIC_GA4_MEASUREMENT_ID || '').trim();
	return /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId.toUpperCase() : '';
}

function getApiSecret(): string {
	return String(privateEnv.GA4_MEASUREMENT_PROTOCOL_API_SECRET || '').trim();
}

function cleanValue(value: unknown): unknown {
	if (value === null || value === undefined) return undefined;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value === 'boolean') return value;
	if (Array.isArray(value)) {
		const items = value.map(cleanValue).filter((item) => item !== undefined);
		return items.length > 0 ? items : undefined;
	}
	if (typeof value === 'object') {
		const cleaned: Record<string, unknown> = {};
		for (const [key, nestedValue] of Object.entries(value)) {
			const nextValue = cleanValue(nestedValue);
			if (nextValue !== undefined) {
				cleaned[key] = nextValue;
			}
		}
		return Object.keys(cleaned).length > 0 ? cleaned : undefined;
	}
	return undefined;
}

function cleanParams(params: Record<string, unknown> = {}): Record<string, unknown> {
	const cleaned: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(params)) {
		const nextValue = cleanValue(value);
		if (nextValue !== undefined) {
			cleaned[key] = nextValue;
		}
	}

	return cleaned;
}

function cleanEvents(events: Ga4MeasurementProtocolEvent[]): Ga4MeasurementProtocolEvent[] {
	return events
		.map((event) => ({
			name: String(event.name || '').trim(),
			params: cleanParams(event.params)
		}))
		.filter((event) => event.name.length > 0);
}

export function isGa4MeasurementProtocolConfigured(): boolean {
	return Boolean(getMeasurementId() && getApiSecret());
}

export async function sendGa4MeasurementProtocolEvents(
	input: SendGa4MeasurementProtocolInput
): Promise<SendGa4MeasurementProtocolResult> {
	const measurementId = getMeasurementId();
	const apiSecret = getApiSecret();
	const clientId = String(input.clientId || '').trim();
	const events = cleanEvents(input.events || []);

	if (!measurementId || !apiSecret) {
		return { success: false, skipped: true, error: 'GA4 Measurement Protocol is not configured.' };
	}

	if (!clientId || events.length === 0) {
		return { success: false, skipped: true, error: 'Missing GA4 client id or events.' };
	}

	const endpoint = input.debug ? GA4_DEBUG_ENDPOINT : GA4_COLLECT_ENDPOINT;
	const url = new URL(endpoint);
	url.searchParams.set('measurement_id', measurementId);
	url.searchParams.set('api_secret', apiSecret);

	const payload: Record<string, unknown> = {
		client_id: clientId,
		non_personalized_ads: true,
		events
	};

	if (input.userId) payload.user_id = input.userId;
	if (input.timestampMicros) payload.timestamp_micros = input.timestampMicros;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (input.debug) {
			const result = (await response.json().catch(() => null)) as {
				validationMessages?: unknown[];
			} | null;
			return {
				success: response.ok,
				error: response.ok ? undefined : `GA4 debug endpoint returned ${response.status}.`,
				validationMessages: result?.validationMessages || []
			};
		}

		if (!response.ok) {
			return {
				success: false,
				error: `GA4 Measurement Protocol returned ${response.status}.`
			};
		}

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to send GA4 event.'
		};
	}
}
