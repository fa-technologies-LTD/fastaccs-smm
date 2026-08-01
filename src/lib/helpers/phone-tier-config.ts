/**
 * Phone (Numbers) tier configuration read from a Category's metadata.
 * A tier is a "phone" tier when it carries a hub-man service+country mapping.
 * Kept separate from tier-delivery-config so account/boosting rendering is untouched.
 */

export const PHONE_TIER_KEYS = {
	deliveryMode: 'delivery_mode', // 'auto_sms' marks a Numbers tier
	serviceId: 'hub_service_id',
	countryId: 'hub_country_id',
	serviceName: 'hub_service_name',
	countryName: 'hub_country_name',
	expectedCostCents: 'hub_expected_cost_cents',
	availableCount: 'hub_available_count', // live stock at last refresh
	autoHidden: 'auto_hidden', // pulled from storefront by the auto-rules (no stock / failing)
	hideReason: 'auto_hide_reason' // 'no_stock' | 'low_success' — shown as the admin flag cue
} as const;

export const PHONE_DELIVERY_MODE = 'auto_sms';

export type PhoneHideReason = 'no_stock' | 'low_success';

export interface PhoneTierConfig {
	serviceId: number;
	countryId: number;
	serviceName: string;
	countryName: string;
	expectedCostCents: number;
	availableCount: number;
	autoHidden: boolean;
	hideReason: PhoneHideReason | null;
}

export function getPhoneTierConfig(metadata: unknown): PhoneTierConfig | null {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
	const r = metadata as Record<string, unknown>;
	if (String(r[PHONE_TIER_KEYS.deliveryMode] || '').toLowerCase() !== PHONE_DELIVERY_MODE) return null;

	const serviceId = Number(r[PHONE_TIER_KEYS.serviceId]);
	const countryId = Number(r[PHONE_TIER_KEYS.countryId]);
	if (!Number.isInteger(serviceId) || !Number.isInteger(countryId)) return null;

	const expectedCostCents = Number(r[PHONE_TIER_KEYS.expectedCostCents]);
	const availableCount = Number(r[PHONE_TIER_KEYS.availableCount]);
	const rawReason = String(r[PHONE_TIER_KEYS.hideReason] || '');
	const hideReason: PhoneHideReason | null =
		rawReason === 'no_stock' || rawReason === 'low_success' ? rawReason : null;

	return {
		serviceId,
		countryId,
		serviceName: String(r[PHONE_TIER_KEYS.serviceName] || `Service ${serviceId}`),
		countryName: String(r[PHONE_TIER_KEYS.countryName] || `Country ${countryId}`),
		expectedCostCents: Number.isFinite(expectedCostCents) && expectedCostCents > 0 ? expectedCostCents : 0,
		availableCount: Number.isFinite(availableCount) && availableCount > 0 ? availableCount : 0,
		autoHidden: r[PHONE_TIER_KEYS.autoHidden] === true,
		hideReason
	};
}

export function isPhoneTier(metadata: unknown): boolean {
	return getPhoneTierConfig(metadata) !== null;
}
