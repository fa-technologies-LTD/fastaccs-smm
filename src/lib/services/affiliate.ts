import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import {
	sendAffiliateUnlockEmailIfNeeded,
	sendFirstStoreCreditEmailIfNeeded
} from '$lib/services/affiliate-notification-email';
import { sendAffiliatePayoutStatusEmailIfNeeded } from '$lib/services/affiliate-payout-email';
import { sendEmail } from '$lib/services/email';
import { getOperationalAlertRecipients } from '$lib/services/admin-settings';

export const AFFILIATE_REFERRAL_COOKIE = 'fa_aff_ref';

const REFERRAL_LOCK_CATEGORY = 'affiliate_referral';
const REFERRAL_LOCK_KEY_PREFIX = 'affiliate.referral.lock.user.';
const UNLOCK_SENT_KEY_PREFIX = 'affiliate.unlock.sent.user.';

const AFFILIATE_CONFIG_KEYS = {
	unlockThreshold: 'config.affiliate.unlock_threshold',
	discountStage1Percent: 'config.affiliate.discount_stage1_percent',
	discountStage1Cap: 'config.affiliate.discount_stage1_cap',
	discountStage2Percent: 'config.affiliate.discount_stage2_percent',
	discountStage2Cap: 'config.affiliate.discount_stage2_cap',
	maxRewardedOrdersPerBuyer: 'config.affiliate.max_rewarded_orders_per_buyer',
	storeCreditMin: 'config.affiliate.store_credit_min',
	storeCreditMax: 'config.affiliate.store_credit_max',
	storeCreditFallbackPercent: 'config.affiliate.store_credit_fallback_percent',
	excludedTierKeywords: 'config.affiliate.excluded_tier_keywords',
	payoutMinimum: 'config.affiliate.payout_minimum',
	payoutMinAccountAgeDays: 'config.affiliate.payout_min_account_age_days',
	dashboardPopupsEnabled: 'config.affiliate.dashboard_popups_enabled'
} as const;

const DEFAULT_AFFILIATE_CONFIG = {
	unlockThreshold: 50_000,
	discountStage1Percent: 5,
	discountStage1Cap: 1_000,
	discountStage2Percent: 2,
	discountStage2Cap: 300,
	maxRewardedOrdersPerBuyer: 10,
	storeCreditMin: 50,
	storeCreditMax: 5_000,
	storeCreditFallbackPercent: 3,
	excludedTierKeywords: ['0f', 'empty-f', 'empty f'],
	payoutMinimum: 10_000,
	payoutMinAccountAgeDays: 30,
	dashboardPopupsEnabled: true
} as const;

const AFFILIATE_LEDGER_STATUS = {
	pending: 'pending',
	available: 'available',
	underReview: 'under_review',
	requested: 'requested',
	paid: 'paid',
	reversed: 'reversed'
} as const;

type AffiliateLedgerStatus = (typeof AFFILIATE_LEDGER_STATUS)[keyof typeof AFFILIATE_LEDGER_STATUS];

const AFFILIATE_LEDGER_CREDIT_TYPE = 'affiliate_credit';
const AFFILIATE_LEDGER_PAYOUT_TYPE = 'affiliate_payout';
const AFFILIATE_REFERRAL_BASE_URL = 'https://smm.fastaccs.com';

export const PROGRESS_MILESTONES = [95, 80, 50] as const;

export type AffiliatePopupType =
	| 'welcome'
	| 'progress_50'
	| 'progress_80'
	| 'progress_95'
	| 'unlocked';

const AFFILIATE_POPUP_SEEN_FIELDS = {
	welcome: 'affiliateWelcomePopupSeenAt',
	progress_50: 'affiliateProgress50PopupSeenAt',
	progress_80: 'affiliateProgress80PopupSeenAt',
	progress_95: 'affiliateProgress95PopupSeenAt',
	unlocked: 'affiliateUnlockedPopupSeenAt'
} as const;

export interface AffiliateConfig {
	unlockThreshold: number;
	discountStage1Percent: number;
	discountStage1Cap: number;
	discountStage2Percent: number;
	discountStage2Cap: number;
	maxRewardedOrdersPerBuyer: number;
	storeCreditMin: number;
	storeCreditMax: number;
	storeCreditFallbackPercent: number;
	excludedTierKeywords: string[];
	payoutMinimum: number;
	payoutMinAccountAgeDays: number;
	dashboardPopupsEnabled: boolean;
}

export interface LockedReferralAttribution {
	affiliateProgramId: string;
	affiliateCode: string;
	referrerUserId: string;
	referredUserId: string;
	source: string;
	lockedAt: string;
}

export interface AffiliateQualificationStatus {
	eligible: boolean;
	lifetimeCompletedSpend: number;
	threshold: number;
	reason: 'eligible' | 'below_threshold' | 'inactive_user' | 'user_not_found';
}

export interface AffiliateDiscountResult {
	discountAmount: number;
	orderIndex: number;
	stage: 'stage_1' | 'stage_2' | 'none';
	stageLabel: 'Stage 1' | 'Stage 2' | 'Expired';
	remainingRewardedOrders: number;
	expiresAfterOrder: number;
	maxRewardedOrders: number;
	ruleMode: 'percent_cap' | 'tier_flat' | 'none';
}

export interface AffiliateRecentReferralActivity {
	userId: string;
	displayName: string;
	status: 'signed_up' | 'paid_customer' | 'repeat_buyer';
	ordersCount: number;
	storeCreditEarned: number;
	lastActivityAt: string;
}

export interface AffiliateRecentStoreCreditActivity {
	id: string;
	title: string;
	statusLabel: string;
	amount: number;
	isCredit: boolean;
	createdAt: string;
}

export interface AffiliateDashboardState {
	eligible: boolean;
	unlocked: boolean;
	canActivate: boolean;
	isActive: boolean;
	lifetimeCompletedSpend: number;
	unlockThreshold: number;
	payoutEligible: boolean;
	payoutMinimum: number;
	payoutMinAccountAgeDays: number;
	availableStoreCredit: number;
	pendingStoreCredit: number;
	underReviewStoreCredit: number;
	requestedStoreCredit: number;
	paidStoreCredit: number;
	reversedStoreCredit: number;
	totalStoreCreditEarned: number;
	totalReferredUsers: number;
	successfulReferredOrders: number;
	codeUsesThisMonth: number;
	paidReferredUsers: number;
	affiliateCode: string | null;
	referralLink: string | null;
	programStatus: string | null;
	recentReferralActivity: AffiliateRecentReferralActivity[];
	recentStoreCreditActivity: AffiliateRecentStoreCreditActivity[];
	pendingPopup: AffiliatePopupType | null;
}

interface AffiliateLedgerSummary {
	availableStoreCredit: number;
	pendingStoreCredit: number;
	underReviewStoreCredit: number;
	requestedStoreCredit: number;
	paidStoreCredit: number;
	reversedStoreCredit: number;
	totalStoreCreditEarned: number;
}

function getReferralLockKey(userId: string): string {
	return `${REFERRAL_LOCK_KEY_PREFIX}${userId}`;
}

function getUnlockSentKey(userId: string): string {
	return `${UNLOCK_SENT_KEY_PREFIX}${userId}`;
}

function parseNumberSetting(
	value: string | null | undefined,
	fallback: number,
	min: number,
	max: number
): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(min, Math.min(max, parsed));
}

function parseBooleanSetting(value: string | null | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return fallback;
	return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseKeywordsSetting(
	value: string | null | undefined,
	fallback: readonly string[]
): string[] {
	const raw = String(value || '')
		.trim()
		.toLowerCase();
	if (!raw) return [...fallback];

	const parsed = raw
		.split(/[\n,;]+/)
		.map((entry) => entry.trim())
		.filter(Boolean);

	if (!parsed.length) return [...fallback];
	return [...new Set(parsed)];
}

function getBaseUrl(): string {
	const candidate = (
		env.PUBLIC_BASE_URL ||
		process.env.PUBLIC_BASE_URL ||
		process.env.PUBLIC_SITE_URL ||
		''
	).trim();
	if (!candidate) return 'https://smm.fastaccs.com';

	try {
		const parsed = new URL(candidate);
		return parsed.origin.replace(/\/+$/, '');
	} catch {
		return 'https://smm.fastaccs.com';
	}
}

export function getAffiliateReferralBaseUrl(): string {
	return AFFILIATE_REFERRAL_BASE_URL;
}

export function getPendingAffiliatePopup(input: {
	unlocked: boolean;
	spendProgressPercent: number;
	popupsEnabled: boolean;
	seenAt: {
		welcome: Date | null;
		progress50: Date | null;
		progress80: Date | null;
		progress95: Date | null;
		unlocked: Date | null;
	};
}): AffiliatePopupType | null {
	if (!input.popupsEnabled) return null;

	if (input.unlocked && !input.seenAt.unlocked) return 'unlocked';

	const milestoneSeenAt: Record<(typeof PROGRESS_MILESTONES)[number], Date | null> = {
		95: input.seenAt.progress95,
		80: input.seenAt.progress80,
		50: input.seenAt.progress50
	};
	const milestone = PROGRESS_MILESTONES.find(
		(candidate) => input.spendProgressPercent >= candidate && !milestoneSeenAt[candidate]
	);
	if (milestone) return `progress_${milestone}` as AffiliatePopupType;

	if (!input.seenAt.welcome) return 'welcome';

	return null;
}

function normalizeAffiliateCode(value: string | null | undefined): string | null {
	const normalized = String(value || '')
		.trim()
		.toUpperCase();
	return normalized || null;
}

function toRoundedNaira(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.floor(value));
}

