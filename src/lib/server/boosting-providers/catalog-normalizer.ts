import { createHash } from 'node:crypto';
import {
	BOOST_CATALOG_OUTCOMES,
	BOOST_CATALOG_PLATFORMS,
	type BoostCatalogAnomaly,
	type BoostCatalogOutcome,
	type BoostCatalogPlatform,
	type BoostCatalogStatus,
	type BoostProviderId,
	type BoostProviderService,
	type BoostTargetType
} from './types';

const SUSPICIOUS_RATE_PER_THOUSAND = 100_000;

const PLATFORM_PATTERNS: Record<BoostCatalogPlatform, RegExp> = {
	instagram: /instagram|(^|[^a-z])ig([^a-z]|$)/i,
	tiktok: /tik[\s-]?tok/i,
	youtube: /youtube|youtu\.be/i,
	facebook: /facebook|(^|[^a-z])fb([^a-z]|$)/i,
	x: /twitter|(^|[\s([{:])x(?=$|[\s)\]}:\-])/i,
	spotify: /spotify/i,
	telegram: /telegram/i
};

const OUTCOME_PATTERNS: Record<BoostCatalogOutcome, RegExp> = {
	followers: /followers?/i,
	subscribers: /subscribers?/i,
	members: /members?|joiners?/i,
	views: /views?/i,
	streams: /streams?|plays?/i,
	monthly_listeners: /monthly\s+listeners?/i,
	likes: /likes?/i,
	reactions: /reactions?/i,
	shares: /shares?/i,
	reposts: /reposts?|retweets?/i,
	comments: /comments?/i,
	saves: /saves?|favorites?|favourites?/i,
	watch_time: /watch\s*(time|hours?)/i
};

const PROFILE_OUTCOMES = new Set<BoostCatalogOutcome>([
	'followers',
	'subscribers',
	'monthly_listeners'
]);
const CHANNEL_OUTCOMES = new Set<BoostCatalogOutcome>(['members']);
const CONTENT_OUTCOMES = new Set<BoostCatalogOutcome>([
	'views',
	'streams',
	'likes',
	'reactions',
	'shares',
	'reposts',
	'comments',
	'saves',
	'watch_time'
]);

