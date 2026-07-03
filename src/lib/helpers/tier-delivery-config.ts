export const TIER_DELIVERY_MODE_KEY = 'delivery_mode';
export const TIER_MANUAL_HANDOVER_PROMISE_KEY = 'manual_handover_promise';
export const TIER_LOGIN_GUIDE_URL_KEY = 'login_guide_url';
export const TIER_LOGIN_GUIDE_LABEL_KEY = 'login_guide_label';
// Manual-handover tiers have no uploaded account inventory — availability is a
// manual owner toggle stored here (defaults to available unless explicitly false).
export const TIER_MANUAL_AVAILABLE_KEY = 'manual_available';

export const DEFAULT_MANUAL_HANDOVER_PROMISE =
	'Secure WhatsApp handover by our team, usually within 15–60 minutes.';
export const DEFAULT_LOGIN_GUIDE_URL = 'https://smm.fastaccs.com/support#after-purchase-guide';
export const DEFAULT_LOGIN_GUIDE_LABEL = 'How to login this account';
export const INSTANT_DELIVERY_LABEL = 'Instant Delivery';
export const MANUAL_HANDOVER_WHATSAPP_LABEL = 'Manual Handover (WhatsApp)';
export const BOOSTING_MANUAL_LABEL = 'Boosting Order';

export type TierDeliveryMode = 'instant_auto' | 'manual_handover' | 'boosting_manual';

export interface TierDeliveryConfig {
	mode: TierDeliveryMode;
	manualHandoverPromise: string | null;
	loginGuideUrl: string | null;
	loginGuideLabel: string | null;
	/** Manual-handover only: owner availability toggle. Defaults to true (available). */
	manualAvailable: boolean;
}

export interface TierStockStatus {
	/** True for manual-handover tiers (availability is a toggle, not a count). */
	isManual: boolean;
	/** Can the tier be purchased right now? */
	available: boolean;
	/** Storefront should show a numeric stock count (true) vs. just Available/Unavailable (false). */
	showAsCount: boolean;
}

/**
 * Single source of truth for whether a tier is purchasable and how to display it.
 * Manual-handover tiers use the owner toggle (no account inventory); everything
 * else uses the available-account count as before.
 */
export function getTierStockStatus(
	metadata: unknown,
	availableAccountCount: number
): TierStockStatus {
	const config = getTierDeliveryConfig(metadata);
	if (config.mode === 'manual_handover') {
		return { isManual: true, available: config.manualAvailable, showAsCount: false };
	}
	return { isManual: false, available: availableAccountCount > 0, showAsCount: true };
}

export function getTierDeliveryModeLabel(mode: TierDeliveryMode): string {
	if (mode === 'manual_handover') return MANUAL_HANDOVER_WHATSAPP_LABEL;
	if (mode === 'boosting_manual') return BOOSTING_MANUAL_LABEL;
	return INSTANT_DELIVERY_LABEL;
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
	if (normalized === 'manual_handover') return 'manual_handover';
	if (normalized === 'boosting_manual') return 'boosting_manual';
	return 'instant_auto';
}

export function getTierDeliveryConfig(metadata: unknown): TierDeliveryConfig {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return {
			mode: 'instant_auto',
			manualHandoverPromise: null,
			loginGuideUrl: null,
			loginGuideLabel: null,
			manualAvailable: true
		};
	}

	const record = metadata as Record<string, unknown>;
	const mode = normalizeTierDeliveryMode(record[TIER_DELIVERY_MODE_KEY]);
	const manualHandoverPromise = sanitizeText(record[TIER_MANUAL_HANDOVER_PROMISE_KEY], 180);
	const loginGuideUrl = sanitizeGuideUrl(record[TIER_LOGIN_GUIDE_URL_KEY]);
	const loginGuideLabel = sanitizeText(record[TIER_LOGIN_GUIDE_LABEL_KEY], 80);
	// Available unless the owner explicitly set it false.
	const manualAvailable = record[TIER_MANUAL_AVAILABLE_KEY] !== false;

	return {
		mode,
		manualHandoverPromise:
			mode === 'manual_handover'
				? manualHandoverPromise || DEFAULT_MANUAL_HANDOVER_PROMISE
				: manualHandoverPromise,
		loginGuideUrl,
		loginGuideLabel,
		manualAvailable
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
		safeMetadata[TIER_MANUAL_AVAILABLE_KEY] = config.manualAvailable;
	} else {
		delete safeMetadata[TIER_MANUAL_HANDOVER_PROMISE_KEY];
		delete safeMetadata[TIER_MANUAL_AVAILABLE_KEY];
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
