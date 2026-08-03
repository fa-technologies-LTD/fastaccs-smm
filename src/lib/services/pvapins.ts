import { env } from '$env/dynamic/private';

/**
 * pvapins.com API client — the SECOND source for the automated Numbers service, co-equal
 * with hub-man (see hubman.ts). Goal: always serve a number from the most reliable supplier
 * available at the time; pvapins tends to carry the high-demand combos (USA WhatsApp etc.)
 * that hub-man often lacks.
 *
 * Contracts VERIFIED LIVE 2026-08-04 — and the published docs were WRONG in several places,
 * so everything here is what the real API actually returned:
 *  - Auth: `?customer=<API_KEY>` query param (NOT a Bearer header).
 *  - get_number / get_sms take service+country by NAME ("USA", "Whatsapp24"), not numeric id.
 *  - get_number success = the BARE phone number as PLAIN TEXT (e.g. "13865902416"), not JSON.
 *    Errors are plain strings too ("Country Not Found.", "App Not Found.").
 *  - get_sms "waiting" = the plain string "You have not received any code yet." (NOT JSON).
 *  - Cost is a DECIMAL USD string ("0.66") — hub-man uses USD *cents*, so we normalize to cents.
 *  - BILLING IS PAY-ON-SUCCESS: renting a number never debits balance; the charge finalizes
 *    only when a code arrives. (Confirmed: bought 3 numbers, balance never moved.)
 */

const PVAPINS_API_BASE_URL = (env.PVAPINS_API_BASE_URL || 'https://api.pvapins.com/user/api').replace(/\/$/, '');
const PVAPINS_API_KEY = env.PVAPINS_API_KEY || '';

export class PvapinsError extends Error {
	status: number;
	body: unknown;
	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = 'PvapinsError';
		this.status = status;
		this.body = body;
	}
}

export function isPvapinsConfigured(): boolean {
	return Boolean(PVAPINS_API_KEY);
}

/** USD dollar string ("0.66") → integer USD cents (66), matching hub-man's unit. */
export function usdStringToCents(value: unknown): number {
	const n = Number(String(value ?? '').trim());
	return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

async function pvapinsRequest(
	path: string,
	params: Record<string, string | number>,
	{ withAuth = true, timeoutMs = 20000 }: { withAuth?: boolean; timeoutMs?: number } = {}
): Promise<string> {
	if (withAuth && !PVAPINS_API_KEY) {
		throw new PvapinsError('pvapins API key is not configured', 0, null);
	}
	const qs = new URLSearchParams();
	if (withAuth) qs.set('customer', PVAPINS_API_KEY);
	for (const [k, v] of Object.entries(params)) qs.set(k, String(v));

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(`${PVAPINS_API_BASE_URL}/${path}?${qs.toString()}`, {
			method: 'GET',
			headers: { Accept: 'application/json, text/plain, */*' },
			signal: controller.signal
		});
		const text = (await res.text()).trim();
		if (!res.ok) throw new PvapinsError(`pvapins ${path} failed (HTTP ${res.status})`, res.status, text);
		return text;
	} finally {
		clearTimeout(timeout);
	}
}

function parseJsonArray(text: string): unknown[] {
	try {
		const j = JSON.parse(text);
		return Array.isArray(j) ? j : [];
	} catch {
		return [];
	}
}

// ── Account ────────────────────────────────────────────────────────────────
export async function getBalanceCents(): Promise<number> {
	const text = await pvapinsRequest('get_balance.php', {});
	try {
		const j = JSON.parse(text) as { balance?: string };
		return usdStringToCents(j.balance);
	} catch {
		return 0;
	}
}

// ── Catalog ──────────────────────────────────────────────────────────────────
export interface PvapinsCountry {
	id: number;
	full_name: string;
}
export async function loadCountries(): Promise<PvapinsCountry[]> {
	const text = await pvapinsRequest('load_countries.php', {}, { withAuth: false });
	return parseJsonArray(text) as PvapinsCountry[];
}

export interface PvapinsApp {
	id: number;
	full_name: string;
	deduct: string; // USD dollars, e.g. "0.66"
	trending: number;
}
export async function loadApps(countryId: number): Promise<PvapinsApp[]> {
	const text = await pvapinsRequest('load_apps.php', { country_id: countryId }, { withAuth: false });
	return parseJsonArray(text) as PvapinsApp[];
}