function textValue(value: unknown): string {
	return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function positiveNumber(value: unknown): number | null {
	const parsed = Number(textValue(value).replaceAll(',', ''));
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function positiveInteger(value: unknown): number | null {
	const parsed = positiveNumber(value);
	return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function advertisedBoolean(value: unknown): boolean | null {
	if (typeof value === 'boolean') return value;
	const normalized = textValue(value).toLowerCase();
	if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
	return null;
}

function matchesFrom<T extends string>(
	text: string,
	values: readonly T[],
	patterns: Record<T, RegExp>
): T[] {
	return values.filter((value) => patterns[value].test(text));
}

function inferPlatforms(name: string, category: string): BoostCatalogPlatform[] {
	return matchesFrom(`${category} ${name}`, BOOST_CATALOG_PLATFORMS, PLATFORM_PATTERNS);
}

function inferOutcomes(name: string, category: string): BoostCatalogOutcome[] {
	const fromName = matchesFrom(name, BOOST_CATALOG_OUTCOMES, OUTCOME_PATTERNS);
	return fromName.length
		? fromName
		: matchesFrom(category, BOOST_CATALOG_OUTCOMES, OUTCOME_PATTERNS);
}

function inferTargetType(outcomes: BoostCatalogOutcome[]): BoostTargetType {
	if (outcomes.length !== 1) return 'unknown';
	const [outcome] = outcomes;
	if (PROFILE_OUTCOMES.has(outcome)) return 'profile';
	if (CHANNEL_OUTCOMES.has(outcome)) return 'channel';
	if (CONTENT_OUTCOMES.has(outcome)) return 'content';
	return 'unknown';
}

function inferQualitySignals(text: string, refillAdvertised: boolean | null): string[] {
	const signals = new Set<string>();
	if (refillAdvertised) signals.add('refill_claim');
	if (/non[\s-]?drop|no\s+drop|stable/i.test(text)) signals.add('stability_claim');
	if (/premium|high\s+quality|(^|[^a-z])hq([^a-z]|$)|real/i.test(text)) {
		signals.add('quality_claim');
	}
	if (/instant|fast|speed/i.test(text)) signals.add('speed_claim');
	if (/geo|country|targeted|nigeria|usa|uk|canada|europe/i.test(text)) {
		signals.add('audience_claim');
	}
	return [...signals];
}

function fingerprint(value: Record<string, unknown>): string {
	const stable = Object.keys(value)
		.sort()
		.map((key) => [key, value[key]]);
	return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function deriveStatus(anomalies: BoostCatalogAnomaly[]): BoostCatalogStatus {
	const quarantined = new Set<BoostCatalogAnomaly>([
		'missing_service_id',
		'missing_name',
		'invalid_rate',
		'invalid_minimum',
		'invalid_maximum',
		'invalid_quantity_range'
	]);
	if (anomalies.some((anomaly) => quarantined.has(anomaly))) return 'quarantined';
	return anomalies.length > 0 ? 'needs_classification' : 'ready_for_review';
}

export function normalizeBoostProviderService(
	provider: BoostProviderId,
	rawValue: unknown
): BoostProviderService {
	const raw =
		rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
			? (rawValue as Record<string, unknown>)
			: {};
	const serviceId = textValue(raw.service ?? raw.serviceID ?? raw.id);
	const name = textValue(raw.name);
	const category = textValue(raw.category);
	const description = textValue(raw.description) || null;
	const providerType = textValue(raw.type) || null;
	const ratePerThousand = positiveNumber(raw.rate);
	const minQuantity = positiveInteger(raw.min);
	const maxQuantity = positiveInteger(raw.max);
	const refillAdvertised = advertisedBoolean(raw.refill);
	const cancelAdvertised = advertisedBoolean(raw.cancel);
	const dripfeedAdvertised = advertisedBoolean(raw.dripfeed);
	const platforms = inferPlatforms(name, category);
	const outcomes = inferOutcomes(name, category);
	const anomalies: BoostCatalogAnomaly[] = [];

	if (!serviceId) anomalies.push('missing_service_id');
	if (!name) anomalies.push('missing_name');
	if (ratePerThousand === null) anomalies.push('invalid_rate');
	else if (ratePerThousand > SUSPICIOUS_RATE_PER_THOUSAND) anomalies.push('suspicious_rate');
	if (minQuantity === null) anomalies.push('invalid_minimum');
	if (maxQuantity === null) anomalies.push('invalid_maximum');
	if (minQuantity !== null && maxQuantity !== null && minQuantity > maxQuantity) {
		anomalies.push('invalid_quantity_range');
	}
	if (platforms.length === 0) anomalies.push('unknown_platform');
	else if (platforms.length > 1) anomalies.push('ambiguous_platform');
	if (outcomes.length === 0) anomalies.push('unknown_outcome');
	else if (outcomes.length > 1) anomalies.push('ambiguous_outcome');

	return {
		provider,
		serviceId,
		name,
		category,
		description,
		providerType,
		ratePerThousand,
		minQuantity,
		maxQuantity,
		refillAdvertised,
		cancelAdvertised,
		dripfeedAdvertised,
		platforms,
		outcomes,
		targetType: inferTargetType(outcomes),
		qualitySignals: inferQualitySignals(
			`${name} ${category} ${description ?? ''}`,
			refillAdvertised
		),
		anomalies,
		status: deriveStatus(anomalies),
		fingerprint: fingerprint({
			serviceId,
			name,
			category,
			description,
			providerType,
			ratePerThousand,
			minQuantity,
			maxQuantity,
			refillAdvertised,
			cancelAdvertised,
			dripfeedAdvertised
		})
	};
}

export function normalizeBoostProviderCatalog(
	provider: BoostProviderId,
	payload: unknown
): BoostProviderService[] {
	if (!Array.isArray(payload)) throw new TypeError('Provider services response must be an array.');
	return payload.map((service) => normalizeBoostProviderService(provider, service));
}
