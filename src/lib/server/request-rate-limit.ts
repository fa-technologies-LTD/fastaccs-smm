interface FixedWindowEntry {
	startedAt: number;
	count: number;
}

interface RequestAllowanceOptions {
	namespace: string;
	request: Request;
	getClientAddress?: () => string;
	limit: number;
	windowMs: number;
	now?: number;
}

const MAX_TRACKED_CLIENTS = 4_000;
const windows = new Map<string, FixedWindowEntry>();

function requestClientKey(request: Request, getClientAddress?: () => string): string {
	try {
		const address = getClientAddress?.().trim();
		if (address) return address;
	} catch {
		// Some adapters do not expose a client address in local/test requests.
	}

	const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	const realIp = request.headers.get('x-real-ip')?.trim();
	return forwarded || realIp || 'unknown';
}

/**
 * Lightweight abuse guard for anonymous, non-financial endpoints. The map is deliberately bounded
 * and per-process; it reduces accidental and basic scripted floods without becoming an auth or
 * payment correctness dependency.
 */
export function consumeRequestAllowance(options: RequestAllowanceOptions): boolean {
	const now = options.now ?? Date.now();
	const key = `${options.namespace}:${requestClientKey(options.request, options.getClientAddress)}`;
	const current = windows.get(key);

	if (!current || now - current.startedAt >= options.windowMs) {
		if (windows.size >= MAX_TRACKED_CLIENTS) windows.clear();
		windows.set(key, { startedAt: now, count: 1 });
		return true;
	}

	current.count += 1;
	return current.count <= options.limit;
}
