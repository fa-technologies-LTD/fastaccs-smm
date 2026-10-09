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
// boost_provider_services.rate_per_thousand is DECIMAL(18, 6), so values must stay below 10^12.
// Keep impossible supplier data reviewable as a quarantined row without letting it abort a sync.
const MAX_PERSISTABLE_RATE_PER_THOUSAND = 999_999_999_999;

const PLATFORM_PATTERNS: Record<BoostCatalogPlatform, RegExp> = {
	instagram: /instagram|(^|[^a-z])ig([^a-z]|$)/i,
	tiktok: /tik[\s-]?tok/i,
	youtube: /youtube|youtu\.be/i,
	facebook: /facebook|(^|[^a-z])fb([^a-z]|$)/i,
	x: /twitter|(^|[\s([{:])x(?=$|[\s)\]}:-])/i,
	threads: /threads?/i,
	spotify: /spotify/i,
	telegram: /telegram/i
};

const OUTCOME_PATTERNS: Record<BoostCatalogOutcome, RegExp> = {
	followers: /followers?/i,
	subscribers: /subscribers?/i,
	members: /members?|joiners?/i,
	views: /views?/i,
	live_likes: /live\s+likes?/i,
	impressions: /impressions?/i,
	reach: /\breach\b/i,
	story_shares: /stor(?:y|ies)\s+shares?/i,
	custom_comments: /custom\s+comments?/i,
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
	'live_likes',
	'impressions',
	'reach',
	'story_shares',
	'custom_comments',
	'streams',
	'likes',
	'reactions',
	'shares',
	'reposts',
	'comments',
	'saves',
	'watch_time'
]);

const TARGETED_AUDIENCE_PATTERN =
	/\b(?:geo|country|targeted|nigeria|nigerian|usa|united states|uk|united kingdom|canada|canadian|europe|european|africa|african|asia|asian|arab|arabic|latam|latin america|india|indian|brazil|brazilian|japan|japanese|korea|korean|indonesia|indonesian|pakistan|pakistani|bangladesh|bangladeshi|turkey|turkish|germany|german|france|french|italy|italian|spain|spanish|mexico|mexican|netherlands|dutch|australia|australian|philippines|filipino|vietnam|vietnamese|thailand|thai|malaysia|malaysian|singapore|singaporean|bahamas)\b/i;

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

function textForMatching(value: unknown): string {
	// Supplier catalogues frequently use mathematical-bold Unicode letters for words such as
	// "REFILL". NFKC turns those presentation characters back into ordinary searchable text
	// without changing the supplier name we retain for display.
	return String(value || '').normalize('NFKC');
}

export function inferAdvertisedRefillDays(value: string): number | null {
	const text = textForMatching(value);
	if (/\b(?:no|without)\s+(?:refill|refills)\b/i.test(text)) return null;
	const match =
		text.match(/\brefills?\s*(?:for\s*)?(\d{1,3})\s*(?:d|days?)\b/i) ||
		text.match(/\b(\d{1,3})\s*(?:d|days?)\s*refills?\b/i);
	if (!match) return null;
	const days = Number(match[1]);
	return Number.isInteger(days) && days > 0 && days <= 365 ? days : null;
}

export function supplierTextAdvertisesRefill(value: string): boolean {
	const text = textForMatching(value);
	if (/\b(?:no|without)\s+(?:refill|refills)\b/i.test(text)) return false;
	return inferAdvertisedRefillDays(text) !== null || /\brefills?\b/i.test(text);
}

function matchesFrom<T extends string>(
	text: string,
	values: readonly T[],
	patterns: Record<T, RegExp>
): T[] {
	return values.filter((value) => patterns[value].test(text));
}

export function isThreadsService(
	service: Pick<BoostProviderService, 'name' | 'category'>
): boolean {
	return /\bthreads?\b/i.test(`${service.name} ${service.category}`);
}

export function isUnsafeAutomaticServiceLabel(
	service: Pick<BoostProviderService, 'name' | 'category'> &
		Partial<Pick<BoostProviderService, 'qualitySignals'>>
): boolean {
	const label = `${service.name} ${service.category}`;
	return (
		/\b(?:test|trial|free)\b/i.test(label) ||
		TARGETED_AUDIENCE_PATTERN.test(label) ||
		service.qualitySignals?.includes('audience_claim') === true ||
		// These deliver engagement on an existing comment; they are not comments on the post.
		/\bcomment\s+(?:likes?|shares?|reposts?|quotes?)\b/i.test(label)
	);
}

function inferPlatforms(name: string, category: string): BoostCatalogPlatform[] {
	// The category is the strongest platform signal. This prevents labels such as "YouTube likes
	// from Threads" from becoming cross-platform matches. Some suppliers describe Threads as
	// "Threads by Instagram", so Threads wins whenever it appears in the category.
	const fromCategory = matchesFrom(category, BOOST_CATALOG_PLATFORMS, PLATFORM_PATTERNS);
	if (fromCategory.includes('threads')) return ['threads'];
	if (fromCategory.length) return fromCategory;
	return matchesFrom(name, BOOST_CATALOG_PLATFORMS, PLATFORM_PATTERNS);
}

