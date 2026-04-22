import { env } from '$env/dynamic/private';
import { getAdminEmails } from '$lib/auth/admin';
import { prisma } from '$lib/prisma';

const SETTINGS_CATEGORY = 'settings';

const SETTINGS_KEYS = {
	businessName: 'config.business.name',
	businessEmail: 'config.business.email',
	whatsappNumber: 'config.business.whatsapp',
	currencyCode: 'config.business.currency',
	adminRecipients: 'config.notifications.admin_recipients',
	lowStockThreshold: 'config.notifications.low_stock_threshold',
	winbackDaysThreshold: 'config.notifications.winback_days_threshold',
	broadcastBatchSize: 'config.notifications.broadcast_batch_size',
	broadcastBatchDelayMs: 'config.notifications.broadcast_batch_delay_ms',
	lowStockLastSignature: 'alert.low_stock.last_signature',
	lowStockLastSentAt: 'alert.low_stock.last_sent_at'
} as const;

const DEFAULTS = {
	businessName: 'Fast Accounts',
	businessEmail: (env.SMTP_FROM_EMAIL || env.GMAIL_USER || 'support@fastaccs.com').trim(),
	whatsappNumber: '+2347047914208',
	currencyCode: 'NGN',
	lowStockThreshold: 10,
	winbackDaysThreshold: Math.max(1, Number(env.WINBACK_DAYS_THRESHOLD || 30)),
	broadcastBatchSize: Math.max(1, Number(env.BROADCAST_BATCH_SIZE || 10)),
	broadcastBatchDelayMs: Math.max(100, Number(env.BROADCAST_BATCH_DELAY_MS || 1000))
} as const;

export interface BusinessSettings {
	businessName: string;
	businessEmail: string;
	whatsappNumber: string;
	currencyCode: string;
}

export interface NotificationSettings {
	adminRecipients: string[];
	lowStockThreshold: number;
	winbackDaysThreshold: number;
	broadcastBatchSize: number;
	broadcastBatchDelayMs: number;
}

export interface AdminSettingsSnapshot {
	business: BusinessSettings;
	notifications: NotificationSettings;
}

interface ParsedNotificationRecipients {
	allRecipients: string[];
	extraRecipients: string[];
}

function normalizeEmailList(values: string[]): string[] {
	const unique = new Set<string>();

	for (const raw of values) {
		const email = raw.trim().toLowerCase();
		if (!email) continue;
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
		unique.add(email);
	}

	return [...unique];
}

function parseRecipients(value: string | null): ParsedNotificationRecipients {
	if (!value) {
		const defaults = normalizeEmailList(getAdminEmails());
		return {
			allRecipients: defaults,
			extraRecipients: []
		};
	}

	let parsedValues: string[] = [];

	try {
		const json = JSON.parse(value);
		if (Array.isArray(json)) {
			parsedValues = json.filter((entry): entry is string => typeof entry === 'string');
		}
	} catch {
		parsedValues = value
			.split(/[\n,;]+/)
			.map((entry) => entry.trim())
			.filter(Boolean);
	}

	const configured = normalizeEmailList(parsedValues);
	const defaults = normalizeEmailList(getAdminEmails());
	const allRecipients = normalizeEmailList([...defaults, ...configured]);
	const defaultSet = new Set(defaults);
	const extraRecipients = allRecipients.filter((email) => !defaultSet.has(email));

	return {
		allRecipients,
		extraRecipients
	};
}

function parseNumberSetting(
	value: string | null,
	fallback: number,
	bounds: { min: number; max: number }
): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(bounds.min, Math.min(bounds.max, Math.round(parsed)));
}

async function upsertSetting(key: string, value: string, description: string): Promise<void> {
	await prisma.microcopy.upsert({
		where: { key },
		update: {
			value,
			description,
			category: SETTINGS_CATEGORY,
			isActive: true
		},
		create: {
			key,
			value,
			description,
			category: SETTINGS_CATEGORY,
			isActive: true
		}
	});
}

async function getSettingsMap(keys: string[]): Promise<Map<string, string>> {
	const rows = await prisma.microcopy.findMany({
		where: {
			key: { in: keys }
		},
		select: {
			key: true,
			value: true
		}
	});

	return new Map(rows.map((row) => [row.key, row.value]));
}

export async function getAdminSettingsSnapshot(): Promise<AdminSettingsSnapshot> {
	const keys = Object.values(SETTINGS_KEYS);
	const values = await getSettingsMap(keys);
	const recipients = parseRecipients(values.get(SETTINGS_KEYS.adminRecipients) || null);

	return {
		business: {
			businessName: (values.get(SETTINGS_KEYS.businessName) || DEFAULTS.businessName).trim(),
			businessEmail: (values.get(SETTINGS_KEYS.businessEmail) || DEFAULTS.businessEmail).trim(),
			whatsappNumber: (values.get(SETTINGS_KEYS.whatsappNumber) || DEFAULTS.whatsappNumber).trim(),
			currencyCode: (values.get(SETTINGS_KEYS.currencyCode) || DEFAULTS.currencyCode)
				.trim()
				.toUpperCase()
		},
		notifications: {
			adminRecipients: recipients.allRecipients,
			lowStockThreshold: parseNumberSetting(
				values.get(SETTINGS_KEYS.lowStockThreshold) || null,
				DEFAULTS.lowStockThreshold,
				{ min: 1, max: 999 }
			),
			winbackDaysThreshold: parseNumberSetting(
				values.get(SETTINGS_KEYS.winbackDaysThreshold) || null,
				DEFAULTS.winbackDaysThreshold,
				{ min: 1, max: 365 }
			),
			broadcastBatchSize: parseNumberSetting(
				values.get(SETTINGS_KEYS.broadcastBatchSize) || null,
				DEFAULTS.broadcastBatchSize,
				{ min: 1, max: 1000 }
			),
			broadcastBatchDelayMs: parseNumberSetting(
				values.get(SETTINGS_KEYS.broadcastBatchDelayMs) || null,
				DEFAULTS.broadcastBatchDelayMs,
				{ min: 100, max: 60_000 }
			)
		}
	};
}

