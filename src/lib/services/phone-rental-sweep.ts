import { prisma } from '$lib/prisma';
import { sendCriticalAdminAlert } from './admin-alerts';
import { pollPhoneRentalSms, type PhonePollResult } from './phone-fulfillment';

export const PHONE_RENTAL_SWEEP_BATCH_SIZE = 12;
export const PHONE_RENTAL_SWEEP_CONCURRENCY = 3;

type SweepCandidate = {
	orderItemId: string;
	status: string;
	rentLeaseExpiresAt: Date | null;
	operationLeaseExpiresAt: Date | null;
};

export interface PhoneRentalSweepSummary {
	scanned: number;
	processed: number;
	resolved: number;
	failed: number;
	staleDetected: number;
	staleUnresolved: number;
	hasDeferredWork: boolean;
}

function isStale(candidate: SweepCandidate, now: Date): boolean {
	if (candidate.status === 'failed') return true;
	if (candidate.status === 'renting') {
		return !candidate.rentLeaseExpiresAt || candidate.rentLeaseExpiresAt <= now;
	}
	if (candidate.status === 'cancelling' || candidate.status === 'replacing') {
		return !candidate.operationLeaseExpiresAt || candidate.operationLeaseExpiresAt <= now;
	}
	return false;
}

function isResolved(result: PhonePollResult): boolean {
	return ['received', 'refunded', 'expired'].includes(result.status);
}

function boundedInteger(
	value: number | undefined,
	fallback: number,
	min: number,
	max: number
): number {
	const parsed = Math.floor(Number(value));
	return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

/**
 * Fair, bounded safety sweep for paid Numbers work. Oldest rows are selected first, the batch
 * cannot grow without limit, and a small worker pool avoids serial backlog without opening an
 * upstream stampede. Any thrown worker error or stale lease that remains unresolved makes the
 * automation run fail visibly after a deduplicated operator alert.
 */
export async function sweepExpiredPhoneRentals(
	options: {
		batchSize?: number;
		concurrency?: number;
	} = {}
): Promise<PhoneRentalSweepSummary> {
	const batchSize = boundedInteger(options.batchSize, PHONE_RENTAL_SWEEP_BATCH_SIZE, 1, 50);
	const concurrency = boundedInteger(options.concurrency, PHONE_RENTAL_SWEEP_CONCURRENCY, 1, 5);
	const now = new Date();
	const rows = await prisma.phoneRental.findMany({
		where: {
			OR: [
				{
					status: 'pending',
					OR: [{ nextRentAttemptAt: null }, { nextRentAttemptAt: { lte: now } }]
				},
				{
					status: 'renting',
					OR: [{ rentLeaseExpiresAt: null }, { rentLeaseExpiresAt: { lte: now } }]
				},
				{ status: 'awaiting_sms' },
				{
					status: { in: ['cancelling', 'replacing'] },
					OR: [{ operationLeaseExpiresAt: null }, { operationLeaseExpiresAt: { lte: now } }]
				},
				{ status: 'failed', refundedAt: null }
			]
		},
		select: {
			orderItemId: true,
			status: true,
			rentLeaseExpiresAt: true,
			operationLeaseExpiresAt: true
		},
		orderBy: [{ createdAt: 'asc' }, { orderItemId: 'asc' }],
		take: batchSize + 1
	});
	const candidates = rows.slice(0, batchSize);
	const staleIds = new Set(
		candidates.filter((row) => isStale(row, now)).map((row) => row.orderItemId)
	);
	const failedIds: string[] = [];
	const staleUnresolvedIds: string[] = [];
	let cursor = 0;
	let resolved = 0;

	async function worker(): Promise<void> {
		while (cursor < candidates.length) {
			const index = cursor;
			cursor += 1;
			const candidate = candidates[index];
			try {
				const result = await pollPhoneRentalSms(candidate.orderItemId);
				if (isResolved(result)) resolved += 1;
				if (staleIds.has(candidate.orderItemId) && !isResolved(result)) {
					staleUnresolvedIds.push(candidate.orderItemId);
				}
			} catch (error) {
				failedIds.push(candidate.orderItemId);
				console.error('[phone.sweep] rental processing failed', {
					orderItemId: candidate.orderItemId,
					error: error instanceof Error ? error.message : error
				});
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker())
	);

	const summary: PhoneRentalSweepSummary = {
		scanned: candidates.length,
		processed: candidates.length,
		resolved,
		failed: failedIds.length,
		staleDetected: staleIds.size,
		staleUnresolved: staleUnresolvedIds.length,
		hasDeferredWork: rows.length > batchSize
	};

	if (summary.failed > 0 || summary.staleUnresolved > 0) {
		const affected = [...new Set([...failedIds, ...staleUnresolvedIds])].slice(0, 8);
		await sendCriticalAdminAlert({
			title: 'Numbers rental sweep needs attention',
			message: `The sweep processed ${summary.processed} rentals but left ${summary.staleUnresolved} stale and hit ${summary.failed} errors. Affected order items: ${affected.join(', ') || 'unknown'}.`,
			source: 'phone.sweep',
			dedupeKey: 'phone-rental-sweep-unhealthy',
			cooldownMs: 30 * 60_000
		}).catch(() => undefined);
		throw new Error(
			`Numbers rental sweep unhealthy: ${summary.failed} errors, ${summary.staleUnresolved} stale unresolved`
		);
	}

	return summary;
}
