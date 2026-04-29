import { sanitizeStoredCredentialValue } from '$lib/helpers/credential-links';

export const KNOWN_ACCOUNT_FIELDS = [
	'linkUrl',
	'username',
	'password',
	'email',
	'emailPassword',
	'twoFa',
	'twoFactorEnabled',
	'easyLoginEnabled',
	'followers',
	'following',
	'postsCount',
	'engagementRate',
	'ageMonths',
	'niche',
	'qualityScore',
	'deliveryNotes'
] as const;

export type KnownAccountField = (typeof KNOWN_ACCOUNT_FIELDS)[number];

type KnownFieldType = 'string' | 'int' | 'float' | 'boolean' | 'score';

interface KnownFieldDefinition {
	field: KnownAccountField;
	label: string;
	type: KnownFieldType;
	aliases: string[];
}

const KNOWN_FIELD_DEFINITIONS: KnownFieldDefinition[] = [
	{
		field: 'linkUrl',
		label: 'Profile Link',
		type: 'string',
		aliases: ['profile_link', 'profile link', 'link', 'link_url', 'login_link', 'url']
	},
	{
		field: 'username',
		label: 'Username',
		type: 'string',
		aliases: ['username', 'user_name', 'user']
	},
	{
		field: 'password',
		label: 'Password',
		type: 'string',
		aliases: ['password', 'pass', 'passwd']
	},
	{
		field: 'email',
		label: 'Email',
		type: 'string',
		aliases: ['email', 'e_mail']
	},
	{
		field: 'emailPassword',
		label: 'Email Password',
		type: 'string',
		aliases: ['email_password', 'email pass', 'email_pass']
	},
	{
		field: 'twoFa',
		label: '2FA Link',
		type: 'string',
		aliases: ['2fa', '2fa_link', 'two_fa', 'two factor', 'two_factor', 'otp', '2fa code']
	},
	{
		field: 'twoFactorEnabled',
		label: 'Two Factor Enabled',
		type: 'boolean',
		aliases: ['two_factor_enabled', '2fa_enabled', 'twofactorenabled']
	},
	{
		field: 'easyLoginEnabled',
		label: 'Easy Login Enabled',
		type: 'boolean',
		aliases: ['easy_login_enabled', 'easy_login', 'easyloginenabled']
	},
	{
		field: 'followers',
		label: 'Followers',
		type: 'int',
		aliases: ['followers', 'follower_count']
	},
	{
		field: 'following',
		label: 'Following',
		type: 'int',
		aliases: ['following', 'following_count']
	},
	{
		field: 'postsCount',
		label: 'Posts Count',
		type: 'int',
		aliases: ['posts_count', 'posts', 'post_count']
	},
	{
		field: 'engagementRate',
		label: 'Engagement Rate',
		type: 'float',
		aliases: ['engagement_rate', 'engagement']
	},
	{
		field: 'ageMonths',
		label: 'Age Months',
		type: 'int',
		aliases: ['age_months', 'account_age_months', 'age']
	},
	{
		field: 'niche',
		label: 'Niche',
		type: 'string',
		aliases: ['niche', 'category']
	},
	{
		field: 'qualityScore',
		label: 'Quality Score',
		type: 'score',
		aliases: ['quality_score', 'quality', 'score']
	},
	{
		field: 'deliveryNotes',
		label: 'Delivery Notes',
		type: 'string',
		aliases: ['delivery_notes', 'notes', 'note']
	}
];

const FIELD_BY_NAME: Record<KnownAccountField, KnownFieldDefinition> = Object.fromEntries(
	KNOWN_FIELD_DEFINITIONS.map((definition) => [definition.field, definition])
) as Record<KnownAccountField, KnownFieldDefinition>;

const FIELD_BY_ALIAS = new Map<string, KnownAccountField>();
for (const definition of KNOWN_FIELD_DEFINITIONS) {
	for (const alias of definition.aliases) {
		FIELD_BY_ALIAS.set(normalizeCredentialHeader(alias), definition.field);
	}
}

export interface CsvHeaderDescriptor {
	index: number;
	original: string;
	normalized: string;
	knownField: KnownAccountField | null;
}

