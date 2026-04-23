import { env } from '$env/dynamic/private';
import { getAdminEmails } from '$lib/auth/admin';
import { prisma } from '$lib/prisma';

const SETTINGS_CATEGORY = 'settings';

const SETTINGS_KEYS = {
	businessName: 'config.business.name',
	businessEmail: 'config.business.email',
	whatsappNumber: 'config.business.whatsapp',
	currencyCode: 'config.business.currency',
	businessTimezone: 'config.business.timezone',
	paymentMinOrderValue: 'config.payment.min_order_value',
	paymentProcessingFeeEnabled: 'config.payment.processing_fee_enabled',
	storeMaintenanceMode: 'config.store.maintenance_mode',
	storeCheckoutEnabled: 'config.store.checkout_enabled',
	storeAutoDeliveryPaused: 'config.store.auto_delivery_paused',
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
	businessTimezone: (env.BUSINESS_TIMEZONE || 'Africa/Lagos').trim() || 'Africa/Lagos',
	paymentMinOrderValue: Math.max(0, Number(env.MIN_ORDER_VALUE || 0)),
	paymentProcessingFeeEnabled: (env.PROCESSING_FEE_ENABLED || '').toLowerCase() === 'true',
	storeMaintenanceMode: false,
	storeCheckoutEnabled: true,
	storeAutoDeliveryPaused: false,
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
	businessTimezone: string;
}

export interface PaymentSettings {
	minOrderValue: number;
	processingFeeEnabled: boolean;
}

export interface StoreControlSettings {
	maintenanceMode: boolean;
	checkoutEnabled: boolean;
	autoDeliveryPaused: boolean;
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
	payment: PaymentSettings;
	storeControls: StoreControlSettings;
	notifications: NotificationSettings;
}

export interface SmtpHealthSnapshot {
	configured: boolean;
	missing: string[];
	host: string;
	port: number;
	secure: boolean;
	userPreview: string;
	fromEmail: string;
	fromName: string;
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

function parseBooleanSetting(value: string | null, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return fallback;
	return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function previewSecret(value: string, visibleStart = 2, visibleEnd = 2): string {
	const trimmed = value.trim();
	if (!trimmed) return 'Not set';
	if (trimmed.length <= visibleStart + visibleEnd) return '*'.repeat(trimmed.length);
	return `${trimmed.slice(0, visibleStart)}${'*'.repeat(Math.max(4, trimmed.length - visibleStart - visibleEnd))}${trimmed.slice(-visibleEnd)}`;
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
				.toUpperCase(),
			businessTimezone: (
				values.get(SETTINGS_KEYS.businessTimezone) || DEFAULTS.businessTimezone
			).trim()
		},
		payment: {
			minOrderValue: parseNumberSetting(
				values.get(SETTINGS_KEYS.paymentMinOrderValue) || null,
				DEFAULTS.paymentMinOrderValue,
				{ min: 0, max: 10_000_000 }
			),
			processingFeeEnabled: parseBooleanSetting(
				values.get(SETTINGS_KEYS.paymentProcessingFeeEnabled) || null,
				DEFAULTS.paymentProcessingFeeEnabled
			)
		},
		storeControls: {
			maintenanceMode: parseBooleanSetting(
				values.get(SETTINGS_KEYS.storeMaintenanceMode) || null,
				DEFAULTS.storeMaintenanceMode
			),
			checkoutEnabled: parseBooleanSetting(
				values.get(SETTINGS_KEYS.storeCheckoutEnabled) || null,
				DEFAULTS.storeCheckoutEnabled
			),
			autoDeliveryPaused: parseBooleanSetting(
				values.get(SETTINGS_KEYS.storeAutoDeliveryPaused) || null,
				DEFAULTS.storeAutoDeliveryPaused
			)
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
	const businessEmail = String(input.businessEmail || DEFAULTS.businessEmail)
		.trim()
		.toLowerCase();
	const whatsappNumber = String(input.whatsappNumber || DEFAULTS.whatsappNumber).trim();
	const currencyCode = String(input.currencyCode || DEFAULTS.currencyCode)
		.trim()
		.toUpperCase();
	const businessTimezone = String(input.businessTimezone || DEFAULTS.businessTimezone).trim();

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
		),
		upsertSetting(
			SETTINGS_KEYS.businessTimezone,
			businessTimezone || DEFAULTS.businessTimezone,
			'Business reporting timezone used for analytics and operational consistency.'
		)
	]);
}