function inferOutcomes(
	name: string,
	category: string,
	providerType?: string | null
): BoostCatalogOutcome[] {
	name = textForMatching(name);
	category = textForMatching(category);
	// These require different targets/options, not the ordinary post contract. Never let
	// a broad supplier category turn a poll, comment reaction or LIVE stream into a post order.
	if (
		/\b(?:poll|votes?|voting)\b/i.test(name) ||
		/\bcomments?\s+react(?:ions?)?\b/i.test(name) ||
		/\bstor(?:y|ies)\b.*\breactions?\b/i.test(name) ||
		/\b(?:live|live[\s-]?stream|concurrent)\b.*\bviews?\b/i.test(`${name} ${category}`)
	)
		return [];
	// LIVE comments need a stream-specific contract; never route them to post comments,
	// including saved classifications that predate this guard.
	if (
		/\b(?:live|live[\s-]?stream)(?:[\s_-]+chat)?[\s_-]+(?:custom[\s_-]+)?comments?\b/i.test(
			`${name} ${category}`
		)
	)
		return [];
	if (/^custom comments(?: package)?$/i.test(String(providerType ?? '').trim()))
		return ['custom_comments'];
	// Some panels incorrectly label custom-text rows as Default. The label still rules out
	// random comments; checkout must wait for a verified custom-input type on those rows.
	if (/\bcustom\s+comments?\b/i.test(name)) return ['custom_comments'];
	if (/\blive\s+likes?\b/i.test(`${name} ${category}`)) return ['live_likes'];
	if (/\bstor(?:y|ies)\s+shares?\b/i.test(`${name} ${category}`)) return ['story_shares'];
	// Supplier labels such as "Twitter - New Followers Impressions" describe
	// impressions, not follower delivery. Treat the more specific impressions
	// term as authoritative so the incidental word "followers" cannot route a
	// content-view service into a profile-follower offer.
	if (/\bimpressions?\b/i.test(name)) return ['impressions'];
	if (/\breach\b/i.test(name) && !/\bviews?\b/i.test(name)) return ['reach'];
	const fromName = matchesFrom(name, BOOST_CATALOG_OUTCOMES, OUTCOME_PATTERNS);
	return fromName.length
		? fromName
		: matchesFrom(category, BOOST_CATALOG_OUTCOMES, OUTCOME_PATTERNS);
}

/** Recheck structural labels even when a cached classification predates this classifier. */
export function serviceMatchesBoostOutcome(
	service: Pick<BoostProviderService, 'name' | 'category'> &
		Partial<Pick<BoostProviderService, 'providerType'>>,
	outcome: string
): boolean {
	return inferOutcomes(service.name, service.category, service.providerType).includes(
		outcome as BoostCatalogOutcome
	);
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
	text = textForMatching(text);
	const signals = new Set<string>();
	if (refillAdvertised) signals.add('refill_claim');
	if (/non[\s-]?drop|no\s+drop|stable/i.test(text)) signals.add('stability_claim');
	if (/premium|high\s+quality|(^|[^a-z])hq([^a-z]|$)|real/i.test(text)) {
		signals.add('quality_claim');
	}
	if (/instant|fast|speed/i.test(text)) signals.add('speed_claim');
	if (TARGETED_AUDIENCE_PATTERN.test(text)) {
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
	const parsedRatePerThousand = positiveNumber(raw.rate);
	const ratePerThousand =
		parsedRatePerThousand !== null && parsedRatePerThousand <= MAX_PERSISTABLE_RATE_PER_THOUSAND
			? parsedRatePerThousand
			: null;
	const minQuantity = positiveInteger(raw.min);
	const maxQuantity = positiveInteger(raw.max);
	const supplierDescription = `${name} ${category} ${description ?? ''}`;
	const explicitRefill = advertisedBoolean(raw.refill);
	const refillAdvertised =
		explicitRefill === true || supplierTextAdvertisesRefill(supplierDescription)
			? true
			: explicitRefill;
	const cancelAdvertised = advertisedBoolean(raw.cancel);
	const dripfeedAdvertised = advertisedBoolean(raw.dripfeed);
	const platforms = inferPlatforms(name, category);
	const outcomes = inferOutcomes(name, category, providerType);
	const anomalies: BoostCatalogAnomaly[] = [];

	if (!serviceId) anomalies.push('missing_service_id');
	if (!name) anomalies.push('missing_name');
	if (ratePerThousand === null) anomalies.push('invalid_rate');
	if (parsedRatePerThousand !== null && parsedRatePerThousand > SUSPICIOUS_RATE_PER_THOUSAND) {
		anomalies.push('suspicious_rate');
	}
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
		qualitySignals: inferQualitySignals(supplierDescription, refillAdvertised),
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