export interface KnownFieldParseResult {
	ok: boolean;
	value: string | number | boolean | null;
	error?: string;
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function parseStrictInteger(value: string): number | null {
	if (!/^[+-]?\d+$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseStrictFloat(value: string): number | null {
	if (!/^[+-]?(?:\d+\.\d+|\d+|\.\d+)$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: string): boolean | null {
	const lowered = value.toLowerCase();
	if (['true', '1', 'yes', 'y', 'enabled', 'on'].includes(lowered)) return true;
	if (['false', '0', 'no', 'n', 'disabled', 'off'].includes(lowered)) return false;
	return null;
}

function humanizeNormalizedKey(normalizedKey: string): string {
	const cleaned = normalizedKey.replace(/_+/g, ' ').trim();
	if (!cleaned) return 'Field';
	return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeCredentialHeader(header: string): string {
	const compact = normalizeText(header)
		.toLowerCase()
		.replace(/[\u200B-\u200D\uFEFF]/g, '');
	return compact
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.replace(/_+/g, '_');
}

export function resolveKnownAccountField(header: string): KnownAccountField | null {
	const normalized = normalizeCredentialHeader(header);
	if (!normalized) return null;
	return FIELD_BY_ALIAS.get(normalized) || null;
}

export function getKnownFieldLabel(field: KnownAccountField): string {
	return FIELD_BY_NAME[field].label;
}

export function getCredentialDisplayLabel(rawKey: string): string {
	const known = resolveKnownAccountField(rawKey);
	if (known) return getKnownFieldLabel(known);
	const normalized = normalizeCredentialHeader(rawKey);
	if (!normalized) return 'Field';
	return humanizeNormalizedKey(normalized);
}

export function buildCsvHeaderDescriptors(headers: string[]): CsvHeaderDescriptor[] {
	return headers.map((header, index) => {
		const original = normalizeText(header);
		const normalized = normalizeCredentialHeader(original);
		return {
			index,
			original,
			normalized,
			knownField: resolveKnownAccountField(original)
		};
	});
}

export function parseKnownAccountFieldValue(
	field: KnownAccountField,
	rawValue: string
): KnownFieldParseResult {
	const definition = FIELD_BY_NAME[field];
	const trimmed = normalizeText(rawValue);
	if (!trimmed) {
		return { ok: true, value: null };
	}

	switch (definition.type) {
		case 'string': {
			if (field === 'linkUrl' || field === 'twoFa') {
				return { ok: true, value: sanitizeStoredCredentialValue(trimmed) };
			}
			return { ok: true, value: trimmed };
		}
		case 'int': {
			const parsed = parseStrictInteger(trimmed);
			if (parsed === null) {
				return {
					ok: false,
					value: null,
					error: `${definition.label} expects an integer value`
				};
			}
			return { ok: true, value: parsed };
		}
		case 'float': {
			const parsed = parseStrictFloat(trimmed);
			if (parsed === null) {
				return {
					ok: false,
					value: null,
					error: `${definition.label} expects a numeric value`
				};
			}
			return { ok: true, value: parsed };
		}
		case 'boolean': {
			const parsed = parseBoolean(trimmed);
			if (parsed === null) {
				return {
					ok: false,
					value: null,
					error: `${definition.label} expects a boolean value (true/false, yes/no, 1/0)`
				};
			}
			return { ok: true, value: parsed };
		}
		case 'score': {
			const parsed = parseStrictInteger(trimmed);
			if (parsed === null || parsed < 1 || parsed > 10) {
				return {
					ok: false,
					value: null,
					error: `${definition.label} must be an integer between 1 and 10`
				};
			}
			return { ok: true, value: parsed };
		}
		default:
			return { ok: true, value: trimmed };
	}
}

export type CredentialExtras = Record<string, string>;

export function normalizeCredentialExtras(value: unknown): CredentialExtras {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	const extras: CredentialExtras = {};
	for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
		const key = normalizeText(rawKey);
		if (!key) continue;
		const normalizedValue = normalizeText(typeof rawValue === 'string' ? rawValue : String(rawValue ?? ''));
		if (!normalizedValue) continue;
		extras[key] = normalizedValue;
	}

	return extras;
}

export interface CredentialExtraEntry {
	key: string;
	label: string;
	value: string;
}

export function getCredentialExtraEntries(value: unknown): CredentialExtraEntry[] {
	const extras = normalizeCredentialExtras(value);
	return Object.entries(extras).map(([key, entryValue]) => ({
		key,
		label: getCredentialDisplayLabel(key),
		value: entryValue
	}));
}

const ACCOUNT_FIELD_ALIASES: Record<string, string> = {
	batch_id: 'batchId',
	category_id: 'categoryId',
	link_url: 'linkUrl',
	email_password: 'emailPassword',
	two_fa: 'twoFa',
	two_factor_enabled: 'twoFactorEnabled',
	easy_login_enabled: 'easyLoginEnabled',
	posts_count: 'postsCount',
	engagement_rate: 'engagementRate',
	age_months: 'ageMonths',
	quality_score: 'qualityScore',
	reserved_until: 'reservedUntil',
	order_item_id: 'orderItemId',
	delivered_at: 'deliveredAt',
	delivery_notes: 'deliveryNotes',
	credential_extras: 'credentialExtras'
};

const WRITABLE_ACCOUNT_FIELDS = new Set([
	'batchId',
	'categoryId',
	'platform',
	'linkUrl',
	'username',
	'password',
	'email',
	'emailPassword',
	'twoFa',
	'twoFactorEnabled',
	'easyLoginEnabled',
	'followers',
	'following',
	'postsCount',
	'engagementRate',
	'ageMonths',
	'niche',
	'qualityScore',
	'status',
	'reservedUntil',
	'orderItemId',
	'deliveredAt',
	'deliveryNotes'
]);

export function normalizeUnknownValue(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') {
		const trimmed = normalizeText(value);
		return trimmed.length > 0 ? trimmed : null;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	try {
		const serialized = JSON.stringify(value);
		return serialized ? normalizeText(serialized) : null;
	} catch {
		return null;
	}
}

export function normalizeAccountDataForPersistence(
	input: Record<string, unknown>
): Record<string, unknown> {
	const normalized: Record<string, unknown> = {};
	const extras: CredentialExtras = normalizeCredentialExtras(
		input.credentialExtras ?? input.credential_extras
	);

	for (const [rawKey, rawValue] of Object.entries(input)) {
		if (rawKey === 'metadata') continue;

		const key = ACCOUNT_FIELD_ALIASES[rawKey] || rawKey;
		if (key === 'credentialExtras') continue;

		if (WRITABLE_ACCOUNT_FIELDS.has(key)) {
			let value = rawValue;
			if (key === 'twoFa' || key === 'linkUrl') {
				value = sanitizeStoredCredentialValue(rawValue);
			}
			normalized[key] = value;
			continue;
		}

		const unknownValue = normalizeUnknownValue(rawValue);
		if (!unknownValue) continue;
		extras[rawKey] = unknownValue;
	}

	if (Object.keys(extras).length > 0) {
		normalized.credentialExtras = extras;
	}

	return normalized;
}