export async function savePaymentSettings(input: {
	minOrderValue?: string | number;
	processingFeeEnabled?: string | boolean;
}): Promise<void> {
	const minOrderValue = parseNumberSetting(
		String(input.minOrderValue ?? ''),
		DEFAULTS.paymentMinOrderValue,
		{ min: 0, max: 10_000_000 }
	);
	const processingFeeEnabled =
		typeof input.processingFeeEnabled === 'boolean'
			? input.processingFeeEnabled
			: parseBooleanSetting(
					String(input.processingFeeEnabled || ''),
					DEFAULTS.paymentProcessingFeeEnabled
				);

	await Promise.all([
		upsertSetting(
			SETTINGS_KEYS.paymentMinOrderValue,
			String(minOrderValue),
			'Minimum order value for checkout.'
		),
		upsertSetting(
			SETTINGS_KEYS.paymentProcessingFeeEnabled,
			processingFeeEnabled ? 'true' : 'false',
			'Payment processing fee display and calculation toggle.'
		)
	]);
}

export async function saveStoreControlSettings(input: {
	maintenanceMode?: string | boolean;
	checkoutEnabled?: string | boolean;
	autoDeliveryPaused?: string | boolean;
}): Promise<void> {
	const maintenanceMode =
		typeof input.maintenanceMode === 'boolean'
			? input.maintenanceMode
			: parseBooleanSetting(String(input.maintenanceMode || ''), DEFAULTS.storeMaintenanceMode);
	const checkoutEnabled =
		typeof input.checkoutEnabled === 'boolean'
			? input.checkoutEnabled
			: parseBooleanSetting(String(input.checkoutEnabled || ''), DEFAULTS.storeCheckoutEnabled);
	const autoDeliveryPaused =
		typeof input.autoDeliveryPaused === 'boolean'
			? input.autoDeliveryPaused
			: parseBooleanSetting(
					String(input.autoDeliveryPaused || ''),
					DEFAULTS.storeAutoDeliveryPaused
				);

	await Promise.all([
		upsertSetting(
			SETTINGS_KEYS.storeMaintenanceMode,
			maintenanceMode ? 'true' : 'false',
			'Maintenance mode toggle for storefront availability.'
		),
		upsertSetting(
			SETTINGS_KEYS.storeCheckoutEnabled,
			checkoutEnabled ? 'true' : 'false',
			'Checkout enable/disable toggle.'
		),
		upsertSetting(
			SETTINGS_KEYS.storeAutoDeliveryPaused,
			autoDeliveryPaused ? 'true' : 'false',
			'Auto-delivery pause/resume toggle.'
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

export async function getBusinessTimezoneSetting(): Promise<string> {
	const snapshot = await getAdminSettingsSnapshot();
	return snapshot.business.businessTimezone || DEFAULTS.businessTimezone;
}

export function getSmtpHealthSnapshot(): SmtpHealthSnapshot {
	const smtpHost = (env.SMTP_HOST || '').trim();
	const smtpPort = Number(env.SMTP_PORT || 0);
	const smtpUser = (env.SMTP_USER || '').trim();
	const smtpPassword = env.SMTP_PASSWORD || '';
	const fromEmail = (env.SMTP_FROM_EMAIL || env.GMAIL_USER || '').trim();
	const fromName = (env.SMTP_FROM_NAME || 'Fast Accounts').trim();
	const secure = (env.SMTP_SECURE || '').toLowerCase() === 'true';

	const missing: string[] = [];
	if (!smtpHost) missing.push('SMTP_HOST');
	if (!smtpPort) missing.push('SMTP_PORT');
	if (!smtpUser) missing.push('SMTP_USER');
	if (!smtpPassword) missing.push('SMTP_PASSWORD');
	if (!fromEmail) missing.push('SMTP_FROM_EMAIL (or GMAIL_USER)');

	return {
		configured: missing.length === 0,
		missing,
		host: smtpHost || 'Not set',
		port: smtpPort || 0,
		secure,
		userPreview: previewSecret(smtpUser),
		fromEmail: fromEmail || 'Not set',
		fromName: fromName || 'Fast Accounts'
	};
}

export async function getMinimumOrderValueSetting(): Promise<number> {
	const snapshot = await getAdminSettingsSnapshot();
	return snapshot.payment.minOrderValue;
}

export async function getStoreControlsSnapshot(): Promise<StoreControlSettings> {
	const snapshot = await getAdminSettingsSnapshot();
	return snapshot.storeControls;
}

export async function isCheckoutEnabledSetting(): Promise<boolean> {
	const snapshot = await getStoreControlsSnapshot();
	return snapshot.checkoutEnabled;
}

export async function isAutoDeliveryPausedSetting(): Promise<boolean> {
	const snapshot = await getStoreControlsSnapshot();
	return snapshot.autoDeliveryPaused;
}

export async function getLowStockAlertState(): Promise<{
	signature: string | null;
	sentAt: string | null;
}> {
	const values = await getSettingsMap([
		SETTINGS_KEYS.lowStockLastSignature,
		SETTINGS_KEYS.lowStockLastSentAt
	]);
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
