import { getCredentialDisplayLabel, getCredentialExtraEntries } from '$lib/helpers/account-credentials';
import { resolveCredentialField } from '$lib/helpers/credential-links';

export interface CanonicalCredentialRecord {
	username?: unknown;
	password?: unknown;
	email?: unknown;
	emailPassword?: unknown;
	twoFa?: unknown;
	linkUrl?: unknown;
	followers?: unknown;
	following?: unknown;
	postsCount?: unknown;
	engagementRate?: unknown;
	ageMonths?: unknown;
	niche?: unknown;
	qualityScore?: unknown;
	deliveryNotes?: unknown;
	credentialExtras?: unknown;
	credential_extras?: unknown;
}

export interface CanonicalCredentialEntry {
	key: string;
	label: string;
	value: string;
	href: string | null;
	isUrl: boolean;
	source: 'known' | 'extra';
}

interface CredentialEntryOptions {
	includeEmpty?: boolean;
	includeExtras?: boolean;
	knownKeys?: readonly string[];
}

const DEFAULT_KNOWN_RENDER_ORDER = [
	'username',
	'password',
	'email',
	'emailPassword',
	'twoFa',
	'linkUrl',
	'followers',
	'following',
	'postsCount',
	'engagementRate',
	'ageMonths',
	'niche',
	'qualityScore',
	'deliveryNotes'
] as const;

const URL_FIELD_KEYS = new Set(['twoFa', 'linkUrl']);

function toScalarText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return '';
}

export function getCanonicalCredentialEntries(
	record: CanonicalCredentialRecord,
	options: CredentialEntryOptions = {}
): CanonicalCredentialEntry[] {
	const includeEmpty = options.includeEmpty ?? false;
	const includeExtras = options.includeExtras ?? true;
	const knownKeys = options.knownKeys || DEFAULT_KNOWN_RENDER_ORDER;
	const recordMap = record as Record<string, unknown>;

	const entries: CanonicalCredentialEntry[] = [];
	const seenKeys = new Set<string>();

	for (const knownKey of knownKeys) {
		const value = toScalarText(recordMap[knownKey]);
		if (!value && !includeEmpty) continue;

		if (URL_FIELD_KEYS.has(knownKey)) {
			const resolved = resolveCredentialField(value);
			if (!resolved.display && !includeEmpty) continue;
			entries.push({
				key: knownKey,
				label: getCredentialDisplayLabel(knownKey),
				value: resolved.display || value,
				href: resolved.href,
				isUrl: resolved.isUrl,
				source: 'known'
			});
			seenKeys.add(knownKey);
			continue;
		}

		entries.push({
			key: knownKey,
			label: getCredentialDisplayLabel(knownKey),
			value,
			href: null,
			isUrl: false,
			source: 'known'
		});
		seenKeys.add(knownKey);
	}

	if (!includeExtras) {
		return entries;
	}

	const extras = getCredentialExtraEntries(record.credentialExtras ?? record.credential_extras ?? {});
	for (const extra of extras) {
		if (seenKeys.has(extra.key)) continue;
		entries.push({
			key: extra.key,
			label: extra.label,
			value: extra.value,
			href: null,
			isUrl: false,
			source: 'extra'
		});
	}

	return entries;
}

export function buildCredentialPlainText(
	record: CanonicalCredentialRecord,
	options: {
		headerLines?: string[];
		footerLines?: string[];
		includeEmpty?: boolean;
	} = {}
): string {
	const lines: string[] = [];

	for (const header of options.headerLines || []) {
		if (header.trim()) lines.push(header.trim());
	}

	const entries = getCanonicalCredentialEntries(record, {
		includeEmpty: options.includeEmpty ?? false,
		includeExtras: true
	});
	for (const entry of entries) {
		lines.push(`${entry.label}: ${entry.value}`);
	}

	for (const footer of options.footerLines || []) {
		if (footer.trim()) lines.push(footer.trim());
	}

	return lines.join('\n').trim();
}
