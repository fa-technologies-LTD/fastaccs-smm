import { env } from '$env/dynamic/private';

/**
 * hub-man.com API client — powers the automated Numbers (SMS-verification) service.
 *
 * We only use the CONSUMER `/api/rent/*` surface (renting an activation number to
 * receive one OTP). The `/api/devices/*` surface is the supplier side and is never used.
 *
 * Contracts verified live against hub-man's OpenAPI 3.1 spec (2026-07-25). All monetary
 * values are USD cents and costs are dynamic (vary by service/country/supplier).
 *
 * NOTE: hub-man sits behind Cloudflare bot protection — requests without a browser-like
 * User-Agent are rejected with 403. Every call here sends BROWSER_UA for that reason.
 */

const HUBMAN_API_BASE_URL = (env.HUBMAN_API_BASE_URL || 'https://hub-man.com').replace(/\/$/, '');
const HUBMAN_API_TOKEN = env.HUBMAN_API_TOKEN || '';

const BROWSER_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export class HubmanError extends Error {
	status: number;
	body: unknown;
	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = 'HubmanError';
		this.status = status;
		this.body = body;
	}
}

export function isHubmanConfigured(): boolean {
	return Boolean(HUBMAN_API_TOKEN);
}

async function hubmanRequest<T>(
	path: string,
	options: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
	if (!HUBMAN_API_TOKEN) {
		throw new HubmanError('hub-man API token is not configured', 0, null);
	}

	const { method = 'GET', body, timeoutMs = 20000 } = options;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(`${HUBMAN_API_BASE_URL}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${HUBMAN_API_TOKEN}`,
				Accept: 'application/json',
				'User-Agent': BROWSER_UA,
				...(body ? { 'Content-Type': 'application/json' } : {})
			},
			body: body ? JSON.stringify(body) : undefined,
			signal: controller.signal
		});

		const text = await response.text();
		let parsed: unknown = null;
		try {
			parsed = text ? JSON.parse(text) : null;
		} catch {
			parsed = text;
		}

		if (!response.ok) {
			const message =
				(parsed && typeof parsed === 'object' && 'message' in parsed
					? String((parsed as Record<string, unknown>).message)
					: `hub-man ${method} ${path} failed`) + ` (HTTP ${response.status})`;
			throw new HubmanError(message, response.status, parsed);
		}

		return parsed as T;
	} catch (error) {
		if (error instanceof HubmanError) throw error;
		if (error instanceof Error && error.name === 'AbortError') {
			throw new HubmanError(`hub-man ${method} ${path} timed out`, 0, null);
		}
		throw new HubmanError(
			`hub-man ${method} ${path} network error: ${(error as Error).message}`,
			0,
			null
		);
	} finally {
		clearTimeout(timeout);
	}
}

// ---------------------------------------------------------------------------
// Types (verified response shapes)
// ---------------------------------------------------------------------------

export interface HubmanUser {
	id: number;
	name: string;
	email: string;
	balance_cents: number;
}

export interface HubmanCountry {
	id: number;
	code: string;
	name: string;
}

export interface HubmanService {
	id: number;
	name: string;
	sms_man_id: number;
}

export interface HubmanCatalog {
	countries: HubmanCountry[];
	services: HubmanService[];
}

/** Per-service pricing within a country (from available-services-activation). */
export interface HubmanServicePrice {
	min_price_cents: number;
	max_price_cents: number;
	available_numbers_count: number;
	supplier_id: number | null;
}

/** data[countryId][serviceId] -> price info */
export type HubmanAvailableServices = Record<string, Record<string, HubmanServicePrice>>;

export interface HubmanRentResult {
	order_uuid: string;
	// NOTE: hub-man returns phone_number and price_cents as INTEGERS in practice
	// (the published spec types them as strings). Coerce at the call site.
	phone_number: number | string;
	rental_type: string;
	rent_period_minutes: number | string;
	price_cents: number | string;
	expires_at: string;
}

export interface HubmanSms {
	id: string;
	phone_number: string;
	sender_name: string;
	message: string;
	otp: string;
	classification_service_id: string;
	classification_service_name: string;
	received_at: string;
}