// ── Rent (by NAME) ────────────────────────────────────────────────────────────
const RENT_ERROR_MARKERS = ['not found', 'no number', 'not available', 'balance', 'error'];

/**
 * Rent an activation number. Returns the phone number (digits) on success.
 * pvapins replies with the bare number as plain text, or a plain-text error — so a response
 * that isn't all-digits is treated as an error (never as a phone number).
 */
export async function rentNumber(input: { country: string; app: string }): Promise<string> {
	const text = await pvapinsRequest('get_number.php', { app: input.app, country: input.country });
	const digits = text.replace(/[^\d]/g, '');
	if (/^\d{6,}$/.test(text.trim())) return text.trim();
	if (digits.length >= 6 && text.trim().length <= digits.length + 2) return digits; // tolerate stray spaces
	throw new PvapinsError(`pvapins rent failed: ${text.slice(0, 120)}`, 200, text);
}

// ── SMS poll (leak-safe) ──────────────────────────────────────────────────────
export type PvapinsSmsResult =
	| { status: 'waiting' }
	| { status: 'received'; otp: string; message: string; from?: string }
	| { status: 'error'; reason: string };

const SMS_WAITING_MARKERS = ['not received any code', 'no code yet', 'waiting'];
const SMS_ERROR_MARKERS = ['balance is expired', 'balance expired', 'not found', 'expired'];

function extractOtp(s: string): string {
	const m = String(s).match(/(\d{4,8})/);
	return m ? m[1] : '';
}

/**
 * Parse a get_sms response WITHOUT knowing pvapins' exact "received" shape yet. Leak-safe by
 * design (the hub-man lesson): a delivered OTP always contains digits, whereas the waiting and
 * error strings never do — so we key "received" on FINDING A CODE, regardless of whether it
 * came back as a bare string, a JSON array, or an object. Unknown, code-less shapes are treated
 * as still-waiting (and should be logged) rather than falsely settled or falsely refunded.
 */
export function parsePvapinsSms(raw: string): PvapinsSmsResult {
	const text = (raw ?? '').trim();
	if (!text) return { status: 'waiting' };
	const lower = text.toLowerCase();

	if (SMS_WAITING_MARKERS.some((m) => lower.includes(m))) return { status: 'waiting' };

	// Pull a message body: from JSON (array/object) if present, else the raw text itself.
	let message = '';
	let from: string | undefined;
	const arr = parseJsonArray(text);
	const first = (arr[0] ?? (() => {
		try {
			const o = JSON.parse(text);
			return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
		} catch {
			return null;
		}
	})()) as Record<string, unknown> | null;
	if (first && typeof first === 'object') {
		message = String(first.message ?? first.sms ?? first.text ?? first.code ?? '');
		const f = first.from ?? first.sender ?? first.sender_name;
		from = f ? String(f) : undefined;
	}
	const body = message.trim() || text;
	const otp = extractOtp(body);
	if (otp) return { status: 'received', otp, message: body, from };

	// No code found. If it's a known error string, surface it; otherwise keep waiting.
	if (SMS_ERROR_MARKERS.some((m) => lower.includes(m))) return { status: 'error', reason: text.slice(0, 160) };
	return { status: 'waiting' };
}

export async function getSms(input: { number: string; country: string; app: string }): Promise<PvapinsSmsResult> {
	const text = await pvapinsRequest('get_sms.php', {
		number: input.number,
		country: input.country,
		app: input.app
	});
	return parsePvapinsSms(text);
}

// ── Cancel/reject ─────────────────────────────────────────────────────────────
/** Best-effort release. pvapins may refuse ("Not able to reject.") — pay-on-success means an
 * un-rejected idle number simply expires without charge, so a false here is not a money risk. */
export async function rejectNumber(input: { number: string; country: string; app: string }): Promise<boolean> {
	try {
		const text = await pvapinsRequest('get_reject_number.php', {
			number: input.number,
			country: input.country,
			app: input.app
		});
		return /success|rejected|released|done/i.test(text);
	} catch {
		return false;
	}
}
