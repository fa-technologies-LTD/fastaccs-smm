import { prisma } from '$lib/prisma';

export const ANNOUNCEMENT_BANNER_KEY = 'config.store.announcement_banner';

const DEFAULT_TIMEZONE = 'Africa/Lagos';
const DEFAULT_VERSION = 1;
const MAX_TEXT_LENGTH = 220;
const MAX_LINK_LENGTH = 400;

export interface AnnouncementBannerConfig {
	enabled: boolean;
	text: string;
	link: string | null;
	dismissible: boolean;
	startsAt: string | null;
	endsAt: string | null;
	version: number;
}

export interface AnnouncementBannerFormState extends AnnouncementBannerConfig {
	startsAtInput: string;
	endsAtInput: string;
	timezone: string;
}

export interface ActiveAnnouncementBanner {
	text: string;
	link: string | null;
	dismissible: boolean;
	version: number;
	startsAt: string | null;
	endsAt: string | null;
	dismissCookieName: string;
}

interface SaveAnnouncementBannerInput {
	enabled?: string | boolean | null;
	text?: string | null;
	link?: string | null;
	dismissible?: string | boolean | null;
	startsAt?: string | null;
	endsAt?: string | null;
	version?: string | number | null;
	timezone?: string | null;
}

const DEFAULT_CONFIG: AnnouncementBannerConfig = {
	enabled: false,
	text: '',
	link: null,
	dismissible: true,
	startsAt: null,
	endsAt: null,
	version: DEFAULT_VERSION
};

function parseBoolean(value: unknown, fallback = false): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value === 1;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (!normalized) return fallback;
		return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
	}
	return fallback;
}

function parseVersion(value: unknown, fallback = DEFAULT_VERSION): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(Math.round(parsed), 1), 9_999);
}

function sanitizeText(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().slice(0, MAX_TEXT_LENGTH);
}

function sanitizeLink(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith('/')) {
		if (trimmed.startsWith('//')) {
			return null;
		}
		return trimmed.slice(0, MAX_LINK_LENGTH);
	}

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
		return parsed.toString().slice(0, MAX_LINK_LENGTH);
	} catch {
		return null;
	}
}

function sanitizeIsoDateTime(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString();
}

function sanitizeTimezone(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) return DEFAULT_TIMEZONE;
	const nextTimezone = value.trim();
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: nextTimezone }).format(new Date());
		return nextTimezone;
	} catch {
		return DEFAULT_TIMEZONE;
	}
}

function getDateTimeParts(date: Date, timeZone: string): Record<string, string> {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	});

	const parts: Record<string, string> = {};
	for (const part of formatter.formatToParts(date)) {
		if (part.type !== 'literal') {
			parts[part.type] = part.value;
		}
	}

	return parts;
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
	const parts = getDateTimeParts(date, timeZone);
	const year = Number(parts.year || 0);
	const month = Number(parts.month || 1);
	const day = Number(parts.day || 1);
	const hour = Number(parts.hour || 0);
	const minute = Number(parts.minute || 0);
	const second = Number(parts.second || 0);

	const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
	return asUtc - date.getTime();
}

function toDateTimeLocalInput(isoValue: string | null, timeZone: string): string {
	if (!isoValue) return '';
	const parsed = new Date(isoValue);
	if (Number.isNaN(parsed.getTime())) return '';

	try {
		const parts = getDateTimeParts(parsed, timeZone);
		return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
	} catch {
		return '';
	}
}

function parseLocalDateTimeInTimeZone(value: string, timeZone: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	const fullIsoDateTime = /[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed);
	if (fullIsoDateTime) {
		return sanitizeIsoDateTime(trimmed);
	}

	const match =
		/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(trimmed) ||
		/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(trimmed);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);

	if (
		year < 1970 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31 ||
		hour < 0 ||
		hour > 23 ||
		minute < 0 ||
		minute > 59
	) {
		return null;
	}

	const utcTarget = Date.UTC(year, month - 1, day, hour, minute, 0);
	let utcGuess = utcTarget;

	for (let iteration = 0; iteration < 4; iteration += 1) {
		const offset = getTimeZoneOffsetMilliseconds(new Date(utcGuess), timeZone);
		const nextGuess = utcTarget - offset;
		if (Math.abs(nextGuess - utcGuess) < 1) break;
		utcGuess = nextGuess;
	}

	const resolved = new Date(utcGuess);
	if (Number.isNaN(resolved.getTime())) return null;

	const roundTrip = toDateTimeLocalInput(resolved.toISOString(), timeZone);
	if (roundTrip !== `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`) {
		return null;
	}

	return resolved.toISOString();
}