function toPositiveNumber(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return parsed;
}

function toBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value === 1;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		return (
			normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
		);
	}
	return false;
}

function parseMetadataObject(value: unknown): Record<string, unknown> {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

function isAffiliateLineExcluded(
	productName: string,
	metadata: Record<string, unknown>,
	config: AffiliateConfig
): boolean {
	const loweredName = String(productName || '').toLowerCase();
	const keywordBlocked = config.excludedTierKeywords.some((keyword) =>
		loweredName.includes(keyword)
	);
	const explicitlyExcluded =
		toBoolean(metadata.affiliate_excluded) || toBoolean(metadata.affiliate_discount_excluded);
	return keywordBlocked || explicitlyExcluded;
}

function parseLockedReferral(value: string | null | undefined): LockedReferralAttribution | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as Record<string, unknown>;
		const affiliateProgramId = String(parsed.affiliateProgramId || '').trim();
		const affiliateCode = normalizeAffiliateCode(String(parsed.affiliateCode || ''));
		const referrerUserId = String(parsed.referrerUserId || '').trim();
		const referredUserId = String(parsed.referredUserId || '').trim();
		const source = String(parsed.source || 'unknown').trim() || 'unknown';
		const lockedAt = String(parsed.lockedAt || '').trim() || new Date().toISOString();

		if (!affiliateProgramId || !affiliateCode || !referrerUserId || !referredUserId) {
			return null;
		}

		return {
			affiliateProgramId,
			affiliateCode,
			referrerUserId,
			referredUserId,
			source,
			lockedAt
		};
	} catch {
		return null;
	}
}

function sanitizeEmailName(value: string | null | undefined): string {
	const text = String(value || '').trim();
	if (!text) return 'there';
	return text.split(/\s+/)[0] || 'there';
}

function formatAffiliateDisplayName(value: string | null | undefined): string {
	const source = String(value || '').trim();
	if (!source) return 'User';

	const parts = source
		.split(/\s+/)
		.map((entry) => entry.trim())
		.filter(Boolean);

	if (!parts.length) return 'User';
	if (parts.length === 1) return parts[0];

	const first = parts[0];
	const lastInitial = parts[parts.length - 1]?.[0]?.toUpperCase();
	return lastInitial ? `${first} ${lastInitial}.` : first;
}

function firstIsoTimestamp(values: Array<Date | string | null | undefined>): string {
	for (const value of values) {
		if (value instanceof Date && Number.isFinite(value.getTime())) {
			return value.toISOString();
		}
		if (typeof value === 'string' && value.trim()) {
			const parsed = new Date(value);
			if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
		}
	}

	return new Date().toISOString();
}

function mapLedgerStatusLabel(value: string): string {
	const normalized = String(value || '')
		.trim()
		.toLowerCase();

	switch (normalized) {
		case AFFILIATE_LEDGER_STATUS.available:
			return 'Available';
		case AFFILIATE_LEDGER_STATUS.pending:
			return 'Pending';
		case AFFILIATE_LEDGER_STATUS.underReview:
			return 'Under review';
		case AFFILIATE_LEDGER_STATUS.requested:
			return 'Requested';
		case AFFILIATE_LEDGER_STATUS.paid:
			return 'Paid';
		case AFFILIATE_LEDGER_STATUS.reversed:
			return 'Reversed';
		default:
			return 'Pending';
	}
}

function mapStoreCreditTitle(type: string, status: string): string {
	const normalizedType = String(type || '').trim();
	const normalizedStatus = String(status || '')
		.trim()
		.toLowerCase();

	if (normalizedType === AFFILIATE_LEDGER_PAYOUT_TYPE) {
		if (normalizedStatus === AFFILIATE_LEDGER_STATUS.requested) return 'Payout requested';
		if (normalizedStatus === AFFILIATE_LEDGER_STATUS.paid) return 'Payout completed';
		if (normalizedStatus === AFFILIATE_LEDGER_STATUS.reversed) return 'Payout reversed';
		return 'Payout update';
	}

	if (normalizedStatus === AFFILIATE_LEDGER_STATUS.pending) return 'Referral order paid';
	if (normalizedStatus === AFFILIATE_LEDGER_STATUS.available) return 'Referral order completed';
	if (normalizedStatus === AFFILIATE_LEDGER_STATUS.underReview) return 'Store Credit under review';
	if (normalizedStatus === AFFILIATE_LEDGER_STATUS.reversed) return 'Store Credit reversed';
	return 'Store Credit update';
}

function isKnownAffiliateLedgerStatus(value: string): value is AffiliateLedgerStatus {
	return Object.values(AFFILIATE_LEDGER_STATUS).includes(value as AffiliateLedgerStatus);
}

async function getAffiliateLedgerSummary(userId: string): Promise<AffiliateLedgerSummary> {
	const grouped = await prisma.walletTransaction.groupBy({
		by: ['type', 'status'],
		where: {
			userId,
			type: {
				in: [AFFILIATE_LEDGER_CREDIT_TYPE, AFFILIATE_LEDGER_PAYOUT_TYPE]
			}
		},
		_sum: {
			amount: true
		}
	});

	const creditByStatus: Record<AffiliateLedgerStatus, number> = {
		pending: 0,
		available: 0,
		under_review: 0,
		requested: 0,
		paid: 0,
		reversed: 0
	};

	const payoutByStatus: Record<AffiliateLedgerStatus, number> = {
		pending: 0,
		available: 0,
		under_review: 0,
		requested: 0,
		paid: 0,
		reversed: 0
	};

	for (const row of grouped) {
		const status = String(row.status || '')
			.trim()
			.toLowerCase();
		if (!isKnownAffiliateLedgerStatus(status)) continue;
		const amount = Math.max(0, Number(row._sum.amount || 0));
		if (String(row.type) === AFFILIATE_LEDGER_CREDIT_TYPE) {
			creditByStatus[status] += amount;
		} else if (String(row.type) === AFFILIATE_LEDGER_PAYOUT_TYPE) {
			payoutByStatus[status] += amount;
		}
	}

	const pendingStoreCredit = creditByStatus.pending;
	const underReviewStoreCredit = creditByStatus.under_review;
	const requestedStoreCredit = payoutByStatus.requested;
	const paidStoreCredit = payoutByStatus.paid;
	const reversedStoreCredit = creditByStatus.reversed + payoutByStatus.reversed;

	const totalStoreCreditEarned = Math.max(
		0,
		creditByStatus.available +
			creditByStatus.pending +
			creditByStatus.under_review +
			creditByStatus.requested +
			creditByStatus.paid
	);
	const availableStoreCredit = Math.max(
		0,
		creditByStatus.available - requestedStoreCredit - paidStoreCredit
	);

	return {
		availableStoreCredit,
		pendingStoreCredit,
		underReviewStoreCredit,
		requestedStoreCredit,
		paidStoreCredit,
		reversedStoreCredit,
		totalStoreCreditEarned
	};
}

async function countSuccessfulOrdersForAffiliatePair(
	buyerUserId: string,
	affiliateUserId: string
): Promise<number> {
	return prisma.order.count({
		where: {
			userId: buyerUserId,
			affiliateUserId,
			OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }]
		}
	});
}

async function countLifetimeCompletedSpend(userId: string): Promise<number> {
	const aggregate = await prisma.order.aggregate({
		where: {
			userId,
			OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }]
		},
		_sum: {
			totalAmount: true
		}
	});

	return Number(aggregate._sum.totalAmount || 0);
}

