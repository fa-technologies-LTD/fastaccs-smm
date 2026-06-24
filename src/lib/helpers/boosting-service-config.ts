import type { BoostingActionType, BoostingPlatform } from '$lib/helpers/social-link-validator';

export const BOOSTING_PLATFORM_KEY = 'boosting_platform';
export const BOOSTING_ACTION_TYPE_KEY = 'boosting_action_type';
export const BOOSTING_MIN_QUANTITY_KEY = 'boosting_min_quantity';
export const BOOSTING_STEP_QUANTITY_KEY = 'boosting_step_quantity';
export const BOOSTING_PRICE_PER_STEP_KEY = 'boosting_price_per_step';
export const BOOSTING_REFILL_AVAILABLE_KEY = 'boosting_refill_available';
export const BOOSTING_REFILL_DAYS_KEY = 'boosting_refill_days';

export const BOOSTING_TURNAROUND_MESSAGE = 'Most orders start within a few hours.';

export const BOOSTING_PLATFORMS: BoostingPlatform[] = [
	'instagram',
	'tiktok',
	'youtube',
	'facebook',
	'x'
];

export const BOOSTING_ACTION_TYPES: BoostingActionType[] = [
	'followers',
	'subscribers',
	'likes',
	'views',
	'comments',
	'reposts'
];

export const BOOSTING_PLATFORM_LABELS: Record<BoostingPlatform, string> = {
	instagram: 'Instagram',
	tiktok: 'TikTok',
	youtube: 'YouTube',
	facebook: 'Facebook',
	x: 'X (Twitter)'
};

export const BOOSTING_ACTION_LABELS: Record<BoostingActionType, string> = {
	followers: 'Followers',
	subscribers: 'Subscribers',
	likes: 'Likes',
	views: 'Views',
	comments: 'Comments',
	reposts: 'Reposts'
};

export interface BoostingServiceConfig {
	platform: BoostingPlatform;
	actionType: BoostingActionType;
	minQuantity: number;
	stepQuantity: number;
	pricePerStep: number;
	refillAvailable: boolean;
	refillDays: number | null;
}

const DEFAULT_CONFIG: BoostingServiceConfig = {
	platform: 'instagram',
	actionType: 'followers',
	minQuantity: 500,
	stepQuantity: 500,
	pricePerStep: 0,
	refillAvailable: false,
	refillDays: null
};

function toPositiveInt(value: unknown, fallback: number): number {
	const num = Number(value);
	if (!Number.isFinite(num) || num <= 0) return fallback;
	return Math.round(num);
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
	const num = Number(value);
	if (!Number.isFinite(num) || num < 0) return fallback;
	return num;
}

export function getBoostingServiceConfig(metadata: unknown): BoostingServiceConfig {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return { ...DEFAULT_CONFIG };
	}

	const record = metadata as Record<string, unknown>;
	const platform = BOOSTING_PLATFORMS.includes(record[BOOSTING_PLATFORM_KEY] as BoostingPlatform)
		? (record[BOOSTING_PLATFORM_KEY] as BoostingPlatform)
		: DEFAULT_CONFIG.platform;
	const actionType = BOOSTING_ACTION_TYPES.includes(
		record[BOOSTING_ACTION_TYPE_KEY] as BoostingActionType
	)
		? (record[BOOSTING_ACTION_TYPE_KEY] as BoostingActionType)
		: DEFAULT_CONFIG.actionType;
	const minQuantity = toPositiveInt(record[BOOSTING_MIN_QUANTITY_KEY], DEFAULT_CONFIG.minQuantity);
	const stepQuantity = toPositiveInt(
		record[BOOSTING_STEP_QUANTITY_KEY],
		DEFAULT_CONFIG.stepQuantity
	);
	const pricePerStep = toNonNegativeNumber(
		record[BOOSTING_PRICE_PER_STEP_KEY],
		DEFAULT_CONFIG.pricePerStep
	);
	const refillAvailable = Boolean(record[BOOSTING_REFILL_AVAILABLE_KEY]);
	const refillDays = refillAvailable
		? toPositiveInt(record[BOOSTING_REFILL_DAYS_KEY], 30)
		: null;

	return { platform, actionType, minQuantity, stepQuantity, pricePerStep, refillAvailable, refillDays };
}

export function applyBoostingServiceConfigSanitization(metadata: unknown): Record<string, unknown> {
	const safeMetadata: Record<string, unknown> =
		metadata && typeof metadata === 'object' && !Array.isArray(metadata)
			? { ...(metadata as Record<string, unknown>) }
			: {};
	const config = getBoostingServiceConfig(safeMetadata);

	safeMetadata[BOOSTING_PLATFORM_KEY] = config.platform;
	safeMetadata[BOOSTING_ACTION_TYPE_KEY] = config.actionType;
	safeMetadata[BOOSTING_MIN_QUANTITY_KEY] = config.minQuantity;
	safeMetadata[BOOSTING_STEP_QUANTITY_KEY] = config.stepQuantity;
	safeMetadata[BOOSTING_PRICE_PER_STEP_KEY] = config.pricePerStep;
	safeMetadata[BOOSTING_REFILL_AVAILABLE_KEY] = config.refillAvailable;

	if (config.refillAvailable) {
		safeMetadata[BOOSTING_REFILL_DAYS_KEY] = config.refillDays ?? 30;
	} else {
		delete safeMetadata[BOOSTING_REFILL_DAYS_KEY];
	}

	return safeMetadata;
}

export function isValidBoostingQuantity(config: BoostingServiceConfig, quantity: number): boolean {
	if (!Number.isFinite(quantity) || quantity < config.minQuantity) return false;
	return (quantity - config.minQuantity) % config.stepQuantity === 0;
}

export function computeBoostingPrice(config: BoostingServiceConfig, quantity: number): number {
	if (!isValidBoostingQuantity(config, quantity)) return NaN;
	const steps = quantity / config.stepQuantity;
	return Math.round(steps * config.pricePerStep * 100) / 100;
}

const QUANTITY_CHIP_MULTIPLIERS = [1, 2, 5, 10];

export function getQuantityChips(config: BoostingServiceConfig): number[] {
	const chips = QUANTITY_CHIP_MULTIPLIERS.map((multiplier) => {
		const raw = config.minQuantity * multiplier;
		const steps = Math.max(1, Math.round(raw / config.stepQuantity));
		return Math.max(config.minQuantity, steps * config.stepQuantity);
	});
	return Array.from(new Set(chips));
}