export interface HubmanActiveRent {
	uuid: string;
	phone_number: number | string;
	price_cents: number | string;
	expires_at: string;
	created_at: string;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Our own hub-man account (balance is `balance_cents`, USD cents). */
export async function getAccount(): Promise<HubmanUser> {
	const res = await hubmanRequest<{ data: HubmanUser }>('/api/users/me');
	return res.data;
}

export async function getBalanceCents(): Promise<number> {
	return (await getAccount()).balance_cents;
}

/** Full catalog: 223 countries + ~5391 services. Large (~270KB) — cache upstream. */
export async function getCatalog(): Promise<HubmanCatalog> {
	const res = await hubmanRequest<{ data: HubmanCatalog }>(
		'/api/rent/all-country-service-activation',
		{ timeoutMs: 40000 }
	);
	return res.data;
}

/** Country IDs that currently have activation numbers available. */
export async function getAvailableCountryIds(): Promise<number[]> {
	const res = await hubmanRequest<{ data: number[] }>('/api/rent/available-countries-activation');
	return res.data;
}

/** Live per-service prices + availability for a country. */
export async function getAvailableServices(countryId: number): Promise<HubmanAvailableServices> {
	const res = await hubmanRequest<{ data: HubmanAvailableServices }>(
		`/api/rent/available-services-activation?country_id=${countryId}`
	);
	return res.data;
}

/**
 * Rent an activation number (one OTP). `maxPriceCents` is the margin-guard ceiling —
 * if the live cost exceeds it, hub-man rejects the rent (we then refund the customer).
 * SPENDS REAL MONEY.
 */
export async function rentActivationNumber(params: {
	countryId: number;
	serviceId: number;
	maxPriceCents?: number;
}): Promise<HubmanRentResult> {
	const body: Record<string, unknown> = {
		country_id: params.countryId,
		service_id: params.serviceId
	};
	if (params.maxPriceCents != null) body.max_price_cents = params.maxPriceCents;

	const res = await hubmanRequest<{ data: HubmanRentResult }>('/api/rent/rent-activation-number', {
		method: 'POST',
		body
	});
	return res.data;
}

/**
 * Poll for the received SMS/OTP. Returns the SMS once it arrives, or `null` while
 * still waiting.
 *
 * VERIFIED live: while waiting, hub-man responds **HTTP 422** with
 * `{ message: "Waiting for SMS", errors: { waiting_for_sms: [...] } }` (NOT the
 * `data: []` the published spec implies). We treat that as "no SMS yet". Any other
 * error still throws.
 */
/**
 * Parse hub-man's `/sms` payload `data` into an SMS or null.
 *
 * hub-man wraps the SMS in an ARRAY: `[]` = still waiting, `[{...}]` = the code ARRIVED.
 * (It can also return a bare object.) Treating a non-empty array as "waiting" was dropping
 * every delivered code — the cause of refunding successful rents. Exported + unit-tested.
 */
export function parsePhoneSmsResponse(data: unknown): HubmanSms | null {
	if (Array.isArray(data)) {
		const first = data[0];
		return first && typeof first === 'object' ? (first as HubmanSms) : null;
	}
	return data && typeof data === 'object' ? (data as HubmanSms) : null;
}

export async function getSms(uuid: string): Promise<HubmanSms | null> {
	try {
		const res = await hubmanRequest<{ data: HubmanSms | HubmanSms[] | unknown[] }>(
			`/api/rent/${encodeURIComponent(uuid)}/sms`
		);
		return parsePhoneSmsResponse(res.data);
	} catch (error) {
		if (error instanceof HubmanError && error.status === 422 && isWaitingForSms(error.body)) {
			return null;
		}
		throw error;
	}
}

function isWaitingForSms(body: unknown): boolean {
	if (!body || typeof body !== 'object') return false;
	const errors = (body as Record<string, unknown>).errors;
	return Boolean(errors && typeof errors === 'object' && 'waiting_for_sms' in errors);
}

/** Cancel a rent (refunds our hub-man balance). Used on no-SMS timeout. */
export async function cancelRent(uuid: string): Promise<boolean> {
	const res = await hubmanRequest<{ success: boolean }>(
		`/api/rent/${encodeURIComponent(uuid)}/cancel`
	);
	return res.success === true;
}

/** All currently-active rents on our account (for admin live-ops). */
export async function getActiveRents(): Promise<HubmanActiveRent[]> {
	const res = await hubmanRequest<{ data: HubmanActiveRent[] }>('/api/rent/active');
	return res.data;
}
