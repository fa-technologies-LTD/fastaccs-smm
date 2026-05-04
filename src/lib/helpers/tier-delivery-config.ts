export const TIER_DELIVERY_MODE_KEY = 'delivery_mode';
export const TIER_MANUAL_HANDOVER_PROMISE_KEY = 'manual_handover_promise';
export const TIER_LOGIN_GUIDE_URL_KEY = 'login_guide_url';
export const TIER_LOGIN_GUIDE_LABEL_KEY = 'login_guide_label';

export const DEFAULT_MANUAL_HANDOVER_PROMISE =
	'Secure WhatsApp handover by our team, usually within 15–60 minutes.';
export const DEFAULT_LOGIN_GUIDE_URL = 'https://smm.fastaccs.com/support#after-purchase-guide';
export const DEFAULT_LOGIN_GUIDE_LABEL = 'How to login this account';
export const INSTANT_DELIVERY_LABEL = 'Instant Delivery';
export const MANUAL_HANDOVER_WHATSAPP_LABEL = 'Manual Handover (WhatsApp)';

export type TierDeliveryMode = 'instant_auto' | 'manual_handover';

export interface TierDeliveryConfig {
	mode: TierDeliveryMode;
	manualHandoverPromise: string | null;
	loginGuideUrl: string | null;
	loginGuideLabel: string | null;
}

export function getTierDeliveryModeLabel(mode: TierDeliveryMode): string {
	return mode === 'manual_handover' ? MANUAL_HANDOVER_WHATSAPP_LABEL : INSTANT_DELIVERY_LABEL;
}

function sanitizeText(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, maxLength);
}

function sanitizeGuideUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith('/')) {
		return trimmed;
	}

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
		return parsed.toString();
	} catch {
		return null;
	}
}

export function normalizeTierDeliveryMode(value: unknown): TierDeliveryMode {
	if (typeof value !== 'string') return 'instant_auto';
	const normalized = value.trim().toLowerCase();
	return normalized === 'manual_handover' ? 'manual_handover' : 'instant_auto';
}

export function getTierDeliveryConfig(metadata: unknown): TierDeliveryConfig {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return {
			mode: 'instant_auto',
			manualHandoverPromise: null,
			loginGuideUrl: null,
			loginGuideLabel: null
		};
	}

	const record = metadata as Record<string, unknown>;
	const mode = normalizeTierDeliveryMode(record[TIER_DELIVERY_MODE_KEY]);
	const manualHandoverPromise = sanitizeText(record[TIER_MANUAL_HANDOVER_PROMISE_KEY], 180);
	const loginGuideUrl = sanitizeGuideUrl(record[TIER_LOGIN_GUIDE_URL_KEY]);
	const loginGuideLabel = sanitizeText(record[TIER_LOGIN_GUIDE_LABEL_KEY], 80);

	return {
		mode,
		manualHandoverPromise:
			mode === 'manual_handover'
				? manualHandoverPromise || DEFAULT_MANUAL_HANDOVER_PROMISE
				: manualHandoverPromise,
		loginGuideUrl,
		loginGuideLabel
	};
}

export function isManualHandoverTier(metadata: unknown): boolean {
	return getTierDeliveryConfig(metadata).mode === 'manual_handover';
}

export function applyTierDeliveryConfigSanitization(
	metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
	const safeMetadata = metadata ? { ...metadata } : {};
	const config = getTierDeliveryConfig(safeMetadata);

	safeMetadata[TIER_DELIVERY_MODE_KEY] = config.mode;

	if (config.mode === 'manual_handover') {
		safeMetadata[TIER_MANUAL_HANDOVER_PROMISE_KEY] =
			config.manualHandoverPromise || DEFAULT_MANUAL_HANDOVER_PROMISE;
	} else {
		delete safeMetadata[TIER_MANUAL_HANDOVER_PROMISE_KEY];
	}

	if (config.loginGuideUrl) {
		safeMetadata[TIER_LOGIN_GUIDE_URL_KEY] = config.loginGuideUrl;
		safeMetadata[TIER_LOGIN_GUIDE_LABEL_KEY] =
			config.loginGuideLabel || DEFAULT_LOGIN_GUIDE_LABEL;
	} else {
		delete safeMetadata[TIER_LOGIN_GUIDE_URL_KEY];
		delete safeMetadata[TIER_LOGIN_GUIDE_LABEL_KEY];
	}

	return safeMetadata;
}
