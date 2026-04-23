export const TIER_IS_PINNED_KEY = 'is_pinned';
export const TIER_PIN_PRIORITY_KEY = 'pin_priority';
export const TIER_IS_FEATURED_KEY = 'is_featured';
export const TIER_FEATURED_BADGE_KEY = 'featured_badge';

const DEFAULT_PIN_PRIORITY = 100;
const MAX_BADGE_LENGTH = 40;

export interface TierMerchandisingState {
	isPinned: boolean;
	pinPriority: number | null;
	isFeatured: boolean;
	featuredBadge: string | null;
}

function toBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value === 1;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
	}
	return false;
}

function toPositiveInteger(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	const integer = Math.round(parsed);
	return integer > 0 ? integer : null;
}

function sanitizeBadge(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, MAX_BADGE_LENGTH);
}

export function getTierMerchandisingState(metadata: unknown): TierMerchandisingState {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return {
			isPinned: false,
			pinPriority: null,
			isFeatured: false,
			featuredBadge: null
		};
	}

	const record = metadata as Record<string, unknown>;
	const isPinned = toBoolean(record[TIER_IS_PINNED_KEY]);
	const pinPriority = isPinned ? toPositiveInteger(record[TIER_PIN_PRIORITY_KEY]) : null;
	const isFeatured = toBoolean(record[TIER_IS_FEATURED_KEY]);
	const featuredBadge = isFeatured ? sanitizeBadge(record[TIER_FEATURED_BADGE_KEY]) : null;

	return {
		isPinned,
		pinPriority: pinPriority ?? (isPinned ? DEFAULT_PIN_PRIORITY : null),
		isFeatured,
		featuredBadge: featuredBadge || (isFeatured ? 'Featured' : null)
	};
}

export function applyTierMerchandisingSanitization(
	metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
	const safeMetadata = metadata ? { ...metadata } : {};
	const state = getTierMerchandisingState(safeMetadata);

	if (state.isPinned) {
		safeMetadata[TIER_IS_PINNED_KEY] = true;
		safeMetadata[TIER_PIN_PRIORITY_KEY] = state.pinPriority ?? DEFAULT_PIN_PRIORITY;
	} else {
		delete safeMetadata[TIER_IS_PINNED_KEY];
		delete safeMetadata[TIER_PIN_PRIORITY_KEY];
	}

	if (state.isFeatured) {
		safeMetadata[TIER_IS_FEATURED_KEY] = true;
		safeMetadata[TIER_FEATURED_BADGE_KEY] = state.featuredBadge || 'Featured';
	} else {
		delete safeMetadata[TIER_IS_FEATURED_KEY];
		delete safeMetadata[TIER_FEATURED_BADGE_KEY];
	}

	return safeMetadata;
}