function normalizeBannerConfig(input: unknown): AnnouncementBannerConfig {
	const source =
		input && typeof input === 'object' && !Array.isArray(input)
			? (input as Record<string, unknown>)
			: {};

	const startsAt = sanitizeIsoDateTime(source.startsAt);
	const endsAt = sanitizeIsoDateTime(source.endsAt);
	const startsAtTimestamp = startsAt ? new Date(startsAt).getTime() : null;
	const endsAtTimestamp = endsAt ? new Date(endsAt).getTime() : null;

	return {
		enabled: parseBoolean(source.enabled, DEFAULT_CONFIG.enabled),
		text: sanitizeText(source.text),
		link: sanitizeLink(source.link),
		dismissible: parseBoolean(source.dismissible, DEFAULT_CONFIG.dismissible),
		startsAt,
		endsAt:
			startsAtTimestamp !== null && endsAtTimestamp !== null && endsAtTimestamp <= startsAtTimestamp
				? null
				: endsAt,
		version: parseVersion(source.version, DEFAULT_CONFIG.version)
	};
}

export function getAnnouncementBannerDismissCookieName(version: number): string {
	return `fa_announcement_banner_v${Math.max(1, Math.round(version || DEFAULT_VERSION))}`;
}

export function isAnnouncementBannerActive(config: AnnouncementBannerConfig, now = new Date()): boolean {
	if (!config.enabled) return false;
	if (!config.text.trim()) return false;

	const nowTimestamp = now.getTime();
	if (config.startsAt) {
		const startsAtTimestamp = new Date(config.startsAt).getTime();
		if (!Number.isNaN(startsAtTimestamp) && nowTimestamp < startsAtTimestamp) {
			return false;
		}
	}

	if (config.endsAt) {
		const endsAtTimestamp = new Date(config.endsAt).getTime();
		if (!Number.isNaN(endsAtTimestamp) && nowTimestamp > endsAtTimestamp) {
			return false;
		}
	}

	return true;
}

export async function getAnnouncementBannerConfig(): Promise<AnnouncementBannerConfig> {
	const row = await prisma.microcopy.findUnique({
		where: { key: ANNOUNCEMENT_BANNER_KEY },
		select: { value: true }
	});

	if (!row?.value) {
		return { ...DEFAULT_CONFIG };
	}

	try {
		const parsed = JSON.parse(row.value);
		return normalizeBannerConfig(parsed);
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export async function getActiveAnnouncementBanner(): Promise<ActiveAnnouncementBanner | null> {
	const config = await getAnnouncementBannerConfig();
	if (!isAnnouncementBannerActive(config)) return null;

	return {
		text: config.text,
		link: config.link,
		dismissible: config.dismissible,
		version: config.version,
		startsAt: config.startsAt,
		endsAt: config.endsAt,
		dismissCookieName: getAnnouncementBannerDismissCookieName(config.version)
	};
}

export function getAnnouncementBannerFormState(
	config: AnnouncementBannerConfig,
	timeZone: string
): AnnouncementBannerFormState {
	const safeTimezone = sanitizeTimezone(timeZone);
	return {
		...config,
		startsAtInput: toDateTimeLocalInput(config.startsAt, safeTimezone),
		endsAtInput: toDateTimeLocalInput(config.endsAt, safeTimezone),
		timezone: safeTimezone
	};
}

export async function saveAnnouncementBannerConfig(
	input: SaveAnnouncementBannerInput
): Promise<AnnouncementBannerConfig> {
	const timeZone = sanitizeTimezone(input.timezone);
	const startsAtRaw = typeof input.startsAt === 'string' ? input.startsAt.trim() : '';
	const endsAtRaw = typeof input.endsAt === 'string' ? input.endsAt.trim() : '';

	const startsAt = startsAtRaw ? parseLocalDateTimeInTimeZone(startsAtRaw, timeZone) : null;
	const endsAt = endsAtRaw ? parseLocalDateTimeInTimeZone(endsAtRaw, timeZone) : null;

	if (startsAtRaw && !startsAt) {
		throw new Error(`Invalid start date/time. Use ${timeZone} local date and time.`);
	}

	if (endsAtRaw && !endsAt) {
		throw new Error(`Invalid end date/time. Use ${timeZone} local date and time.`);
	}

	if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
		throw new Error('End schedule must be later than start schedule.');
	}

	const nextConfig = normalizeBannerConfig({
		enabled: input.enabled,
		text: input.text,
		link: input.link,
		dismissible: input.dismissible,
		startsAt,
		endsAt,
		version: input.version
	});

	if (nextConfig.enabled && !nextConfig.text.trim()) {
		throw new Error('Announcement text is required while banner is enabled.');
	}

	await prisma.microcopy.upsert({
		where: { key: ANNOUNCEMENT_BANNER_KEY },
		update: {
			value: JSON.stringify(nextConfig),
			category: 'settings',
			description: 'Storefront announcement banner configuration (enabled, schedule, dismiss version).',
			isActive: true
		},
		create: {
			key: ANNOUNCEMENT_BANNER_KEY,
			value: JSON.stringify(nextConfig),
			category: 'settings',
			description: 'Storefront announcement banner configuration (enabled, schedule, dismiss version).',
			isActive: true
		}
	});

	return nextConfig;
}