async function parseAffiliateConfig(): Promise<AffiliateConfig> {
	const keyList = Object.values(AFFILIATE_CONFIG_KEYS);
	const rows = await prisma.microcopy.findMany({
		where: {
			key: { in: keyList }
		},
		select: {
			key: true,
			value: true
		}
	});

	const byKey = new Map(rows.map((row) => [row.key, row.value]));

	return {
		unlockThreshold: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.unlockThreshold),
			DEFAULT_AFFILIATE_CONFIG.unlockThreshold,
			5_000,
			10_000_000
		),
		discountStage1Percent: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.discountStage1Percent),
			DEFAULT_AFFILIATE_CONFIG.discountStage1Percent,
			0,
			50
		),
		discountStage1Cap: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.discountStage1Cap),
			DEFAULT_AFFILIATE_CONFIG.discountStage1Cap,
			0,
			1_000_000
		),
		discountStage2Percent: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.discountStage2Percent),
			DEFAULT_AFFILIATE_CONFIG.discountStage2Percent,
			0,
			50
		),
		discountStage2Cap: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.discountStage2Cap),
			DEFAULT_AFFILIATE_CONFIG.discountStage2Cap,
			0,
			1_000_000
		),
		maxRewardedOrdersPerBuyer: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.maxRewardedOrdersPerBuyer),
			DEFAULT_AFFILIATE_CONFIG.maxRewardedOrdersPerBuyer,
			1,
			100
		),
		storeCreditMin: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.storeCreditMin),
			DEFAULT_AFFILIATE_CONFIG.storeCreditMin,
			0,
			100_000
		),
		storeCreditMax: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.storeCreditMax),
			DEFAULT_AFFILIATE_CONFIG.storeCreditMax,
			0,
			1_000_000
		),
		storeCreditFallbackPercent: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.storeCreditFallbackPercent),
			DEFAULT_AFFILIATE_CONFIG.storeCreditFallbackPercent,
			0,
			50
		),
		excludedTierKeywords: parseKeywordsSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.excludedTierKeywords),
			DEFAULT_AFFILIATE_CONFIG.excludedTierKeywords
		),
		payoutMinimum: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.payoutMinimum),
			DEFAULT_AFFILIATE_CONFIG.payoutMinimum,
			1_000,
			10_000_000
		),
		payoutMinAccountAgeDays: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.payoutMinAccountAgeDays),
			DEFAULT_AFFILIATE_CONFIG.payoutMinAccountAgeDays,
			0,
			365
		),
		dashboardPopupsEnabled: parseBooleanSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.dashboardPopupsEnabled),
			DEFAULT_AFFILIATE_CONFIG.dashboardPopupsEnabled
		)
	};
}

export async function getAffiliateConfig(): Promise<AffiliateConfig> {
	return parseAffiliateConfig();
}

export async function saveAffiliateConfig(input: {
	unlockThreshold: string;
	discountStage1Percent: string;
	discountStage1Cap: string;
	discountStage2Percent: string;
	discountStage2Cap: string;
	maxRewardedOrdersPerBuyer: string;
	storeCreditMin: string;
	storeCreditMax: string;
	storeCreditFallbackPercent: string;
	excludedTierKeywords: string;
	payoutMinimum: string;
	payoutMinAccountAgeDays: string;
	dashboardPopupsEnabled: string;
}): Promise<AffiliateConfig> {
	const nextConfig: AffiliateConfig = {
		unlockThreshold: parseNumberSetting(
			input.unlockThreshold,
			DEFAULT_AFFILIATE_CONFIG.unlockThreshold,
			5_000,
			10_000_000
		),
		discountStage1Percent: parseNumberSetting(
			input.discountStage1Percent,
			DEFAULT_AFFILIATE_CONFIG.discountStage1Percent,
			0,
			50
		),
		discountStage1Cap: parseNumberSetting(
			input.discountStage1Cap,
			DEFAULT_AFFILIATE_CONFIG.discountStage1Cap,
			0,
			1_000_000
		),
		discountStage2Percent: parseNumberSetting(
			input.discountStage2Percent,
			DEFAULT_AFFILIATE_CONFIG.discountStage2Percent,
			0,
			50
		),
		discountStage2Cap: parseNumberSetting(
			input.discountStage2Cap,
			DEFAULT_AFFILIATE_CONFIG.discountStage2Cap,
			0,
			1_000_000
		),
		maxRewardedOrdersPerBuyer: parseNumberSetting(
			input.maxRewardedOrdersPerBuyer,
			DEFAULT_AFFILIATE_CONFIG.maxRewardedOrdersPerBuyer,
			1,
			100
		),
		storeCreditMin: parseNumberSetting(
			input.storeCreditMin,
			DEFAULT_AFFILIATE_CONFIG.storeCreditMin,
			0,
			100_000
		),
		storeCreditMax: parseNumberSetting(
			input.storeCreditMax,
			DEFAULT_AFFILIATE_CONFIG.storeCreditMax,
			0,
			1_000_000
		),
		storeCreditFallbackPercent: parseNumberSetting(
			input.storeCreditFallbackPercent,
			DEFAULT_AFFILIATE_CONFIG.storeCreditFallbackPercent,
			0,
			50
		),
		excludedTierKeywords: parseKeywordsSetting(
			input.excludedTierKeywords,
			DEFAULT_AFFILIATE_CONFIG.excludedTierKeywords
		),
		payoutMinimum: parseNumberSetting(
			input.payoutMinimum,
			DEFAULT_AFFILIATE_CONFIG.payoutMinimum,
			1_000,
			10_000_000
		),
		payoutMinAccountAgeDays: parseNumberSetting(
			input.payoutMinAccountAgeDays,
			DEFAULT_AFFILIATE_CONFIG.payoutMinAccountAgeDays,
			0,
			365
		),
		dashboardPopupsEnabled: parseBooleanSetting(
			input.dashboardPopupsEnabled,
			DEFAULT_AFFILIATE_CONFIG.dashboardPopupsEnabled
		)
	};

	const entries: Array<[string, string, string]> = [
		[
			AFFILIATE_CONFIG_KEYS.unlockThreshold,
			String(nextConfig.unlockThreshold),
			'Affiliate unlock lifetime spend threshold'
		],
		[
			AFFILIATE_CONFIG_KEYS.discountStage1Percent,
			String(nextConfig.discountStage1Percent),
			'Affiliate buyer discount percent for stage 1'
		],
		[
			AFFILIATE_CONFIG_KEYS.discountStage1Cap,
			String(nextConfig.discountStage1Cap),
			'Affiliate buyer discount cap for stage 1'
		],
		[
			AFFILIATE_CONFIG_KEYS.discountStage2Percent,
			String(nextConfig.discountStage2Percent),
			'Affiliate buyer discount percent for stage 2'
		],
		[
			AFFILIATE_CONFIG_KEYS.discountStage2Cap,
			String(nextConfig.discountStage2Cap),
			'Affiliate buyer discount cap for stage 2'
		],
		[
			AFFILIATE_CONFIG_KEYS.maxRewardedOrdersPerBuyer,
			String(nextConfig.maxRewardedOrdersPerBuyer),
			'Maximum rewarded referred orders per buyer'
		],
		[
			AFFILIATE_CONFIG_KEYS.storeCreditMin,
			String(nextConfig.storeCreditMin),
			'Minimum affiliate Store Credit reward'
		],
		[
			AFFILIATE_CONFIG_KEYS.storeCreditMax,
			String(nextConfig.storeCreditMax),
			'Maximum affiliate Store Credit reward'
		],
		[
			AFFILIATE_CONFIG_KEYS.storeCreditFallbackPercent,
			String(nextConfig.storeCreditFallbackPercent),
			'Fallback Store Credit percent'
		],
		[
			AFFILIATE_CONFIG_KEYS.excludedTierKeywords,
			nextConfig.excludedTierKeywords.join(', '),
			'Tier keywords excluded from affiliate rewards'
		],
		[
			AFFILIATE_CONFIG_KEYS.payoutMinimum,
			String(nextConfig.payoutMinimum),
			'Minimum Store Credit required before payout'
		],
		[
			AFFILIATE_CONFIG_KEYS.payoutMinAccountAgeDays,
			String(nextConfig.payoutMinAccountAgeDays),
			'Minimum affiliate account age before payout'
		],
		[
			AFFILIATE_CONFIG_KEYS.dashboardPopupsEnabled,
			String(nextConfig.dashboardPopupsEnabled),
			'Show affiliate dashboard pop-ups (welcome, progress, unlock)'
		]
	];

	await prisma.$transaction(
		entries.map(([key, value, description]) =>
			prisma.microcopy.upsert({
				where: { key },
				create: {
					key,
					value,
					description,
					category: 'affiliate',
					isActive: true
				},
				update: {
					value,
					description,
					category: 'affiliate',
					isActive: true,
					updatedAt: new Date()
				}
			})
		)
	);

	return nextConfig;
}

