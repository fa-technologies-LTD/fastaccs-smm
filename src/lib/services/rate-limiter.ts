import { prisma } from '$lib/prisma';

/**
 * Distributed token-bucket rate limiter (Postgres-backed) for pacing scarce UPSTREAM supplier
 * calls — above all pvapins `get_number` (~5/min), a GLOBAL resource that a per-process limiter
 * cannot protect under concurrent serverless invocations.
 *
 * A bucket is one row (`rate_buckets`) holding `tokens` + `updatedAt`. Tokens refill continuously
 * at `refillPerSec` up to `capacity`. Acquiring one is serialized per key via `SELECT … FOR UPDATE`
 * inside a transaction, so two concurrent callers can't both spend the last token. Self-healing:
 * a crashed caller leaks nothing (we only decrement when a token is actually granted), and old
 * buckets simply refill. A "denied" result means *supplier capacity is momentarily exhausted* —
 * NOT that the product is out of stock.
 */

export interface TokenBucketSpec {
	capacity: number; // max burst
	refillPerSec: number; // steady-state rate
}

/** pvapins get_number spec from a per-minute limit (default 5/min). */
export function pvapinsRateSpec(perMin: number): TokenBucketSpec {
	const rate = Math.max(1, perMin);
	return { capacity: rate, refillPerSec: rate / 60 };
}

export const PVAPINS_GET_NUMBER_BUCKET = 'pvapins:get_number';

/**
 * Pure token math: given the stored bucket (or null for first use), refill for elapsed time and
 * decide whether one token can be granted. Returns the value to persist either way. Kept pure so
 * the concurrency-critical arithmetic is unit-testable without a database.
 */
export function computeTokenGrant(
	stored: { tokens: number; updatedAt: Date } | null,
	now: Date,
	spec: TokenBucketSpec
): { granted: boolean; tokens: number } {
	let tokens: number;
	if (!stored) {
		tokens = spec.capacity; // first use: start full
	} else {
		const elapsedSec = Math.max(0, (now.getTime() - stored.updatedAt.getTime()) / 1000);
		tokens = Math.min(spec.capacity, stored.tokens + elapsedSec * spec.refillPerSec);
	}
	if (tokens < 1) return { granted: false, tokens };
	return { granted: true, tokens: tokens - 1 };
}

/**
 * Atomically try to take one token from the named bucket. Returns true if granted.
 * Fail-OPEN on a limiter error: a rare over-limit (pvapins itself returns a rate-limit error we
 * handle gracefully) is far less harmful than blocking every sale on a limiter-DB blip.
 */
export async function acquireRateToken(key: string, spec: TokenBucketSpec): Promise<boolean> {
	const now = new Date();
	try {
		return await prisma.$transaction(async (tx) => {
			const rows = await tx.$queryRaw<Array<{ tokens: number; updated_at: Date }>>`
				SELECT tokens, updated_at FROM rate_buckets WHERE key = ${key} FOR UPDATE`;
			const stored = rows.length
				? { tokens: Number(rows[0].tokens), updatedAt: rows[0].updated_at }
				: null;
			const { granted, tokens } = computeTokenGrant(stored, now, spec);
			await tx.$executeRaw`
				INSERT INTO rate_buckets ("key", tokens, updated_at) VALUES (${key}, ${tokens}, ${now})
				ON CONFLICT ("key") DO UPDATE SET tokens = ${tokens}, updated_at = ${now}`;
			return granted;
		});
	} catch (error) {
		console.error('[rate-limiter] acquire failed, allowing (fail-open):', (error as Error).message);
		return true;
	}
}
