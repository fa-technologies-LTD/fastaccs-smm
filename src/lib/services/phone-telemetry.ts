import { prisma } from '$lib/prisma';

/**
 * Durable per-attempt telemetry for the Numbers system — FastAccs' OWN empirical supplier record
 * (which variant, cost, rent outcome, OTP timing, rejection, actual COGS). It replaces guesswork
 * ("most codes arrive in 2 min", "this variant is usually available") with production evidence.
 *
 * CRITICAL: this is OBSERVATIONAL. It is NOT part of financial correctness. Every write is
 * best-effort and swallows its own errors — a telemetry failure must NEVER break a paid customer's
 * fulfillment. It observes the engine; it does not steer it (that comes later, once data is clean).
 */

export type AttemptOutcome =
	| 'rented' // supplier returned a number
	| 'oos' // supplier confirmed out of stock
	| 'rate_limited' // our own global limiter had no token — NOT an OOS signal
	| 'error' // provider/network/mapping error
	| 'otp_received' // (update) a code arrived on this attempt's number
	| 'otp_timeout'; // (update) the activation window closed with no code

export interface RecordAttemptInput {
	orderItemId: string;
	attemptNumber: number;
	provider: string;
	providerServiceRef: string;
	outcome: AttemptOutcome;
	providerRef?: string | null;
	expectedCostCents?: number | null;
	actualCostCents?: number | null;
	failureCategory?: string | null;
	phoneNumber?: string | null;
}

/** Record one supplier attempt. Returns the row id, or null if telemetry failed (never throws). */
export async function recordPhoneAttempt(input: RecordAttemptInput): Promise<string | null> {
	try {
		const row = await prisma.phoneAttempt.create({
			data: {
				orderItemId: input.orderItemId,
				attemptNumber: input.attemptNumber,
				provider: input.provider,
				providerServiceRef: input.providerServiceRef,
				providerRef: input.providerRef ?? null,
				expectedCostCents: input.expectedCostCents ?? null,
				actualCostCents: input.actualCostCents ?? null,
				outcome: input.outcome,
				failureCategory: input.failureCategory?.slice(0, 200) ?? null,
				phoneNumber: input.phoneNumber ?? null
			},
			select: { id: true }
		});
		return row.id;
	} catch (error) {
		console.error('[phone-telemetry] recordPhoneAttempt failed (ignored):', (error as Error).message);
		return null;
	}
}

/**
 * Mark the attempt that produced a given number as OTP-received, stamping the delivery latency.
 * Matches on (orderItemId, providerRef) — the rent handle is unique per attempt. Best-effort.
 */
export async function recordAttemptOtpReceived(
	orderItemId: string,
	providerRef: string | null | undefined,
	latencySec: number | null
): Promise<void> {
	if (!providerRef) return;
	try {
		await prisma.phoneAttempt.updateMany({
			where: { orderItemId, providerRef, otpReceivedAt: null },
			data: {
				outcome: 'otp_received',
				otpReceivedAt: new Date(),
				otpLatencySec: latencySec != null && Number.isFinite(latencySec) ? Math.round(latencySec) : null
			}
		});
	} catch (error) {
		console.error('[phone-telemetry] recordAttemptOtpReceived failed (ignored):', (error as Error).message);
	}
}

/** Record whether a rejection/cancel of a given number succeeded. Best-effort. */
export async function recordAttemptRejection(
	orderItemId: string,
	providerRef: string | null | undefined,
	success: boolean
): Promise<void> {
	if (!providerRef) return;
	try {
		await prisma.phoneAttempt.updateMany({
			where: { orderItemId, providerRef },
			data: { rejectionAttempted: true, rejectionSuccess: success }
		});
	} catch (error) {
		console.error('[phone-telemetry] recordAttemptRejection failed (ignored):', (error as Error).message);
	}
}

/** Classify a provider rent error into an inventory-vs-operational bucket (kept coarse for now). */
export function classifyRentFailure(message: string): { outcome: AttemptOutcome; category: string } {
	const m = (message || '').toLowerCase();
	if (/out of stock|no numbers|sold out|not available|no stock/.test(m))
		return { outcome: 'oos', category: 'out_of_stock' };
	if (/rate|too many|429/.test(m)) return { outcome: 'rate_limited', category: 'provider_rate_limited' };
	if (/not found|invalid|mapping|no such/.test(m)) return { outcome: 'error', category: 'invalid_mapping' };
	if (/balance|insufficient|funds/.test(m)) return { outcome: 'error', category: 'low_balance' };
	if (/timeout|timed out|econn|network|socket/.test(m)) return { outcome: 'error', category: 'provider_timeout' };
	return { outcome: 'error', category: 'provider_error' };
}