/**
 * Extract initials from a full name
 * Examples: "John Doe" -> "JD", "Alice" -> "A", "Mary Jane Watson" -> "MJW"
 */
export function extractInitials(fullName: string): string {
	if (!fullName || fullName.trim() === '') {
		return 'U';
	}

	const words = fullName.trim().toUpperCase().split(/\s+/);
	const initials = words.map((word) => word[0]).join('');
	return initials || 'U';
}

/**
 * Get the next running number for a given initial prefix.
 */
export async function getNextRunningNumber(initials: string): Promise<number> {
	const existingCodes = await prisma.affiliateProgram.findMany({
		where: {
			affiliateCode: {
				startsWith: initials
			}
		},
		select: {
			affiliateCode: true
		}
	});

	if (!existingCodes.length) return 1;

	const escapedInitials = initials.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const matcher = new RegExp(`^${escapedInitials}(\\d+)$`);
	const numbers = existingCodes
		.map((record) => {
			const match = record.affiliateCode.match(matcher);
			return match ? parseInt(match[1], 10) : 0;
		})
		.filter((num) => num > 0);

	const maxNumber = Math.max(...numbers, 0);
	return maxNumber + 1;
}

/**
 * Generate a unique affiliate code using initials + running number.
 */
export async function generateAffiliateCode(userId: string): Promise<string> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { fullName: true }
	});

	if (!user) {
		throw new Error('User not found');
	}

	const initials = extractInitials(user.fullName || '');
	const runningNumber = await getNextRunningNumber(initials);
	const formattedNumber = runningNumber.toString().padStart(3, '0');
	const affiliateCode = `${initials}${formattedNumber}`;

	const existing = await prisma.affiliateProgram.findUnique({
		where: { affiliateCode }
	});

	if (existing) {
		return generateAffiliateCode(userId);
	}

	return affiliateCode;
}

export async function getAffiliateQualificationStatus(
	userId: string
): Promise<AffiliateQualificationStatus> {
	const [user, config, lifetimeCompletedSpend] = await Promise.all([
		prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				isActive: true
			}
		}),
		getAffiliateConfig(),
		countLifetimeCompletedSpend(userId)
	]);

	if (!user) {
		return {
			eligible: false,
			lifetimeCompletedSpend,
			threshold: config.unlockThreshold,
			reason: 'user_not_found'
		};
	}

	if (!user.isActive) {
		return {
			eligible: false,
			lifetimeCompletedSpend,
			threshold: config.unlockThreshold,
			reason: 'inactive_user'
		};
	}

	if (lifetimeCompletedSpend < config.unlockThreshold) {
		return {
			eligible: false,
			lifetimeCompletedSpend,
			threshold: config.unlockThreshold,
			reason: 'below_threshold'
		};
	}

	return {
		eligible: true,
		lifetimeCompletedSpend,
		threshold: config.unlockThreshold,
		reason: 'eligible'
	};
}

/**
 * Enable affiliate mode for a user.
 */
export async function enableAffiliateMode(
	userId: string,
	options?: {
		force?: boolean;
	}
): Promise<{ success: boolean; affiliateCode?: string; error?: string }> {
	const forceEnable = Boolean(options?.force);
	try {
		const [user, qualification] = await Promise.all([
			prisma.user.findUnique({
				where: { id: userId },
				include: {
					affiliatePrograms: true
				}
			}),
			getAffiliateQualificationStatus(userId)
		]);

		if (!user) {
			return { success: false, error: 'User not found' };
		}

		if (user.isAffiliateEnabled && user.affiliatePrograms.length > 0) {
			return { success: true, affiliateCode: user.affiliatePrograms[0].affiliateCode };
		}

		const existingProgram = user.affiliatePrograms[0] || null;
		if (
			!forceEnable &&
			existingProgram &&
			existingProgram.status === 'inactive' &&
			!user.isAffiliateEnabled
		) {
			return {
				success: false,
				error: 'Affiliate access is currently disabled. Contact support for review.'
			};
		}

		if (!qualification.eligible && !forceEnable) {
			const remaining = Math.max(0, qualification.threshold - qualification.lifetimeCompletedSpend);
			return {
				success: false,
				error: `Affiliate unlock requires ₦${qualification.threshold.toLocaleString()} total spend. Remaining: ₦${remaining.toLocaleString()}.`
			};
		}

		const affiliateCode = existingProgram?.affiliateCode || (await generateAffiliateCode(userId));

		await prisma.$transaction(async (tx) => {
			if (!existingProgram) {
				await tx.affiliateProgram.create({
					data: {
						userId,
						affiliateCode,
						status: 'active'
					}
				});
			} else if (existingProgram.status !== 'active') {
				await tx.affiliateProgram.update({
					where: { id: existingProgram.id },
					data: { status: 'active' }
				});
			}

			await tx.user.update({
				where: { id: userId },
				data: {
					isAffiliateEnabled: true,
					userType: user.userType === 'ADMIN' ? user.userType : 'AFFILIATE'
				}
			});
		});

		return { success: true, affiliateCode };
	} catch (error) {
		console.error('Error enabling affiliate mode:', error);
		return { success: false, error: 'Failed to enable affiliate mode' };
	}
}

/**
 * Validate an affiliate code and return affiliate user info.
 */
export async function validateAffiliateCode(code: string): Promise<{
	valid: boolean;
	userId?: string;
	affiliateProgramId?: string;
	affiliateCode?: string;
	error?: string;
}> {
	const normalizedCode = normalizeAffiliateCode(code);
	if (!normalizedCode) {
		return { valid: false, error: 'Affiliate code is required.' };
	}

	try {
		const affiliateProgram = await prisma.affiliateProgram.findFirst({
			where: {
				affiliateCode: normalizedCode,
				status: 'active'
			},
			select: {
				id: true,
				userId: true,
				affiliateCode: true,
				user: {
					select: {
						isActive: true,
						isAffiliateEnabled: true
					}
				}
			}
		});

		if (
			!affiliateProgram ||
			!affiliateProgram.user.isActive ||
			!affiliateProgram.user.isAffiliateEnabled
		) {
			return { valid: false, error: 'Affiliate code is invalid.' };
		}

		return {
			valid: true,
			userId: affiliateProgram.userId,
			affiliateProgramId: affiliateProgram.id,
			affiliateCode: affiliateProgram.affiliateCode
		};
	} catch (error) {
		console.error('Error validating affiliate code:', error);
		return { valid: false, error: 'Failed to validate affiliate code.' };
	}
}

export function readAffiliateReferralCookie(cookies: Cookies): string | null {
	return normalizeAffiliateCode(cookies.get(AFFILIATE_REFERRAL_COOKIE));
}

export function setAffiliateReferralCookie(
	cookies: Cookies,
	code: string,
	isSecure: boolean
): void {
	const normalizedCode = normalizeAffiliateCode(code);
	if (!normalizedCode) return;

	cookies.set(AFFILIATE_REFERRAL_COOKIE, normalizedCode, {
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: 60 * 60 * 24 * 45,
		path: '/'
	});
}

export function clearAffiliateReferralCookie(cookies: Cookies, isSecure: boolean): void {
	cookies.set(AFFILIATE_REFERRAL_COOKIE, '', {
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: 0,
		path: '/'
	});
}

export async function getLockedReferralForUser(
	userId: string
): Promise<LockedReferralAttribution | null> {
	const key = getReferralLockKey(userId);
	const row = await prisma.microcopy.findUnique({
		where: { key },
		select: { value: true }
	});

	const locked = parseLockedReferral(row?.value || null);
	if (!locked) return null;

	const affiliateProgram = await prisma.affiliateProgram.findFirst({
		where: {
			id: locked.affiliateProgramId,
			userId: locked.referrerUserId,
			affiliateCode: locked.affiliateCode,
			status: 'active'
		},
		select: {
			id: true
		}
	});

	if (!affiliateProgram) {
		return null;
	}

	return locked;
}

