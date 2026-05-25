export const TIER_EXACT_PREVIEW_ENABLED_KEY = 'exact_preview_enabled';

export interface TierExactPreviewConfig {
	enabled: boolean;
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

export function getTierExactPreviewConfig(metadata: unknown): TierExactPreviewConfig {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return { enabled: false };
	}

	const record = metadata as Record<string, unknown>;
	return {
		enabled: toBoolean(record[TIER_EXACT_PREVIEW_ENABLED_KEY])
	};
}

export function applyTierExactPreviewSanitization(
	metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
	const safeMetadata = metadata ? { ...metadata } : {};
	const config = getTierExactPreviewConfig(safeMetadata);

	if (config.enabled) {
		safeMetadata[TIER_EXACT_PREVIEW_ENABLED_KEY] = true;
	} else {
		delete safeMetadata[TIER_EXACT_PREVIEW_ENABLED_KEY];
	}

	return safeMetadata;
}
