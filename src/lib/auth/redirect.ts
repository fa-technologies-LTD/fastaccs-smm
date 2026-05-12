const DEFAULT_REDIRECT_PATH = '/dashboard';

export function sanitizeInternalRedirectPath(
	input: string | null | undefined,
	fallback: string = DEFAULT_REDIRECT_PATH
): string {
	if (typeof input !== 'string') return fallback;

	const trimmed = input.trim();
	if (!trimmed) return fallback;

	// Internal route only.
	if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
		return fallback;
	}

	try {
		const parsed = new URL(trimmed, 'http://localhost');
		const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
		if (!normalized.startsWith('/') || normalized.startsWith('//')) {
			return fallback;
		}
		return normalized;
	} catch {
		return fallback;
	}
}