export async function lockReferralAttributionForUser(params: {
	referredUserId: string;
	affiliateCode: string;
	source: 'signup' | 'google_signup' | 'checkout_manual' | 'checkout_link';
}): Promise<{
	locked: boolean;
	alreadyLocked: boolean;
	reason?: string;
	attribution?: LockedReferralAttribution;
}> {
	const normalizedCode = normalizeAffiliateCode(params.affiliateCode);
	if (!normalizedCode) {
		return { locked: false, alreadyLocked: false, reason: 'missing_code' };
	}

	const existing = await getLockedReferralForUser(params.referredUserId);
	if (existing) {
		return {
			locked: true,
			alreadyLocked: true,
			reason: 'already_locked',
			attribution: existing
		};
	}

	const [affiliateValidation, referredUser] = await Promise.all([
		validateAffiliateCode(normalizedCode),
		prisma.user.findUnique({
			where: { id: params.referredUserId },
			select: {
				id: true,
				isActive: true
			}
		})
	]);

	if (!referredUser?.isActive) {
		return { locked: false, alreadyLocked: false, reason: 'invalid_referred_user' };
	}

	if (
		!affiliateValidation.valid ||
		!affiliateValidation.userId ||
		!affiliateValidation.affiliateProgramId
	) {
		return { locked: false, alreadyLocked: false, reason: 'invalid_affiliate_code' };
	}

	if (affiliateValidation.userId === params.referredUserId) {
		return { locked: false, alreadyLocked: false, reason: 'self_referral_blocked' };
	}

	if (params.source !== 'signup' && params.source !== 'google_signup') {
		const priorPaidOrders = await prisma.order.count({
			where: {
				userId: params.referredUserId,
				OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }]
			}
		});
		if (priorPaidOrders > 0) {
			return { locked: false, alreadyLocked: false, reason: 'buyer_has_prior_paid_orders' };
		}
	}

	const nowIso = new Date().toISOString();
	const attribution: LockedReferralAttribution = {
		affiliateProgramId: affiliateValidation.affiliateProgramId,
		affiliateCode: normalizedCode,
		referrerUserId: affiliateValidation.userId,
		referredUserId: params.referredUserId,
		source: params.source,
		lockedAt: nowIso
	};

	try {
		await prisma.microcopy.create({
			data: {
				key: getReferralLockKey(params.referredUserId),
				value: JSON.stringify(attribution),
				description: 'Locked referral attribution for affiliate lifecycle',
				category: REFERRAL_LOCK_CATEGORY,
				isActive: true
			}
		});
	} catch (error) {
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			(error as { code?: string }).code === 'P2002'
		) {
			const existingAfterRace = await getLockedReferralForUser(params.referredUserId);
			if (existingAfterRace) {
				return {
					locked: true,
					alreadyLocked: true,
					reason: 'already_locked',
					attribution: existingAfterRace
				};
			}
		}

		console.error('Failed to create referral lock:', error);
		return { locked: false, alreadyLocked: false, reason: 'failed_to_lock' };
	}

	// Best-effort notification for referrer.
	await prisma.notification
		.create({
			data: {
				userId: attribution.referrerUserId,
				type: 'affiliate_referral_signup',
				title: 'New referral joined',
				message:
					'A new user signed up through your affiliate code. Keep sharing to grow your Store Credit.'
			}
		})
		.catch((error) => {
			console.error('Failed to create affiliate referral signup notification:', error);
		});

	return {
		locked: true,
		alreadyLocked: false,
		attribution
	};
}

export async function maybeLockReferralFromCookie(params: {
	cookies: Cookies;
	isSecureRequest: boolean;
	referredUserId: string;
	source: 'signup' | 'google_signup';
}): Promise<{ locked: boolean; reason?: string }> {
	const cookieCode = readAffiliateReferralCookie(params.cookies);
	if (!cookieCode) {
		return { locked: false, reason: 'no_cookie' };
	}

	const lockResult = await lockReferralAttributionForUser({
		referredUserId: params.referredUserId,
		affiliateCode: cookieCode,
		source: params.source
	});

	if (lockResult.locked) {
		clearAffiliateReferralCookie(params.cookies, params.isSecureRequest);
		return { locked: true };
	}

	if (
		lockResult.reason === 'invalid_affiliate_code' ||
		lockResult.reason === 'self_referral_blocked'
	) {
		clearAffiliateReferralCookie(params.cookies, params.isSecureRequest);
	}

	return { locked: false, reason: lockResult.reason };
}

export async function resolveOrderAffiliateAttribution(params: {
	buyerUserId: string;
	explicitAffiliateCode?: string | null;
}): Promise<{
	affiliateCode: string | null;
	affiliateUserId: string | null;
	affiliateProgramId: string | null;
	source: 'locked' | 'manual' | 'none';
	error?: string;
}> {
	const locked = await getLockedReferralForUser(params.buyerUserId);
	if (locked) {
		if (locked.referrerUserId === params.buyerUserId) {
			return {
				affiliateCode: null,
				affiliateUserId: null,
				affiliateProgramId: null,
				source: 'none',
				error: 'Self-referral is not allowed.'
			};
		}

		return {
			affiliateCode: locked.affiliateCode,
			affiliateUserId: locked.referrerUserId,
			affiliateProgramId: locked.affiliateProgramId,
			source: 'locked'
		};
	}

	const manualCode = normalizeAffiliateCode(params.explicitAffiliateCode || null);
	if (!manualCode) {
		return {
			affiliateCode: null,
			affiliateUserId: null,
			affiliateProgramId: null,
			source: 'none'
		};
	}

	const validation = await validateAffiliateCode(manualCode);
	if (!validation.valid || !validation.userId || !validation.affiliateProgramId) {
		return {
			affiliateCode: null,
			affiliateUserId: null,
			affiliateProgramId: null,
			source: 'none',
			error: 'Affiliate code is invalid.'
		};
	}

	if (validation.userId === params.buyerUserId) {
		return {
			affiliateCode: null,
			affiliateUserId: null,
			affiliateProgramId: null,
			source: 'none',
			error: 'Self-referral is not allowed.'
		};
	}

	const lockResult = await lockReferralAttributionForUser({
		referredUserId: params.buyerUserId,
		affiliateCode: manualCode,
		source: 'checkout_manual'
	});

	if (lockResult.locked && lockResult.attribution) {
		return {
			affiliateCode: lockResult.attribution.affiliateCode,
			affiliateUserId: lockResult.attribution.referrerUserId,
			affiliateProgramId: lockResult.attribution.affiliateProgramId,
			source: 'manual'
		};
	}

	if (lockResult.reason === 'buyer_has_prior_paid_orders') {
		// User cannot be locked anymore; allow one-time manual use if valid.
		return {
			affiliateCode: validation.affiliateCode || manualCode,
			affiliateUserId: validation.userId,
			affiliateProgramId: validation.affiliateProgramId,
			source: 'manual'
		};
	}

	return {
		affiliateCode: null,
		affiliateUserId: null,
		affiliateProgramId: null,
		source: 'none',
		error: 'Unable to lock affiliate attribution for this order.'
	};
}

export async function getAffiliateDiscountForOrder(params: {
	buyerUserId: string;
	affiliateUserId: string;
	subtotalAmount: number;
	orderItems?: Array<{
		quantity: number;
		totalPrice: unknown;
		productName: string;
		category?: { metadata: unknown } | null;
		categoryMetadata?: unknown;
	}>;
}): Promise<AffiliateDiscountResult> {
	const [config, successfulOrdersBefore] = await Promise.all([
		getAffiliateConfig(),
		countSuccessfulOrdersForAffiliatePair(params.buyerUserId, params.affiliateUserId)
	]);

	const orderIndex = successfulOrdersBefore + 1;
	if (orderIndex > config.maxRewardedOrdersPerBuyer) {
		return {
			discountAmount: 0,
			orderIndex,
			stage: 'none',
			stageLabel: 'Expired',
			remainingRewardedOrders: 0,
			expiresAfterOrder: 0,
			maxRewardedOrders: config.maxRewardedOrdersPerBuyer,
			ruleMode: 'none'
		};
	}

	let percent = 0;
	let cap = 0;
	let stage: AffiliateDiscountResult['stage'] = 'none';
	let stageLabel: AffiliateDiscountResult['stageLabel'] = 'Expired';

	if (orderIndex <= 2) {
		percent = config.discountStage1Percent;
		cap = config.discountStage1Cap;
		stage = 'stage_1';
		stageLabel = 'Stage 1';
	} else {
		percent = config.discountStage2Percent;
		cap = config.discountStage2Cap;
		stage = 'stage_2';
		stageLabel = 'Stage 2';
	}

	const itemRows = Array.isArray(params.orderItems) ? params.orderItems : [];
	let explicitTierFlatDiscount = 0;

	for (const item of itemRows) {
		const metadata = parseMetadataObject(item.categoryMetadata ?? item.category?.metadata);
		if (isAffiliateLineExcluded(item.productName, metadata, config)) {
			continue;
		}

		const quantity = Math.max(1, Number(item.quantity || 1));
		const stageFlat =
			stage === 'stage_1'
				? toPositiveNumber(metadata.affiliate_discount_stage1_flat)
				: stage === 'stage_2'
					? toPositiveNumber(metadata.affiliate_discount_stage2_flat)
					: null;
		const stagePerAccount =
			stage === 'stage_1'
				? toPositiveNumber(metadata.affiliate_discount_stage1_per_account)
				: stage === 'stage_2'
					? toPositiveNumber(metadata.affiliate_discount_stage2_per_account)
					: null;

		const anyStageFlat = stageFlat ?? toPositiveNumber(metadata.affiliate_discount_flat);
		const anyStagePerAccount =
			stagePerAccount ?? toPositiveNumber(metadata.affiliate_discount_per_account);

		if (anyStageFlat) {
			explicitTierFlatDiscount += toRoundedNaira(anyStageFlat);
			continue;
		}

		if (anyStagePerAccount) {
			explicitTierFlatDiscount += toRoundedNaira(anyStagePerAccount * quantity);
		}
	}

	const hasTierFlatRule = explicitTierFlatDiscount > 0;
	const rawDiscount = (Math.max(0, params.subtotalAmount) * percent) / 100;
	const discountAmount = hasTierFlatRule
		? toRoundedNaira(explicitTierFlatDiscount)
		: toRoundedNaira(Math.min(cap, rawDiscount));
	const remainingRewardedOrders = Math.max(0, config.maxRewardedOrdersPerBuyer - orderIndex);
	const expiresAfterOrder = remainingRewardedOrders + 1;

	return {
		discountAmount,
		orderIndex,
		stage,
		stageLabel,
		remainingRewardedOrders,
		expiresAfterOrder,
		maxRewardedOrders: config.maxRewardedOrdersPerBuyer,
		ruleMode: hasTierFlatRule ? 'tier_flat' : 'percent_cap'
	};
}