export async function saveBusinessSettings(input: Partial<BusinessSettings>): Promise<void> {
	const businessName = String(input.businessName || DEFAULTS.businessName).trim();
	const businessEmail = String(input.businessEmail || DEFAULTS.businessEmail).trim().toLowerCase();
	const whatsappNumber = String(input.whatsappNumber || DEFAULTS.whatsappNumber).trim();
	const currencyCode = String(input.currencyCode || DEFAULTS.currencyCode).trim().toUpperCase();

	await Promise.all([
		upsertSetting(
			SETTINGS_KEYS.businessName,
			businessName || DEFAULTS.businessName,
			'Business display name across storefront and communication templates.'
		),
		upsertSetting(
			SETTINGS_KEYS.businessEmail,
			businessEmail || DEFAULTS.businessEmail,
			'Business support/sender email reference.'
		),
		upsertSetting(
			SETTINGS_KEYS.whatsappNumber,
			whatsappNumber || DEFAULTS.whatsappNumber,
			'WhatsApp support number used across links and messaging.'
		),
		upsertSetting(
			SETTINGS_KEYS.currencyCode,
			currencyCode || DEFAULTS.currencyCode,
			'Storefront currency display code.'
		)
	]);
}

export async function saveNotificationSettings(input: {
	adminRecipients?: string;
	lowStockThreshold?: string | number;
	winbackDaysThreshold?: string | number;
	broadcastBatchSize?: string | number;
	broadcastBatchDelayMs?: string | number;
}): Promise<void> {
	const parsedRecipients = parseRecipients(input.adminRecipients || null);
	const lowStockThreshold = parseNumberSetting(
		String(input.lowStockThreshold ?? ''),
		DEFAULTS.lowStockThreshold,
		{ min: 1, max: 999 }
	);
	const winbackDaysThreshold = parseNumberSetting(
		String(input.winbackDaysThreshold ?? ''),
		DEFAULTS.winbackDaysThreshold,
		{ min: 1, max: 365 }
	);
	const broadcastBatchSize = parseNumberSetting(
		String(input.broadcastBatchSize ?? ''),
		DEFAULTS.broadcastBatchSize,
		{ min: 1, max: 1000 }
	);
	const broadcastBatchDelayMs = parseNumberSetting(
		String(input.broadcastBatchDelayMs ?? ''),
		DEFAULTS.broadcastBatchDelayMs,
		{ min: 100, max: 60_000 }
	);

	await Promise.all([
		upsertSetting(
			SETTINGS_KEYS.adminRecipients,
			JSON.stringify(parsedRecipients.extraRecipients),
			'Additional admin notification recipients beyond hardcoded owner admins.'
		),
		upsertSetting(
			SETTINGS_KEYS.lowStockThreshold,
			String(lowStockThreshold),
			'Default low-stock threshold for operational alerts.'
		),
		upsertSetting(
			SETTINGS_KEYS.winbackDaysThreshold,
			String(winbackDaysThreshold),
			'Win-back campaign inactivity threshold in days.'
		),
		upsertSetting(
			SETTINGS_KEYS.broadcastBatchSize,
			String(broadcastBatchSize),
			'Broadcast sender batch size.'
		),
		upsertSetting(
			SETTINGS_KEYS.broadcastBatchDelayMs,
			String(broadcastBatchDelayMs),
			'Broadcast delay between batch sends in milliseconds.'
		)
	]);
}

export async function getOperationalAlertRecipients(): Promise<string[]> {
	const snapshot = await getAdminSettingsSnapshot();
	return normalizeEmailList(snapshot.notifications.adminRecipients);
}

export async function getLowStockThresholdSetting(): Promise<number> {
	const snapshot = await getAdminSettingsSnapshot();
	return snapshot.notifications.lowStockThreshold;
}

export async function getLowStockAlertState(): Promise<{ signature: string | null; sentAt: string | null }> {
	const values = await getSettingsMap([SETTINGS_KEYS.lowStockLastSignature, SETTINGS_KEYS.lowStockLastSentAt]);
	return {
		signature: values.get(SETTINGS_KEYS.lowStockLastSignature) || null,
		sentAt: values.get(SETTINGS_KEYS.lowStockLastSentAt) || null
	};
}

export async function setLowStockAlertState(signature: string, sentAtIso: string): Promise<void> {
	await Promise.all([
		upsertSetting(
			SETTINGS_KEYS.lowStockLastSignature,
			signature,
			'Internal dedupe signature for low-stock alerts.'
		),
		upsertSetting(
			SETTINGS_KEYS.lowStockLastSentAt,
			sentAtIso,
			'Internal timestamp for low-stock alert cooldown checks.'
		)
	]);
}
