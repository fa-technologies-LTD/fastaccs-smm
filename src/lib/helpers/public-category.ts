import {
	BOOSTING_ACTION_TYPE_KEY,
	BOOSTING_MIN_QUANTITY_KEY,
	BOOSTING_PLATFORM_KEY,
	BOOSTING_PRICE_PER_STEP_KEY,
	BOOSTING_REFILL_AVAILABLE_KEY,
	BOOSTING_REFILL_DAYS_KEY,
	BOOSTING_STEP_QUANTITY_KEY,
	getBoostingServiceConfig
} from './boosting-service-config';

type JsonRecord = Record<string, unknown>;

const PLATFORM_METADATA_KEYS = [
	'icon',
	'iconUrl',
	'icon_url',
	'logo',
	'logo_url',
	'image',
	'image_url',
	'color'
] as const;

const TIER_METADATA_KEYS = [
	'features',
	'typical_features',
	'follower_range',
	'follower_count',
	'quality_score',
	'delivery_time',
	'replacement_guarantee',
	'age_hint',
	'sample_screenshot_urls',
	'exact_preview_enabled',
	'verified_x_follower_addons',
	'delivery_mode',
	'manual_available',
	'manual_handover_promise',
	'login_guide_url',
	'login_guide_label',
	'is_pinned',
	'pin_priority',
	'is_featured',
	'featured_badge'
] as const;

function asRecord(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function copyAllowed(source: JsonRecord, keys: readonly string[]): JsonRecord {
	const result: JsonRecord = {};
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key];
	}
	return result;
}

/**
 * Metadata crossing a public/customer boundary is rebuilt from a positive allowlist.
 * Private operational fields (costs, suppliers, affiliate policy, subscriber lists, etc.)
 * are therefore private by default even when new metadata is added later.
 */
export function sanitizePublicCategoryMetadata(
	categoryType: unknown,
	metadata: unknown
): JsonRecord {
	const source = asRecord(metadata);
	const type = String(categoryType || '')
		.trim()
		.toLowerCase();

	if (type === 'platform') return copyAllowed(source, PLATFORM_METADATA_KEYS);

	if (type === 'boosting_service') {
		const config = getBoostingServiceConfig(source);
		return {
			[BOOSTING_PLATFORM_KEY]: config.platform,
			[BOOSTING_ACTION_TYPE_KEY]: config.actionType,
			[BOOSTING_MIN_QUANTITY_KEY]: config.minQuantity,
			[BOOSTING_STEP_QUANTITY_KEY]: config.stepQuantity,
			[BOOSTING_PRICE_PER_STEP_KEY]: config.pricePerStep,
			[BOOSTING_REFILL_AVAILABLE_KEY]: config.refillAvailable,
			...(config.refillAvailable ? { [BOOSTING_REFILL_DAYS_KEY]: config.refillDays ?? 30 } : {})
		};
	}

	if (type !== 'tier') return {};

	const result = copyAllowed(source, TIER_METADATA_KEYS);
	const pricing = asRecord(source.pricing);
	const publicPricing = copyAllowed(pricing, ['base_price', 'bulk_discount', 'currency']);
	if (Object.keys(publicPricing).length > 0) result.pricing = publicPricing;
	if (Object.prototype.hasOwnProperty.call(source, 'price')) result.price = source.price;
	return result;
}

export function toPublicCategory(category: unknown): JsonRecord {
	const source = asRecord(category);
	const result = copyAllowed(source, [
		'id',
		'name',
		'slug',
		'description',
		'categoryType',
		'sortOrder',
		'isActive',
		'parentId'
	]);
	result.metadata = sanitizePublicCategoryMetadata(source.categoryType, source.metadata);
	if (source.parent) result.parent = toPublicCategory(source.parent);
	return result;
}