function buildOrderItemCredit(
	item: {
		quantity: number;
		totalPrice: unknown;
		productName: string;
		category: { metadata: unknown };
	},
	config: AffiliateConfig
): number {
	const metadata = parseMetadataObject(item.category?.metadata);
	if (isAffiliateLineExcluded(item.productName, metadata, config)) return 0;

	const perOrderFlat = toPositiveNumber(metadata.affiliate_store_credit_flat);
	const perAccountCredit = toPositiveNumber(metadata.affiliate_store_credit_per_account);
	const customPercent = toPositiveNumber(metadata.affiliate_store_credit_percent);
	const totalPrice = Math.max(0, Number(item.totalPrice || 0));

	let lineCredit = 0;
	if (perOrderFlat) {
		lineCredit = perOrderFlat;
	} else if (perAccountCredit) {
		lineCredit = perAccountCredit * Math.max(1, Number(item.quantity || 1));
	} else {
		const percent = customPercent ?? config.storeCreditFallbackPercent;
		lineCredit = (totalPrice * percent) / 100;
	}

	return toRoundedNaira(lineCredit);
}

export async function recordAffiliateStoreCreditForOrder(orderId: string): Promise<{
	success: boolean;
	storeCreditAwarded?: number;
	error?: string;
}> {
	try {
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				orderNumber: true,
				userId: true,
				affiliateCode: true,
				affiliateUserId: true,
				totalAmount: true,
				status: true,
				paymentStatus: true,
				orderItems: {
					select: {
						quantity: true,
						totalPrice: true,
						productName: true,
						category: {
							select: {
								metadata: true
							}
						}
					}
				}
			}
		});

		if (!order) {
			return { success: false, error: 'Order not found' };
		}

		if (!order.userId || !order.affiliateUserId || !order.affiliateCode) {
			return { success: true, storeCreditAwarded: 0 };
		}

		if (order.userId === order.affiliateUserId) {
			return { success: true, storeCreditAwarded: 0 };
		}

		if (
			!(order.status === 'paid' || order.status === 'completed' || order.paymentStatus === 'paid')
		) {
			return { success: true, storeCreditAwarded: 0 };
		}

		const reference = `affiliate:credit:order:${order.id}`;
		const existingCredit = await prisma.walletTransaction.findUnique({
			where: { reference },
			select: { id: true }
		});
		if (existingCredit) {
			return { success: true, storeCreditAwarded: 0 };
		}

		const [config, successfulOrderCountForPair] = await Promise.all([
			getAffiliateConfig(),
			countSuccessfulOrdersForAffiliatePair(order.userId, order.affiliateUserId)
		]);

		// successfulOrderCountForPair already includes this order: the guard above
		// confirms order.status/paymentStatus is paid/completed, and
		// countSuccessfulOrdersForAffiliatePair does a fresh COUNT with no
		// exclusion — so this is already the order's 1-indexed position, the
		// post-payment equivalent of `orderIndex` in getAffiliateDiscountForOrder
		// (which excludes the current order, then adds 1, pre-payment). Both
		// `> maxRewardedOrdersPerBuyer` checks are therefore equivalent and
		// correct; do not change this to `>=`.
		if (successfulOrderCountForPair > config.maxRewardedOrdersPerBuyer) {
			return { success: true, storeCreditAwarded: 0 };
		}

		let rawCreditTotal = 0;
		for (const item of order.orderItems) {
			rawCreditTotal += buildOrderItemCredit(item, config);
		}

		const normalizedCredit = toRoundedNaira(rawCreditTotal);
		if (normalizedCredit <= 0) {
			return { success: true, storeCreditAwarded: 0 };
		}

		const boundedCredit = Math.max(
			config.storeCreditMin,
			Math.min(config.storeCreditMax, normalizedCredit)
		);
		const creditAmount = toRoundedNaira(boundedCredit);

		await prisma.$transaction(async (tx) => {
			const wallet = await tx.wallet.upsert({
				where: { userId: order.affiliateUserId as string },
				update: {},
				create: {
					userId: order.affiliateUserId as string,
					balance: 0,
					currency: 'NGN'
				}
			});

			const balanceBefore = Number(wallet.balance || 0);
			const balanceAfter = balanceBefore + creditAmount;

			await tx.wallet.update({
				where: { id: wallet.id },
				data: {
					balance: balanceAfter
				}
			});

			await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId: order.affiliateUserId as string,
					type: 'affiliate_credit',
					amount: creditAmount,
					balanceBefore,
					balanceAfter,
					description: `Store Credit from referred order ${order.orderNumber}`,
					reference,
					status: AFFILIATE_LEDGER_STATUS.available,
					metadata: {
						orderId: order.id,
						buyerUserId: order.userId,
						affiliateCode: order.affiliateCode,
						awardedFrom: 'referral_order',
						lifecycleStatus: AFFILIATE_LEDGER_STATUS.available
					}
				}
			});

			await tx.affiliateProgram.updateMany({
				where: {
					userId: order.affiliateUserId as string,
					affiliateCode: order.affiliateCode as string,
					status: 'active'
				},
				data: {
					totalReferrals: { increment: 1 },
					totalSales: { increment: Number(order.totalAmount || 0) }
				}
			});

			await tx.notification.create({
				data: {
					userId: order.affiliateUserId as string,
					type: 'affiliate_store_credit',
					title: 'Store Credit approved',
					message: `₦${creditAmount.toLocaleString()} was added from referred order ${order.orderNumber}.`
				}
			});
		});

		void sendFirstStoreCreditEmailIfNeeded({
			userId: order.affiliateUserId,
			creditAmount
		}).catch((error) => {
			console.error('Failed to send first Store Credit email:', error);
		});

		return {
			success: true,
			storeCreditAwarded: creditAmount
		};
	} catch (error) {
		console.error('Failed to record affiliate store credit:', error);
		return {
			success: false,
			error: 'Failed to record affiliate store credit.'
		};
	}
}

export async function maybeSendAffiliateUnlockInvite(userId: string): Promise<void> {
	try {
		const [qualification, existingProgram, user] = await Promise.all([
			getAffiliateQualificationStatus(userId),
			prisma.affiliateProgram.findFirst({
				where: { userId },
				select: { id: true }
			}),
			prisma.user.findUnique({
				where: { id: userId },
				select: {
					id: true,
					email: true,
					fullName: true,
					isAffiliateEnabled: true,
					isActive: true
				}
			})
		]);

		if (!user || !user.isActive || !user.email) return;
		if (!qualification.eligible) return;
		if (existingProgram || user.isAffiliateEnabled) return;

		const markerKey = getUnlockSentKey(userId);
		const marker = await prisma.microcopy.findUnique({
			where: { key: markerKey },
			select: { id: true }
		});
		if (marker) return;

		if (!(await sendAffiliateUnlockEmailIfNeeded(user.id))) {
			return;
		}

		await Promise.allSettled([
			prisma.microcopy.create({
				data: {
					key: markerKey,
					value: new Date().toISOString(),
					description: 'Affiliate unlock invite sent marker',
					category: 'affiliate_unlock',
					isActive: true
				}
			}),
			prisma.notification.create({
				data: {
					userId: user.id,
					type: 'affiliate_unlock',
					title: "You've unlocked Affiliate Access",
					message: 'Share your code, bring buyers, and earn Store Credit from successful referrals.'
				}
			})
		]);
	} catch (error) {
		console.error('Failed to send affiliate unlock invite:', error);
	}
}

