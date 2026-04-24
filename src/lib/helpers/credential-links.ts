const KNOWN_PREFIX_RE =
	/^(?:2fa(?:\s*code)?|backup(?:\s*code)?|login\s*link|link|url)\s*[:=-]?\s*/i;

const ABSOLUTE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const DOMAIN_HINT_RE = /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i;

function trimString(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim();
}

function compact(value: string): string {
	return value.replace(/\s+/g, '');
}

function stripKnownPrefix(value: string): string {
	return value.replace(KNOWN_PREFIX_RE, '').trim();
}

function fixCommonSchemeTypos(value: string): string {
	let normalized = value;

	// Fix already-corrupted versions such as https://https//example.com
	normalized = normalized.replace(/^https:\/\/https\/\/+/i, 'https://');
	normalized = normalized.replace(/^https:\/\/http\/\/+/i, 'https://');
	normalized = normalized.replace(/^http:\/\/https\/\/+/i, 'http://');
	normalized = normalized.replace(/^http:\/\/http\/\/+/i, 'http://');

	// Fix missing-colon versions: https//example.com
	normalized = normalized.replace(/^https\/\/+/i, 'https://');
	normalized = normalized.replace(/^http\/\/+/i, 'http://');

	// Fix one-slash versions: https:/example.com
	normalized = normalized.replace(/^https:\/(?!\/)/i, 'https://');
	normalized = normalized.replace(/^http:\/(?!\/)/i, 'http://');

	return normalized;
}

function coerceHttpUrl(value: string): string | null {
	let candidate = compact(value);
	if (!candidate) return null;

	candidate = fixCommonSchemeTypos(candidate);

	if (candidate.startsWith('//')) {
		candidate = `https:${candidate}`;
	}

	if (/^www\./i.test(candidate)) {
		candidate = `https://${candidate}`;
	}

	if (!ABSOLUTE_SCHEME_RE.test(candidate) && DOMAIN_HINT_RE.test(candidate)) {
		candidate = `https://${candidate}`;
	}

	try {
		const parsed = new URL(candidate);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}

export interface CredentialFieldValue {
	raw: string;
	display: string;
	href: string | null;
	isUrl: boolean;
}

export function resolveCredentialField(value: unknown): CredentialFieldValue {
	const raw = trimString(value);
	if (!raw) {
		return {
			raw: '',
			display: '',
			href: null,
			isUrl: false
		};
	}

	const candidate = stripKnownPrefix(raw);
	const href = coerceHttpUrl(candidate);

	if (href) {
		return {
			raw,
			display: href,
			href,
			isUrl: true
		};
	}

	return {
		raw,
		display: raw,
		href: null,
		isUrl: false
	};
}

export function sanitizeStoredCredentialValue(value: unknown): string | null {
	const raw = trimString(value);
	if (!raw) return null;

	const resolved = resolveCredentialField(raw);
	return resolved.isUrl ? resolved.display : raw;
}
