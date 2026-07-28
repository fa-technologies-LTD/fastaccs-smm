// Neon (serverless Postgres) occasionally drops a pooled connection mid-transaction —
// Prisma surfaces this as P2028 "Transaction API error … obtained before disconnecting",
// P1017 "server closed the connection", or "Can't reach database server". These are
// transient: the transaction rolled back, so re-running it is safe. Wrap money-path
// transactions (order creation, store-credit redemption) in this so a blip doesn't fail
// a real payment.

const TRANSIENT_CODES = new Set(['P2028', 'P1017', 'P1001', 'P1008']);
const TRANSIENT_SNIPPETS = [
	'obtained before disconnecting',
	'Transaction not found',
	'Transaction already closed',
	"Can't reach database server",
	'Connection closed',
	'connection closed',
	'ECONNRESET',
	'server closed the connection'
];

export function isTransientDbError(error: unknown): boolean {
	const code = (error as { code?: string } | null)?.code;
	if (code && TRANSIENT_CODES.has(code)) return true;
	const message = error instanceof Error ? error.message : String(error ?? '');
	return TRANSIENT_SNIPPETS.some((s) => message.includes(s));
}

/**
 * Run a DB operation, retrying up to `attempts` times on transient connection errors
 * with a short backoff. Non-transient errors (validation, constraint, business logic)
 * throw immediately.
 */
export async function runWithDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
	let lastError: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (i === attempts - 1 || !isTransientDbError(error)) throw error;
			console.warn(`[db-retry] transient DB error, retry ${i + 1}/${attempts - 1}`);
			await new Promise((r) => setTimeout(r, 150 * (i + 1)));
		}
	}
	throw lastError;
}