export async function getAffiliateDashboardState(userId: string): Promise<AffiliateDashboardState> {
	const [qualification, config, program, user, ledger] = await Promise.all([
		getAffiliateQualificationStatus(userId),
		getAffiliateConfig(),
		prisma.affiliateProgram.findFirst({
			where: { userId },
			select: {
				id: true,
				affiliateCode: true,
				status: true
			}
		}),
		prisma.user.findUnique({
			where: { id: userId },
			select: {
				createdAt: true,
				isAffiliateEnabled: true,
				affiliateWelcomePopupSeenAt: true,
				affiliateProgress50PopupSeenAt: true,
				affiliateProgress80PopupSeenAt: true,
				affiliateProgress95PopupSeenAt: true,
				affiliateUnlockedPopupSeenAt: true
			}
		}),
		getAffiliateLedgerSummary(userId)
	]);

	const isActive = Boolean(program && user?.isAffiliateEnabled && program.status === 'active');
	const hardDisabled = Boolean(
		program && !user?.isAffiliateEnabled && program.status === 'inactive'
	);
	const unlocked = hardDisabled ? false : qualification.eligible || isActive;
	const canActivate = !hardDisabled && qualification.eligible && !isActive;

	const startOfMonth = new Date();
	startOfMonth.setDate(1);
	startOfMonth.setHours(0, 0, 0, 0);

	const [successfulReferredOrders, referredOrderUsersRaw, lockedReferralRows, codeUsesThisMonth] =
		await Promise.all([
			prisma.order.count({
				where: {
					affiliateUserId: userId,
					userId: { not: null },
					OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }]
				}
			}),
			prisma.order.findMany({
				where: {
					affiliateUserId: userId,
					userId: { not: null },
					OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }]
				},
				select: {
					userId: true
				}
			}),
			prisma.microcopy.findMany({
				where: {
					category: REFERRAL_LOCK_CATEGORY,
					key: {
						startsWith: REFERRAL_LOCK_KEY_PREFIX
					}
				},
				select: {
					value: true
				}
			}),
			prisma.order.count({
				where: {
					affiliateUserId: userId,
					affiliateCode: { not: null },
					createdAt: {
						gte: startOfMonth
					}
				}
			})
		]);

	const referredUserIds = new Set(
		referredOrderUsersRaw
			.map((row) => row.userId)
			.filter((value): value is string => typeof value === 'string' && Boolean(value))
	);
	const referralLockedAtByUser = new Map<string, string>();

	for (const row of lockedReferralRows) {
		const parsed = parseLockedReferral(row.value);
		if (parsed && parsed.referrerUserId === userId && parsed.referredUserId) {
			referredUserIds.add(parsed.referredUserId);
			if (!referralLockedAtByUser.has(parsed.referredUserId)) {
				referralLockedAtByUser.set(parsed.referredUserId, parsed.lockedAt);
			}
		}
	}

	const totalReferredUsers = referredUserIds.size;
	const referredUserIdList = [...referredUserIds];
	const paidUserIdSet = new Set<string>();

	const [referredUsersRaw, referredOrdersRaw, referredCreditRows, recentLedgerRows] =
		await Promise.all([
			referredUserIdList.length
				? prisma.user.findMany({
						where: { id: { in: referredUserIdList } },
						select: {
							id: true,
							fullName: true,
							createdAt: true
						}
					})
				: Promise.resolve([]),
			referredUserIdList.length
				? prisma.order.findMany({
						where: {
							affiliateUserId: userId,
							userId: {
								in: referredUserIdList
							},
							OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }]
						},
						select: {
							userId: true,
							createdAt: true
						}
					})
				: Promise.resolve([]),
			referredUserIdList.length
				? prisma.walletTransaction.findMany({
						where: {
							userId,
							type: AFFILIATE_LEDGER_CREDIT_TYPE
						},
						select: {
							amount: true,
							createdAt: true,
							metadata: true
						}
					})
				: Promise.resolve([]),
			prisma.walletTransaction.findMany({
				where: {
					userId,
					type: {
						in: [AFFILIATE_LEDGER_CREDIT_TYPE, AFFILIATE_LEDGER_PAYOUT_TYPE]
					}
				},
				select: {
					id: true,
					type: true,
					status: true,
					amount: true,
					createdAt: true
				},
				orderBy: {
					createdAt: 'desc'
				},
				take: 6
			})
		]);

	const usersById = new Map(
		referredUsersRaw.map((row) => [
			row.id,
			{
				fullName: row.fullName,
				createdAt: row.createdAt
			}
		])
	);

	const referralOrdersByUser = new Map<string, { ordersCount: number; lastOrderAt: Date | null }>();
	for (const order of referredOrdersRaw) {
		if (!order.userId) continue;
		const current = referralOrdersByUser.get(order.userId) || { ordersCount: 0, lastOrderAt: null };
		current.ordersCount += 1;
		if (!current.lastOrderAt || order.createdAt > current.lastOrderAt) {
			current.lastOrderAt = order.createdAt;
		}
		referralOrdersByUser.set(order.userId, current);
		paidUserIdSet.add(order.userId);
	}

	const creditByUser = new Map<string, { total: number; lastCreditAt: Date | null }>();
	for (const tx of referredCreditRows) {
		const metadata =
			tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
				? (tx.metadata as Record<string, unknown>)
				: null;
		const buyerUserId =
			metadata && typeof metadata.buyerUserId === 'string' ? metadata.buyerUserId.trim() : '';
		if (!buyerUserId || !referredUserIds.has(buyerUserId)) continue;

		const current = creditByUser.get(buyerUserId) || { total: 0, lastCreditAt: null };
		current.total += Math.max(0, Number(tx.amount || 0));
		if (!current.lastCreditAt || tx.createdAt > current.lastCreditAt) {
			current.lastCreditAt = tx.createdAt;
		}
		creditByUser.set(buyerUserId, current);
	}

	const recentReferralActivity: AffiliateRecentReferralActivity[] = referredUserIdList
		.map((referredUserId) => {
			const userInfo = usersById.get(referredUserId);
			const orderInfo = referralOrdersByUser.get(referredUserId) || {
				ordersCount: 0,
				lastOrderAt: null
			};
			const creditInfo = creditByUser.get(referredUserId) || {
				total: 0,
				lastCreditAt: null
			};
			const ordersCount = Math.max(0, orderInfo.ordersCount);
			const referralStatus: AffiliateRecentReferralActivity['status'] =
				ordersCount > 1 ? 'repeat_buyer' : ordersCount === 1 ? 'paid_customer' : 'signed_up';

			return {
				userId: referredUserId,
				displayName: formatAffiliateDisplayName(userInfo?.fullName),
				status: referralStatus,
				ordersCount,
				storeCreditEarned: Math.max(0, toRoundedNaira(creditInfo.total)),
				lastActivityAt: firstIsoTimestamp([
					creditInfo.lastCreditAt,
					orderInfo.lastOrderAt,
					referralLockedAtByUser.get(referredUserId),
					userInfo?.createdAt
				])
			};
		})
		.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
		.slice(0, 3);

	const recentStoreCreditActivity: AffiliateRecentStoreCreditActivity[] = recentLedgerRows.map(
		(row) => {
			const amount = Math.max(0, Number(row.amount || 0));
			const isCredit = row.type === AFFILIATE_LEDGER_CREDIT_TYPE;
			return {
				id: row.id,
				title: mapStoreCreditTitle(row.type, row.status),
				statusLabel: mapLedgerStatusLabel(row.status),
				amount: isCredit ? amount : amount * -1,
				isCredit,
				createdAt: row.createdAt.toISOString()
			};
		}
	);

	const paidReferredUsers = paidUserIdSet.size;

	const accountAgeDays = user
		? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
		: 0;
	const availableStoreCredit = ledger.availableStoreCredit;
	const payoutEligible =
		availableStoreCredit >= config.payoutMinimum &&
		accountAgeDays >= config.payoutMinAccountAgeDays;

	const spendProgressPercentForPopup =
		qualification.threshold > 0
			? Math.min(
					100,
					Math.floor((qualification.lifetimeCompletedSpend / qualification.threshold) * 100)
				)
			: 100;
	const pendingPopup = getPendingAffiliatePopup({
		unlocked,
		spendProgressPercent: spendProgressPercentForPopup,
		popupsEnabled: config.dashboardPopupsEnabled,
		seenAt: {
			welcome: user?.affiliateWelcomePopupSeenAt ?? null,
			progress50: user?.affiliateProgress50PopupSeenAt ?? null,
			progress80: user?.affiliateProgress80PopupSeenAt ?? null,
			progress95: user?.affiliateProgress95PopupSeenAt ?? null,
			unlocked: user?.affiliateUnlockedPopupSeenAt ?? null
		}
	});

	return {
		eligible: hardDisabled ? false : qualification.eligible,
		unlocked,
		canActivate,
		isActive,
		lifetimeCompletedSpend: qualification.lifetimeCompletedSpend,
		unlockThreshold: qualification.threshold,
		payoutEligible,
		payoutMinimum: config.payoutMinimum,
		payoutMinAccountAgeDays: config.payoutMinAccountAgeDays,
		availableStoreCredit,
		pendingStoreCredit: ledger.pendingStoreCredit,
		underReviewStoreCredit: ledger.underReviewStoreCredit,
		requestedStoreCredit: ledger.requestedStoreCredit,
		paidStoreCredit: ledger.paidStoreCredit,
		reversedStoreCredit: ledger.reversedStoreCredit,
		totalStoreCreditEarned: ledger.totalStoreCreditEarned,
		totalReferredUsers,
		successfulReferredOrders,
		codeUsesThisMonth,
		paidReferredUsers,
		affiliateCode: program?.affiliateCode || null,
		referralLink: program?.affiliateCode
			? `${getAffiliateReferralBaseUrl()}/ref/${program.affiliateCode}`
			: null,
		programStatus: program?.status || null,
		recentReferralActivity,
		recentStoreCreditActivity,
		pendingPopup
	};
}

export async function markAffiliatePopupSeen(
	userId: string,
	popup: AffiliatePopupType
): Promise<void> {
	const field = AFFILIATE_POPUP_SEEN_FIELDS[popup];
	await prisma.user.update({
		where: { id: userId },
		data: { [field]: new Date() }
	});
}

export async function requestAffiliatePayout(userId: string): Promise<{
	success: boolean;
	amount?: number;
	error?: string;
}> {
	try {
		const [dashboard, user] = await Promise.all([
			getAffiliateDashboardState(userId),
			prisma.user.findUnique({
				where: { id: userId },
				select: {
					id: true,
					fullName: true,
					email: true,
					isActive: true
				}
			})
		]);

		if (!user || !user.isActive) {
			return { success: false, error: 'Account not eligible for payout request.' };
		}

		if (!dashboard.isActive) {
			return { success: false, error: 'Activate affiliate access before requesting payout.' };
		}

		if (!dashboard.payoutEligible) {
			return { success: false, error: 'Payout requirements are not met yet.' };
		}

		const amount = toRoundedNaira(dashboard.availableStoreCredit);
		if (amount <= 0) {
			return { success: false, error: 'No available Store Credit to request.' };
		}

		const existingOpenRequest = await prisma.walletTransaction.findFirst({
			where: {
				userId,
				type: AFFILIATE_LEDGER_PAYOUT_TYPE,
				status: AFFILIATE_LEDGER_STATUS.requested
			},
			select: {
				id: true
			}
		});

		if (existingOpenRequest) {
			return {
				success: false,
				error: 'A payout request is already pending review. Please wait for processing.'
			};
		}

		const wallet = await prisma.wallet.upsert({
			where: { userId },
			update: {},
			create: {
				userId,
				balance: 0,
				currency: 'NGN'
			},
			select: {
				id: true,
				balance: true
			}
		});

		const reference = `affiliate:payout:request:${userId}:${Date.now()}`;
		const balance = Number(wallet.balance || 0);

		const payoutTransactionId = await prisma.$transaction(async (tx) => {
			const payoutTransaction = await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId,
					type: AFFILIATE_LEDGER_PAYOUT_TYPE,
					amount,
					balanceBefore: balance,
					balanceAfter: balance,
					description: 'Affiliate payout request submitted',
					reference,
					status: AFFILIATE_LEDGER_STATUS.requested,
					metadata: {
						lifecycleStatus: AFFILIATE_LEDGER_STATUS.requested,
						requestedAt: new Date().toISOString(),
						source: 'affiliate_dashboard'
					}
				}
			});

			await tx.notification.create({
				data: {
					userId,
					type: 'affiliate_payout',
					title: 'Payout request received',
					message:
						'Your payout request was received and will be reviewed for the next payout cycle.'
				}
			});
			return payoutTransaction.id;
		});

		const recipients = await getOperationalAlertRecipients().catch(() => []);
		const payoutRecipients = recipients.filter(Boolean);
		const baseUrl = getBaseUrl();
		const affiliateName = sanitizeEmailName(user.fullName || user.email || 'affiliate');

		await Promise.allSettled(
			payoutRecipients.map((recipientEmail) =>
				sendEmail({
					to: recipientEmail,
					subject: `[FastAccs Ops] Affiliate payout request (${affiliateName})`,
					body: `A new affiliate payout request was submitted.\n\nAffiliate: ${user.fullName || 'N/A'}\nEmail: ${user.email || 'N/A'}\nRequested amount: ₦${amount.toLocaleString()}\nCurrent available Store Credit: ₦${dashboard.availableStoreCredit.toLocaleString()}\nRequested at: ${new Date().toISOString()}\n\nReview affiliate details in admin to approve or follow up.`,
					ctaText: 'Open admin affiliates',
					ctaUrl: `${baseUrl}/admin/affiliates/${user.id}`,
					notificationType: 'affiliate_payout',
					referenceId: `affiliate_payout_request:${reference}`,
					userId: null
				})
			)
		);
		await sendAffiliatePayoutStatusEmailIfNeeded({
			payoutTransactionId,
			expectedStatus: AFFILIATE_LEDGER_STATUS.requested
		}).catch((error) => {
			console.error('Failed to send affiliate payout request email:', error);
		});

		return {
			success: true,
			amount
		};
	} catch (error) {
		console.error('Failed to request affiliate payout:', error);
		return { success: false, error: 'Failed to submit payout request.' };
	}
}

export async function getAffiliateDiscountPreviewForCode(params: {
	buyerUserId: string;
	affiliateCode: string;
	subtotalAmount: number;
	orderItems?: Array<{
		quantity: number;
		totalPrice: unknown;
		productName: string;
		category?: { metadata: unknown } | null;
		categoryMetadata?: unknown;
	}>;
}): Promise<{
	valid: boolean;
	error?: string;
	discountAmount: number;
	orderIndex?: number;
	stage?: AffiliateDiscountResult['stage'];
	stageLabel?: AffiliateDiscountResult['stageLabel'];
	ruleMode?: AffiliateDiscountResult['ruleMode'];
	remainingRewardedOrders?: number;
	expiresAfterOrder?: number;
	maxRewardedOrders?: number;
	lockedCode?: string | null;
}> {
	const requestedCode = normalizeAffiliateCode(params.affiliateCode);
	if (!requestedCode) {
		return {
			valid: false,
			error: 'Affiliate code is required.',
			discountAmount: 0
		};
	}

	const locked = await getLockedReferralForUser(params.buyerUserId);
	if (locked && locked.affiliateCode !== requestedCode) {
		return {
			valid: false,
			error: `This account is already linked to affiliate code ${locked.affiliateCode}.`,
			discountAmount: 0,
			lockedCode: locked.affiliateCode
		};
	}

	const validation = await validateAffiliateCode(requestedCode);
	if (!validation.valid || !validation.userId) {
		return {
			valid: false,
			error: validation.error || 'Affiliate code is invalid.',
			discountAmount: 0,
			lockedCode: locked?.affiliateCode || null
		};
	}

	if (validation.userId === params.buyerUserId) {
		return {
			valid: false,
			error: 'Self-referral is not allowed.',
			discountAmount: 0,
			lockedCode: locked?.affiliateCode || null
		};
	}

	const discount = await getAffiliateDiscountForOrder({
		buyerUserId: params.buyerUserId,
		affiliateUserId: validation.userId,
		subtotalAmount: params.subtotalAmount,
		orderItems: params.orderItems
	});

	return {
		valid: true,
		discountAmount: discount.discountAmount,
		orderIndex: discount.orderIndex,
		stage: discount.stage,
		stageLabel: discount.stageLabel,
		ruleMode: discount.ruleMode,
		remainingRewardedOrders: discount.remainingRewardedOrders,
		expiresAfterOrder: discount.expiresAfterOrder,
		maxRewardedOrders: discount.maxRewardedOrders,
		lockedCode: locked?.affiliateCode || requestedCode
	};
}
