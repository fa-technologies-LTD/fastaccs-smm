import { env } from '$env/dynamic/private';
import { randomUUID } from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Cookies } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { SC_AFFILIATE_ADJUSTMENT, SC_REDEEM_EARNED } from '$lib/services/store-credit';
import {
	sendAffiliateUnlockEmailIfNeeded,
	sendFirstStoreCreditEmailIfNeeded
} from '$lib/services/affiliate-notification-email';
import { sendAffiliatePayoutStatusEmailIfNeeded } from '$lib/services/affiliate-payout-email';
import { sendEmail } from '$lib/services/email';
import { getOperationalAlertRecipients } from '$lib/services/admin-settings';
import {
	getRewardVestingDays,
	computeVestsAt,
	detectAffiliateIdentityRiskSignals,
	reconcileRegularRewardForOrder,
	reverseVestedRegularRewardForOrder,
	voidUnvestedRewardsForOrder
} from '$lib/services/affiliate-vesting';
import {
	buildRevenueOrderWhere,
	buildSettledOrderWhere,
	toNetSales
} from '$lib/helpers/order-revenue.server';
import { isRevenueOrder } from '$lib/helpers/order-revenue';
import {
	calculateAffiliateBuyerDiscount,
	calculateRegularAffiliateReward,
	calculateSuperMonthlyBonusIncrement,
	calculateSuperReferralProgress,
	getHighestSuperMonthlyTier,
	isAffiliateEligibleOrderType,
	type SuperMonthlyTier
} from '$lib/services/affiliate-policy';
import { recordAffiliateEvent } from '$lib/services/affiliate-events';
import { createAdminAuditLog } from '$lib/services/admin-audit';

export const AFFILIATE_REFERRAL_COOKIE = 'fa_aff_ref';

const REFERRAL_LOCK_CATEGORY = 'affiliate_referral';
const REFERRAL_LOCK_KEY_PREFIX = 'affiliate.referral.lock.user.';
const UNLOCK_SENT_KEY_PREFIX = 'affiliate.unlock.sent.user.';

const AFFILIATE_CONFIG_KEYS = {
	unlockThreshold: 'config.affiliate.unlock_threshold',
	discountStage1Percent: 'config.affiliate.discount_stage1_percent',
	discountStage1Cap: 'config.affiliate.discount_stage1_cap',
	buyerDiscountOrderLimit: 'config.affiliate.buyer_discount_order_limit',
	maxRewardedOrdersPerBuyer: 'config.affiliate.max_rewarded_orders_per_buyer',
	storeCreditMax: 'config.affiliate.store_credit_max',
	storeCreditFallbackPercent: 'config.affiliate.store_credit_fallback_percent',
	excludedTierKeywords: 'config.affiliate.excluded_tier_keywords',
	payoutMinimum: 'config.affiliate.payout_minimum',
	payoutMinAccountAgeDays: 'config.affiliate.payout_min_account_age_days',
	dashboardPopupsEnabled: 'config.affiliate.dashboard_popups_enabled',
	superAffiliateEnabled: 'config.affiliate.super.enabled',
	superActivationSpendThreshold: 'config.affiliate.super.activation_spend_threshold',
	superActivationOrderThreshold: 'config.affiliate.super.activation_order_threshold',
	superActivationReward: 'config.affiliate.super.activation_reward',
	superTier1Count: 'config.affiliate.super.tier_1_count',
	superTier1Amount: 'config.affiliate.super.tier_1_amount',
	superTier2Count: 'config.affiliate.super.tier_2_count',
	superTier2Amount: 'config.affiliate.super.tier_2_amount',
	superTier3Count: 'config.affiliate.super.tier_3_count',
	superTier3Amount: 'config.affiliate.super.tier_3_amount'
} as const;

const DEFAULT_AFFILIATE_CONFIG = {
	unlockThreshold: 20_000,
	discountStage1Percent: 5,
	discountStage1Cap: 1_000,
	buyerDiscountOrderLimit: 2,
	maxRewardedOrdersPerBuyer: 2,
	storeCreditMax: 1_000,
	storeCreditFallbackPercent: 5,
	excludedTierKeywords: ['0f', 'empty-f', 'empty f'],
	payoutMinimum: 10_000,
	payoutMinAccountAgeDays: 15,
	dashboardPopupsEnabled: true,
	superAffiliateEnabled: true,
	superActivationSpendThreshold: 3_500,
	superActivationOrderThreshold: 3,
	superActivationReward: 700,
	superTier1Count: 10,
	superTier1Amount: 3_000,
	superTier2Count: 20,
	superTier2Amount: 8_000,
	superTier3Count: 30,
	superTier3Amount: 15_000
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

// Payout-progress milestone marks (descending) that trigger a dashboard pop-up.
export const PROGRESS_MILESTONES = [80, 30] as const;

export type AffiliatePopupType =
	| 'welcome'
	| 'progress_50'
	| 'progress_80'
	| 'progress_95'
	| 'unlocked'
	| 'share_code';

const AFFILIATE_POPUP_SEEN_FIELDS = {
	welcome: 'affiliateWelcomePopupSeenAt',
	progress_50: 'affiliateProgress50PopupSeenAt',
	progress_80: 'affiliateProgress80PopupSeenAt',
	progress_95: 'affiliateProgress95PopupSeenAt',
	// 'unlocked' now carries the "add bank details to withdraw" (KYC-first) prompt.
	unlocked: 'affiliateUnlockedPopupSeenAt',
	// 'share_code' is the follow-up "copy & share your code" prompt, shown once
	// after the affiliate has saved payout bank details.
	share_code: 'affiliateShareCodePopupSeenAt'
} as const;

export interface AffiliateConfig {
	unlockThreshold: number;
	discountStage1Percent: number;
	discountStage1Cap: number;
	buyerDiscountOrderLimit: number;
	maxRewardedOrdersPerBuyer: number;
	storeCreditMax: number;
	storeCreditFallbackPercent: number;
	excludedTierKeywords: string[];
	payoutMinimum: number;
	payoutMinAccountAgeDays: number;
	dashboardPopupsEnabled: boolean;
	superAffiliateEnabled: boolean;
	superActivationSpendThreshold: number;
	superActivationOrderThreshold: number;
	superActivationReward: number;
	superTier1Count: number;
	superTier1Amount: number;
	superTier2Count: number;
	superTier2Amount: number;
	superTier3Count: number;
	superTier3Amount: number;
}

export interface LockedReferralAttribution {
	affiliateProgramId: string;
	affiliateCode: string;
	referrerUserId: string;
	referredUserId: string;
	source: string;
	lockedAt: string;
	policySnapshot: Record<string, unknown> | null;
}

export interface AffiliateQualificationStatus {
	eligible: boolean;
	lifetimeCompletedSpend: number;
	threshold: number;
	reason: 'eligible' | 'no_completed_purchase' | 'inactive_user' | 'user_not_found';
}

export interface AffiliateAccessSummary {
	eligible: boolean;
	unlocked: boolean;
	canActivate: boolean;
	isActive: boolean;
}

export interface AffiliateDiscountResult {
	discountAmount: number;
	orderIndex: number;
	stage: 'stage_1' | 'none';
	stageLabel: 'First two orders' | 'Expired';
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
	payoutHasOpenRequest: boolean;
	payoutBlockers: AffiliatePayoutBlocker[];
	hasBankDetails: boolean;
	bankDetailsStatus: string | null;
	payoutMinimum: number;
	payoutMinAccountAgeDays: number;
	accountAgeDays: number;
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
	isSuperAffiliate: boolean;
	superReferrals: SuperReferralProgressItem[];
	superActivationsThisMonth: number;
	regularPolicy: {
		buyerDiscountPercent: number;
		affiliateRewardPercent: number;
		orderLimit: number;
		perOrderCap: number;
	};
	superPolicy: {
		enabledForNewReferrals: boolean;
		activationSpendThreshold: number;
		activationOrderThreshold: number;
		activationReward: number;
		monthlyTiers: Array<{ count: number; totalAmount: number }>;
	};
}

export type AffiliatePayoutBlocker =
	| 'minimum_balance'
	| 'account_age'
	| 'bank_details_missing'
	| 'bank_details_pending'
	| 'bank_details_rejected'
	| 'payout_pending';

export interface SuperReferralProgressItem {
	userId: string;
	displayName: string;
	status: 'pending' | 'activated';
	orderCount: number;
	cumulativeSpend: number;
	orderTarget: number;
	spendTarget: number;
	activationReward: number;
	termsFrozen: boolean;
	activatedAt: string | null;
}

export interface AffiliateLedgerSummary {
	availableStoreCredit: number;
	pendingStoreCredit: number;
	underReviewStoreCredit: number;
	requestedStoreCredit: number;
	paidStoreCredit: number;
	reversedStoreCredit: number;
	totalStoreCreditEarned: number;
}

export interface AffiliateRewardCostSummary {
	regularRewardCost: number;
	superRewardCost: number;
	totalRewardCost: number;
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
	hasBankDetails: boolean;
	payoutProgressPercent: number;
	popupsEnabled: boolean;
	seenAt: {
		welcome: Date | null;
		progress50: Date | null;
		progress80: Date | null;
		progress95: Date | null;
		unlocked: Date | null;
		shareCode: Date | null;
	};
}): AffiliatePopupType | null {
	if (!input.popupsEnabled) return null;

	// Sharing is the first useful affiliate action. Bank details are only requested
	// after at least one reward has vested (positive payout progress).
	if (input.unlocked && !input.seenAt.shareCode) return 'share_code';
	if (
		input.unlocked &&
		input.payoutProgressPercent > 0 &&
		!input.hasBankDetails &&
		!input.seenAt.unlocked
	)
		return 'unlocked';

	// Payout-progress milestones (repurposed from the retired spend milestones): show
	// how close the affiliate is to the ₦-payout minimum, at 80% and 30%. We reuse the
	// existing progress_80 / progress_50 popup slots; the 95% slot is retired.
	const payoutMilestones: Array<{ percent: number; type: AffiliatePopupType; seen: Date | null }> =
		[
			{ percent: 80, type: 'progress_80', seen: input.seenAt.progress80 },
			{ percent: 30, type: 'progress_50', seen: input.seenAt.progress50 }
		];
	const milestone = input.unlocked
		? payoutMilestones.find(
				(candidate) => input.payoutProgressPercent >= candidate.percent && !candidate.seen
			)
		: null;
	if (milestone) return milestone.type;

	// The welcome explainer is only useful before access unlocks. Showing it later
	// repeats instructions and can incorrectly tell an existing affiliate to buy again.
	if (!input.unlocked && !input.seenAt.welcome) return 'welcome';

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
		const policySnapshot =
			parsed.policySnapshot &&
			typeof parsed.policySnapshot === 'object' &&
			!Array.isArray(parsed.policySnapshot)
				? (parsed.policySnapshot as Record<string, unknown>)
				: null;

		if (!affiliateProgramId || !affiliateCode || !referrerUserId || !referredUserId) {
			return null;
		}

		return {
			affiliateProgramId,
			affiliateCode,
			referrerUserId,
			referredUserId,
			source,
			lockedAt,
			policySnapshot
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
	if (normalizedType === SC_AFFILIATE_ADJUSTMENT) {
		return normalizedStatus === AFFILIATE_LEDGER_STATUS.reversed
			? 'Cash adjustment reversed'
			: 'Cash adjusted after refund';
	}
	if (normalizedType === SC_REDEEM_EARNED) {
		return normalizedStatus === AFFILIATE_LEDGER_STATUS.reversed
			? 'Store credit restored'
			: 'Store credit used on an order';
	}

	if (normalizedType === AFFILIATE_LEDGER_PAYOUT_TYPE) {
		if (normalizedStatus === AFFILIATE_LEDGER_STATUS.requested) return 'Payout requested';
		if (normalizedStatus === AFFILIATE_LEDGER_STATUS.paid) return 'Payout completed';
		if (normalizedStatus === AFFILIATE_LEDGER_STATUS.reversed) return 'Payout reversed';
		return 'Payout update';
	}

	if (normalizedStatus === AFFILIATE_LEDGER_STATUS.pending) return 'Referral order paid';
	if (normalizedStatus === AFFILIATE_LEDGER_STATUS.available) return 'Referral order completed';
	if (normalizedStatus === AFFILIATE_LEDGER_STATUS.underReview) return 'Cash under review';
	if (normalizedStatus === AFFILIATE_LEDGER_STATUS.reversed) return 'Cash reversed';
	return 'Cash update';
}

function isKnownAffiliateLedgerStatus(value: string): value is AffiliateLedgerStatus {
	return Object.values(AFFILIATE_LEDGER_STATUS).includes(value as AffiliateLedgerStatus);
}

type AffiliateDb = PrismaClient | Prisma.TransactionClient;

export function calculateAffiliateLedgerSummary(
	rows: readonly {
		type: string;
		status: string;
		amount?: unknown;
		_sum?: { amount?: unknown } | null;
	}[]
): AffiliateLedgerSummary {
	// Earned Store Credit spent on-site reduces what is still cashable, so the
	// same naira can never be both spent and withdrawn.
	let earnedRedeemedOnSite = 0;
	let affiliateAdjustments = 0;
	const emptyStatuses = (): Record<AffiliateLedgerStatus, number> => ({
		pending: 0,
		available: 0,
		under_review: 0,
		requested: 0,
		paid: 0,
		reversed: 0
	});
	const creditByStatus = emptyStatuses();
	const payoutByStatus = emptyStatuses();

	for (const row of rows) {
		const status = String(row.status || '')
			.trim()
			.toLowerCase();
		if (!isKnownAffiliateLedgerStatus(status)) continue;
		const amount = Math.max(0, Number(row._sum?.amount ?? row.amount ?? 0));
		if (String(row.type) === AFFILIATE_LEDGER_CREDIT_TYPE) {
			creditByStatus[status] += amount;
		} else if (String(row.type) === AFFILIATE_LEDGER_PAYOUT_TYPE) {
			payoutByStatus[status] += amount;
		} else if (String(row.type) === SC_REDEEM_EARNED && status === 'available') {
			earnedRedeemedOnSite += amount;
		} else if (String(row.type) === SC_AFFILIATE_ADJUSTMENT && status === 'available') {
			affiliateAdjustments += amount;
		}
	}

	const requestedStoreCredit = payoutByStatus.requested + payoutByStatus.under_review;
	const paidStoreCredit = payoutByStatus.paid;
	return {
		availableStoreCredit: Math.max(
			0,
			creditByStatus.available -
				requestedStoreCredit -
				paidStoreCredit -
				earnedRedeemedOnSite -
				affiliateAdjustments
		),
		pendingStoreCredit: creditByStatus.pending,
		underReviewStoreCredit: creditByStatus.under_review,
		requestedStoreCredit,
		paidStoreCredit,
		reversedStoreCredit: creditByStatus.reversed + payoutByStatus.reversed,
		totalStoreCreditEarned: Math.max(
			0,
			creditByStatus.available +
				creditByStatus.pending +
				creditByStatus.under_review +
				creditByStatus.requested +
				creditByStatus.paid -
				affiliateAdjustments
		)
	};
}

/** Canonical retained reward cost split for business reporting. Reversed rewards do
 * not remain a cost; append-only clawback adjustments reduce the matching programme.
 * Unknown legacy credit references are treated as regular rather than disappearing. */
export function calculateAffiliateRewardCostSummary(
	rows: readonly {
		type: string;
		status: string;
		amount?: unknown;
		reference?: string | null;
		metadata?: unknown;
	}[]
): AffiliateRewardCostSummary {
	let regularRewardCost = 0;
	let superRewardCost = 0;
	for (const row of rows) {
		const status = String(row.status || '').toLowerCase();
		if (['reversed', 'failed', 'cancelled'].includes(status)) continue;
		const amount = Math.max(0, Number(row.amount || 0));
		const reference = String(row.reference || '').toLowerCase();
		const metadata =
			row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
				? (row.metadata as Record<string, unknown>)
				: {};
		const kind = String(metadata.kind || '').toLowerCase();
		const isSuper = reference.startsWith('super:') || kind.startsWith('super_');

		if (row.type === AFFILIATE_LEDGER_CREDIT_TYPE) {
			if (isSuper) superRewardCost += amount;
			else regularRewardCost += amount;
		} else if (row.type === SC_AFFILIATE_ADJUSTMENT && status === 'available') {
			if (isSuper) superRewardCost -= amount;
			else regularRewardCost -= amount;
		}
	}
	regularRewardCost = Math.max(0, Math.round(regularRewardCost * 100) / 100);
	superRewardCost = Math.max(0, Math.round(superRewardCost * 100) / 100);
	return {
		regularRewardCost,
		superRewardCost,
		totalRewardCost: Math.round((regularRewardCost + superRewardCost) * 100) / 100
	};
}

export function calculateAffiliatePayoutEligibility(input: {
	availableStoreCredit: number;
	requestedStoreCredit: number;
	payoutMinimum: number;
	accountAgeDays: number;
	payoutMinAccountAgeDays: number;
	bankDetailsStatus: string | null;
}): { eligible: boolean; hasOpenRequest: boolean; blockers: AffiliatePayoutBlocker[] } {
	const hasOpenRequest = input.requestedStoreCredit > 0;
	const blockers: AffiliatePayoutBlocker[] = [];
	if (hasOpenRequest) {
		blockers.push('payout_pending');
	} else {
		if (input.availableStoreCredit < input.payoutMinimum) blockers.push('minimum_balance');
		if (input.accountAgeDays < input.payoutMinAccountAgeDays) blockers.push('account_age');
		if (!input.bankDetailsStatus) blockers.push('bank_details_missing');
		else if (input.bankDetailsStatus === 'pending') blockers.push('bank_details_pending');
		else if (input.bankDetailsStatus === 'rejected') blockers.push('bank_details_rejected');
		else if (input.bankDetailsStatus !== 'approved') blockers.push('bank_details_pending');
	}
	return { eligible: blockers.length === 0, hasOpenRequest, blockers };
}

async function getAffiliateLedgerSummary(
	userId: string,
	db: AffiliateDb = prisma
): Promise<AffiliateLedgerSummary> {
	const grouped = await db.walletTransaction.groupBy({
		by: ['type', 'status'],
		where: {
			userId,
			type: {
				in: [
					AFFILIATE_LEDGER_CREDIT_TYPE,
					AFFILIATE_LEDGER_PAYOUT_TYPE,
					SC_REDEEM_EARNED,
					SC_AFFILIATE_ADJUSTMENT
				]
			}
		},
		_sum: {
			amount: true
		}
	});

	return calculateAffiliateLedgerSummary(grouped);
}

/** Maximum cash entitlement before open-request reservations. Used at final payout time
 * so a refund/reversal that lands after the request can never be paid from stale data. */
export async function getAffiliateMaximumPayable(
	userId: string,
	db: AffiliateDb = prisma
): Promise<number> {
	const grouped = await db.walletTransaction.groupBy({
		by: ['type', 'status'],
		where: {
			userId,
			type: {
				in: [
					AFFILIATE_LEDGER_CREDIT_TYPE,
					AFFILIATE_LEDGER_PAYOUT_TYPE,
					SC_REDEEM_EARNED,
					SC_AFFILIATE_ADJUSTMENT
				]
			}
		},
		_sum: { amount: true }
	});
	let credits = 0;
	let spentOrAdjusted = 0;
	let paidOut = 0;
	for (const row of grouped) {
		const amount = Math.max(0, Number(row._sum.amount || 0));
		const status = String(row.status || '').toLowerCase();
		const type = String(row.type || '');
		if (type === AFFILIATE_LEDGER_CREDIT_TYPE && status === AFFILIATE_LEDGER_STATUS.available) {
			credits += amount;
		} else if (
			(type === SC_REDEEM_EARNED || type === SC_AFFILIATE_ADJUSTMENT) &&
			status === AFFILIATE_LEDGER_STATUS.available
		) {
			spentOrAdjusted += amount;
		} else if (type === AFFILIATE_LEDGER_PAYOUT_TYPE && status === AFFILIATE_LEDGER_STATUS.paid) {
			paidOut += amount;
		}
	}
	return Math.max(0, credits - spentOrAdjusted - paidOut);
}

async function countSuccessfulOrdersForAffiliatePair(
	buyerUserId: string,
	affiliateUserId: string
): Promise<number> {
	return prisma.order.count({
		where: {
			AND: [
				buildRevenueOrderWhere(),
				{
					userId: buyerUserId,
					affiliateUserId,
					orderType: 'account',
					discountAmount: { gt: 0 }
				}
			]
		}
	});
}

async function countLifetimeCompletedSpend(userId: string): Promise<number> {
	const aggregate = await prisma.order.aggregate({
		where: { AND: [buildRevenueOrderWhere(), { userId }] },
		_sum: {
			totalAmount: true,
			refundedAmount: true
		}
	});

	return toNetSales(aggregate._sum.totalAmount, aggregate._sum.refundedAmount);
}

async function countCompletedOrders(userId: string): Promise<number> {
	return prisma.order.count({
		where: { AND: [buildRevenueOrderWhere(), { userId }] }
	});
}

/**
 * Lightweight dashboard access check. Keep the ordinary Orders view away from the
 * full affiliate ledger/referral report; that report is loaded only when its tab opens.
 */
export async function getAffiliateAccessSummary(userId: string): Promise<AffiliateAccessSummary> {
	const [user, program, completedOrderCount] = await Promise.all([
		prisma.user.findUnique({
			where: { id: userId },
			select: { isActive: true, isAffiliateEnabled: true }
		}),
		prisma.affiliateProgram.findFirst({
			where: { userId },
			select: { status: true }
		}),
		countCompletedOrders(userId)
	]);

	const isActive = Boolean(
		user?.isActive && user.isAffiliateEnabled && program?.status === 'active'
	);
	const hardDisabled = Boolean(program?.status === 'inactive' && !user?.isAffiliateEnabled);
	const eligible = Boolean(user?.isActive && completedOrderCount > 0 && !hardDisabled);

	return {
		eligible,
		unlocked: !hardDisabled && (eligible || isActive),
		canActivate: eligible && !isActive,
		isActive
	};
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
		// The public 5-for-5 offer is a locked business contract, not a runtime knob.
		// Historic rewards retain their own snapshots; future rewards use this one policy.
		discountStage1Percent: DEFAULT_AFFILIATE_CONFIG.discountStage1Percent,
		discountStage1Cap: DEFAULT_AFFILIATE_CONFIG.discountStage1Cap,
		buyerDiscountOrderLimit: DEFAULT_AFFILIATE_CONFIG.buyerDiscountOrderLimit,
		maxRewardedOrdersPerBuyer: DEFAULT_AFFILIATE_CONFIG.maxRewardedOrdersPerBuyer,
		storeCreditMax: DEFAULT_AFFILIATE_CONFIG.storeCreditMax,
		storeCreditFallbackPercent: DEFAULT_AFFILIATE_CONFIG.storeCreditFallbackPercent,
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
		),
		superAffiliateEnabled: parseBooleanSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superAffiliateEnabled),
			DEFAULT_AFFILIATE_CONFIG.superAffiliateEnabled
		),
		superActivationSpendThreshold: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superActivationSpendThreshold),
			DEFAULT_AFFILIATE_CONFIG.superActivationSpendThreshold,
			1,
			10_000_000
		),
		superActivationOrderThreshold: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superActivationOrderThreshold),
			DEFAULT_AFFILIATE_CONFIG.superActivationOrderThreshold,
			1,
			100
		),
		superActivationReward: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superActivationReward),
			DEFAULT_AFFILIATE_CONFIG.superActivationReward,
			0,
			1_000_000
		),
		superTier1Count: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superTier1Count),
			DEFAULT_AFFILIATE_CONFIG.superTier1Count,
			1,
			10_000
		),
		superTier1Amount: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superTier1Amount),
			DEFAULT_AFFILIATE_CONFIG.superTier1Amount,
			0,
			10_000_000
		),
		superTier2Count: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superTier2Count),
			DEFAULT_AFFILIATE_CONFIG.superTier2Count,
			1,
			10_000
		),
		superTier2Amount: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superTier2Amount),
			DEFAULT_AFFILIATE_CONFIG.superTier2Amount,
			0,
			10_000_000
		),
		superTier3Count: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superTier3Count),
			DEFAULT_AFFILIATE_CONFIG.superTier3Count,
			1,
			10_000
		),
		superTier3Amount: parseNumberSetting(
			byKey.get(AFFILIATE_CONFIG_KEYS.superTier3Amount),
			DEFAULT_AFFILIATE_CONFIG.superTier3Amount,
			0,
			10_000_000
		)
	};
}

export async function getAffiliateConfig(): Promise<AffiliateConfig> {
	return parseAffiliateConfig();
}

export async function saveAffiliateConfig(
	input: {
		discountStage1Percent: string;
		discountStage1Cap: string;
		buyerDiscountOrderLimit: string;
		maxRewardedOrdersPerBuyer: string;
		storeCreditMax: string;
		storeCreditFallbackPercent: string;
		excludedTierKeywords: string;
		payoutMinimum: string;
		payoutMinAccountAgeDays: string;
		dashboardPopupsEnabled: string;
		superAffiliateEnabled: string;
		superActivationSpendThreshold: string;
		superActivationOrderThreshold: string;
		superActivationReward: string;
		superTier1Count: string;
		superTier1Amount: string;
		superTier2Count: string;
		superTier2Amount: string;
		superTier3Count: string;
		superTier3Amount: string;
	},
	options?: {
		onBeforeCommit?: (config: AffiliateConfig, tx: Prisma.TransactionClient) => Promise<void>;
	}
): Promise<AffiliateConfig> {
	const nextConfig: AffiliateConfig = {
		// Retained for compatibility with old dashboard payloads. It is not an entry gate.
		unlockThreshold: DEFAULT_AFFILIATE_CONFIG.unlockThreshold,
		discountStage1Percent: DEFAULT_AFFILIATE_CONFIG.discountStage1Percent,
		discountStage1Cap: DEFAULT_AFFILIATE_CONFIG.discountStage1Cap,
		buyerDiscountOrderLimit: DEFAULT_AFFILIATE_CONFIG.buyerDiscountOrderLimit,
		maxRewardedOrdersPerBuyer: DEFAULT_AFFILIATE_CONFIG.maxRewardedOrdersPerBuyer,
		storeCreditMax: DEFAULT_AFFILIATE_CONFIG.storeCreditMax,
		storeCreditFallbackPercent: DEFAULT_AFFILIATE_CONFIG.storeCreditFallbackPercent,
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
		),
		superAffiliateEnabled: parseBooleanSetting(
			input.superAffiliateEnabled,
			DEFAULT_AFFILIATE_CONFIG.superAffiliateEnabled
		),
		superActivationSpendThreshold: parseNumberSetting(
			input.superActivationSpendThreshold,
			DEFAULT_AFFILIATE_CONFIG.superActivationSpendThreshold,
			1,
			10_000_000
		),
		superActivationOrderThreshold: parseNumberSetting(
			input.superActivationOrderThreshold,
			DEFAULT_AFFILIATE_CONFIG.superActivationOrderThreshold,
			1,
			100
		),
		superActivationReward: parseNumberSetting(
			input.superActivationReward,
			DEFAULT_AFFILIATE_CONFIG.superActivationReward,
			0,
			1_000_000
		),
		superTier1Count: parseNumberSetting(
			input.superTier1Count,
			DEFAULT_AFFILIATE_CONFIG.superTier1Count,
			1,
			10_000
		),
		superTier1Amount: parseNumberSetting(
			input.superTier1Amount,
			DEFAULT_AFFILIATE_CONFIG.superTier1Amount,
			0,
			10_000_000
		),
		superTier2Count: parseNumberSetting(
			input.superTier2Count,
			DEFAULT_AFFILIATE_CONFIG.superTier2Count,
			1,
			10_000
		),
		superTier2Amount: parseNumberSetting(
			input.superTier2Amount,
			DEFAULT_AFFILIATE_CONFIG.superTier2Amount,
			0,
			10_000_000
		),
		superTier3Count: parseNumberSetting(
			input.superTier3Count,
			DEFAULT_AFFILIATE_CONFIG.superTier3Count,
			1,
			10_000
		),
		superTier3Amount: parseNumberSetting(
			input.superTier3Amount,
			DEFAULT_AFFILIATE_CONFIG.superTier3Amount,
			0,
			10_000_000
		)
	};

	if (nextConfig.storeCreditMax <= 0) {
		throw new Error('Affiliate reward maximum must be greater than zero.');
	}
	if (
		nextConfig.discountStage1Percent !== nextConfig.storeCreditFallbackPercent ||
		nextConfig.discountStage1Cap !== nextConfig.storeCreditMax
	) {
		throw new Error(
			'The buyer discount and affiliate reward must use the same percentage and per-order cap.'
		);
	}
	if (nextConfig.maxRewardedOrdersPerBuyer !== nextConfig.buyerDiscountOrderLimit) {
		throw new Error(
			'The buyer discount and affiliate reward must cover the same number of orders.'
		);
	}
	if (
		!(
			nextConfig.superTier1Count < nextConfig.superTier2Count &&
			nextConfig.superTier2Count < nextConfig.superTier3Count
		)
	) {
		throw new Error('Super-affiliate activation tiers must increase in order.');
	}
	if (
		!(
			nextConfig.superTier1Amount <= nextConfig.superTier2Amount &&
			nextConfig.superTier2Amount <= nextConfig.superTier3Amount
		)
	) {
		throw new Error('Super-affiliate bonus totals must not decrease at higher tiers.');
	}

	const entries: Array<[string, string, string]> = [
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
			AFFILIATE_CONFIG_KEYS.buyerDiscountOrderLimit,
			String(nextConfig.buyerDiscountOrderLimit),
			'Number of retained account orders that receive the buyer discount'
		],
		[
			AFFILIATE_CONFIG_KEYS.maxRewardedOrdersPerBuyer,
			String(nextConfig.maxRewardedOrdersPerBuyer),
			'Maximum rewarded referred orders per buyer'
		],
		[
			AFFILIATE_CONFIG_KEYS.storeCreditMax,
			String(nextConfig.storeCreditMax),
			'Maximum regular Affiliate Cash reward'
		],
		[
			AFFILIATE_CONFIG_KEYS.storeCreditFallbackPercent,
			String(nextConfig.storeCreditFallbackPercent),
			'Regular Affiliate Cash percentage'
		],
		[
			AFFILIATE_CONFIG_KEYS.excludedTierKeywords,
			nextConfig.excludedTierKeywords.join(', '),
			'Tier keywords excluded from affiliate rewards'
		],
		[
			AFFILIATE_CONFIG_KEYS.payoutMinimum,
			String(nextConfig.payoutMinimum),
			'Minimum available Affiliate Cash required before payout'
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
		],
		[
			AFFILIATE_CONFIG_KEYS.superAffiliateEnabled,
			String(nextConfig.superAffiliateEnabled),
			'Enable super-affiliate rewards'
		],
		[
			AFFILIATE_CONFIG_KEYS.superActivationSpendThreshold,
			String(nextConfig.superActivationSpendThreshold),
			'Super-affiliate retained-spend activation threshold'
		],
		[
			AFFILIATE_CONFIG_KEYS.superActivationOrderThreshold,
			String(nextConfig.superActivationOrderThreshold),
			'Super-affiliate retained-order activation threshold'
		],
		[
			AFFILIATE_CONFIG_KEYS.superActivationReward,
			String(nextConfig.superActivationReward),
			'Super-affiliate reward for one qualified referral'
		],
		[
			AFFILIATE_CONFIG_KEYS.superTier1Count,
			String(nextConfig.superTier1Count),
			'Super-affiliate monthly tier 1 activation count'
		],
		[
			AFFILIATE_CONFIG_KEYS.superTier1Amount,
			String(nextConfig.superTier1Amount),
			'Super-affiliate monthly tier 1 total bonus'
		],
		[
			AFFILIATE_CONFIG_KEYS.superTier2Count,
			String(nextConfig.superTier2Count),
			'Super-affiliate monthly tier 2 activation count'
		],
		[
			AFFILIATE_CONFIG_KEYS.superTier2Amount,
			String(nextConfig.superTier2Amount),
			'Super-affiliate monthly tier 2 total bonus'
		],
		[
			AFFILIATE_CONFIG_KEYS.superTier3Count,
			String(nextConfig.superTier3Count),
			'Super-affiliate monthly tier 3 activation count'
		],
		[
			AFFILIATE_CONFIG_KEYS.superTier3Amount,
			String(nextConfig.superTier3Amount),
			'Super-affiliate monthly tier 3 total bonus'
		]
	];

	await prisma.$transaction(async (tx) => {
		for (const [key, value, description] of entries) {
			await tx.microcopy.upsert({
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
			});
		}
		if (options?.onBeforeCommit) {
			await options.onBeforeCommit(nextConfig, tx);
		}
	});

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
// Build a recognizable, name-based code stub (e.g. "Elon Musk" -> "ELMSK"): first two
// letters of the first name + a consonant-compressed stub of the last name. Single-word
// names take their first 6 letters; empty names fall back to "FA".
export function buildAffiliateCodeBase(fullName: string | null | undefined): string {
	const cleaned = String(fullName || '')
		.toUpperCase()
		.replace(/[^A-Z\s]/g, ' ')
		.trim();
	const words = cleaned.split(/\s+/).filter(Boolean);
	if (words.length === 0) return 'FA';

	const compress = (word: string, max: number): string => {
		const first = word[0];
		const rest = word.slice(1).replace(/[AEIOU]/g, '');
		const stub = first + rest;
		return (stub.length >= 2 ? stub : word).slice(0, max);
	};

	const base =
		words.length === 1
			? words[0].slice(0, 6)
			: (words[0].slice(0, 2) + compress(words[words.length - 1], 3)).slice(0, 6);
	return base.length >= 2 ? base : (base + 'FA').slice(0, 2);
}

// Return `base`, or base2/base3/... if already taken. `excludeProgramId` lets a program
// keep/settle on its own code during a rename without colliding with itself.
export async function ensureUniqueAffiliateCode(
	base: string,
	excludeProgramId?: string
): Promise<string> {
	for (let n = 1; n < 1000; n++) {
		const candidate = n === 1 ? base : `${base}${n}`;
		const existing = await prisma.affiliateProgram.findUnique({
			where: { affiliateCode: candidate },
			select: { id: true }
		});
		if (!existing || existing.id === excludeProgramId) return candidate;
	}
	return `${base}${Date.now().toString().slice(-4)}`;
}

export async function generateAffiliateCode(userId: string): Promise<string> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { fullName: true }
	});
	if (!user) {
		throw new Error('User not found');
	}
	return ensureUniqueAffiliateCode(buildAffiliateCodeBase(user.fullName));
}

export async function getAffiliateQualificationStatus(
	userId: string
): Promise<AffiliateQualificationStatus> {
	const [user, config, lifetimeCompletedSpend, completedOrderCount] = await Promise.all([
		prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				isActive: true
			}
		}),
		getAffiliateConfig(),
		countLifetimeCompletedSpend(userId),
		countCompletedOrders(userId)
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

	// Access unlocks on the first retained completed purchase. The old spend threshold
	// is retained only in the compatibility payload while older clients roll off.
	if (completedOrderCount <= 0) {
		return {
			eligible: false,
			lifetimeCompletedSpend,
			threshold: config.unlockThreshold,
			reason: 'no_completed_purchase'
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
		affiliateType?: 'regular' | 'super';
		adminActorUserId?: string;
	}
): Promise<{ success: boolean; affiliateCode?: string; error?: string }> {
	const forceEnable = Boolean(options?.force);
	const requestedSuperStatus =
		options?.affiliateType === undefined ? undefined : options.affiliateType === 'super';
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true }
	});
	if (!user) return { success: false, error: 'User not found' };

	// Different users can activate concurrently. Calls for the same user serialize on
	// the user row, then re-read the live user/program state before making a decision.
	// Retry only handles the much rarer case of two people claiming the same readable
	// affiliate-code candidate at the same time.
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			const candidateCode = await generateAffiliateCode(userId);
			const result = await prisma.$transaction(async (tx) => {
				await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
				const [liveUser, liveProgram] = await Promise.all([
					tx.user.findUnique({
						where: { id: userId },
						select: { id: true, isActive: true, isAffiliateEnabled: true, userType: true }
					}),
					tx.affiliateProgram.findUnique({
						where: { userId },
						select: {
							id: true,
							affiliateCode: true,
							status: true,
							isSuperAffiliate: true
						}
					})
				]);

				if (!liveUser) return { error: 'User not found' } as const;
				if (!liveUser.isActive && !forceEnable) {
					return { error: 'Inactive users cannot activate affiliate access.' } as const;
				}
				if (!forceEnable && liveProgram?.status === 'inactive' && !liveUser.isAffiliateEnabled) {
					return {
						error: 'Affiliate access is currently disabled. Contact support for review.'
					} as const;
				}
				if (!forceEnable) {
					const retainedPurchaseCount = await tx.order.count({
						where: { AND: [buildRevenueOrderWhere(), { userId }] }
					});
					if (retainedPurchaseCount <= 0) {
						return {
							error:
								'Affiliate access becomes available after your first successfully completed purchase.'
						} as const;
					}
				}

				const targetSuperStatus = requestedSuperStatus ?? liveProgram?.isSuperAffiliate ?? false;
				const alreadyCorrect =
					liveUser.isAffiliateEnabled &&
					liveProgram?.status === 'active' &&
					liveProgram.isSuperAffiliate === targetSuperStatus;
				if (alreadyCorrect && liveProgram) {
					return { affiliateCode: liveProgram.affiliateCode, changed: false } as const;
				}

				let programId = liveProgram?.id || null;
				let affiliateCode = liveProgram?.affiliateCode || candidateCode;
				if (!liveProgram) {
					const created = await tx.affiliateProgram.create({
						data: {
							userId,
							affiliateCode,
							status: 'active',
							isSuperAffiliate: targetSuperStatus
						},
						select: { id: true, affiliateCode: true }
					});
					programId = created.id;
					affiliateCode = created.affiliateCode;
				} else {
					await tx.affiliateProgram.update({
						where: { id: liveProgram.id },
						data: { status: 'active', isSuperAffiliate: targetSuperStatus }
					});
				}

				await tx.user.update({
					where: { id: userId },
					data: {
						isAffiliateEnabled: true,
						userType: liveUser.userType === 'ADMIN' ? liveUser.userType : 'AFFILIATE'
					}
				});

				if (options?.adminActorUserId) {
					await createAdminAuditLog(
						{
							actorUserId: options.adminActorUserId,
							targetUserId: userId,
							action: liveUser.isAffiliateEnabled
								? 'affiliate_type_changed'
								: 'affiliate_access_enabled',
							resourceType: 'affiliate_program',
							resourceId: programId,
							description: `Affiliate access enabled as ${targetSuperStatus ? 'super' : 'regular'}`,
							metadata: {
								beforeEnabled: liveUser.isAffiliateEnabled,
								beforeStatus: liveProgram?.status || null,
								beforeType: liveProgram?.isSuperAffiliate ? 'super' : 'regular',
								afterEnabled: true,
								afterStatus: 'active',
								afterType: targetSuperStatus ? 'super' : 'regular'
							},
							required: true
						},
						tx
					);
				}

				return { affiliateCode, changed: true } as const;
			});

			if ('error' in result) return { success: false, error: result.error };
			if (result.changed) {
				await recordAffiliateEvent({
					type: 'affiliate_program_enabled',
					dedupeKey: `affiliate:program_enabled:${userId}`,
					affiliateUserId: userId,
					source: forceEnable ? 'admin' : 'first_retained_purchase',
					metadata: { affiliateCode: result.affiliateCode }
				});
			}
			return { success: true, affiliateCode: result.affiliateCode };
		} catch (error) {
			if ((error as { code?: string })?.code === 'P2002' && attempt < 2) continue;
			console.error('Error enabling affiliate mode:', error);
			return { success: false, error: 'Failed to enable affiliate mode' };
		}
	}

	return { success: false, error: 'Failed to create a unique affiliate code' };
}

/**
 * Validate an affiliate code and return affiliate user info.
 */
export async function validateAffiliateCode(code: string): Promise<{
	valid: boolean;
	userId?: string;
	affiliateProgramId?: string;
	affiliateCode?: string;
	isSuperAffiliate?: boolean;
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
				isSuperAffiliate: true,
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
			affiliateCode: affiliateProgram.affiliateCode,
			isSuperAffiliate: affiliateProgram.isSuperAffiliate
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
	const locked = await getStoredReferralForUser(userId);
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

	if (!affiliateProgram) return null;
	return locked;
}

async function getStoredReferralForUser(userId: string): Promise<LockedReferralAttribution | null> {
	try {
		const durable = await prisma.affiliateReferral.findUnique({
			where: { referredUserId: userId },
			select: {
				affiliateProgramId: true,
				affiliateCode: true,
				referrerUserId: true,
				referredUserId: true,
				source: true,
				lockedAt: true,
				policySnapshot: true
			}
		});
		if (durable) {
			return {
				affiliateProgramId: durable.affiliateProgramId,
				affiliateCode: durable.affiliateCode,
				referrerUserId: durable.referrerUserId,
				referredUserId: durable.referredUserId,
				source: durable.source,
				lockedAt: durable.lockedAt.toISOString(),
				policySnapshot: parseAffiliatePolicySnapshot(durable.policySnapshot)
					? (durable.policySnapshot as Record<string, unknown>)
					: null
			};
		}
	} catch (error) {
		// During the additive rollout the new table may not exist yet. The legacy lock
		// remains readable until the separately-approved migration/backfill completes.
		if ((error as { code?: string })?.code !== 'P2021') throw error;
	}

	const key = getReferralLockKey(userId);
	const row = await prisma.microcopy.findUnique({
		where: { key },
		select: { value: true }
	});

	return parseLockedReferral(row?.value || null);
}

async function listStoredReferralsForReferrer(
	referrerUserId: string
): Promise<LockedReferralAttribution[]> {
	let durableReferrals: LockedReferralAttribution[] = [];
	try {
		const rows = await prisma.affiliateReferral.findMany({
			where: { referrerUserId },
			select: {
				affiliateProgramId: true,
				affiliateCode: true,
				referrerUserId: true,
				referredUserId: true,
				source: true,
				lockedAt: true,
				policySnapshot: true
			}
		});
		durableReferrals = rows.map((row) => ({
			affiliateProgramId: row.affiliateProgramId,
			affiliateCode: row.affiliateCode,
			referrerUserId: row.referrerUserId,
			referredUserId: row.referredUserId,
			source: row.source,
			lockedAt: row.lockedAt.toISOString(),
			policySnapshot: parseAffiliatePolicySnapshot(row.policySnapshot)
				? (row.policySnapshot as Record<string, unknown>)
				: null
		}));
	} catch (error) {
		if ((error as { code?: string })?.code !== 'P2021') throw error;
	}

	const legacyRows = await prisma.microcopy.findMany({
		where: { category: REFERRAL_LOCK_CATEGORY, key: { startsWith: REFERRAL_LOCK_KEY_PREFIX } },
		select: { value: true }
	});
	const merged = new Map(durableReferrals.map((row) => [row.referredUserId, row] as const));
	for (const legacy of legacyRows
		.map((row) => parseLockedReferral(row.value))
		.filter((row): row is LockedReferralAttribution =>
			Boolean(row?.referrerUserId === referrerUserId)
		)) {
		if (!merged.has(legacy.referredUserId)) merged.set(legacy.referredUserId, legacy);
	}
	return [...merged.values()];
}

/** Canonical referred-user counts. Falls back to legacy locks only during the
 * additive migration window; cached AffiliateProgram counters are never used as
 * referral counts because older code incremented them per order. */
export async function getCanonicalReferralCounts(
	referrerUserIds: readonly string[]
): Promise<Map<string, number>> {
	const uniqueIds = [...new Set(referrerUserIds.filter(Boolean))];
	const counts = new Map<string, number>(uniqueIds.map((id) => [id, 0]));
	if (uniqueIds.length === 0) return counts;

	const pairs = new Set<string>();
	try {
		const durableRows = await prisma.affiliateReferral.findMany({
			where: { referrerUserId: { in: uniqueIds } },
			select: { referrerUserId: true, referredUserId: true }
		});
		for (const row of durableRows) {
			pairs.add(`${row.referrerUserId}:${row.referredUserId}`);
		}
	} catch (error) {
		if ((error as { code?: string })?.code !== 'P2021') throw error;
	}

	const legacyRows = await prisma.microcopy.findMany({
		where: { category: REFERRAL_LOCK_CATEGORY, key: { startsWith: REFERRAL_LOCK_KEY_PREFIX } },
		select: { value: true }
	});
	for (const row of legacyRows) {
		const parsed = parseLockedReferral(row.value);
		if (parsed && counts.has(parsed.referrerUserId)) {
			pairs.add(`${parsed.referrerUserId}:${parsed.referredUserId}`);
		}
	}
	for (const pair of pairs) {
		const separator = pair.indexOf(':');
		const referrerUserId = separator >= 0 ? pair.slice(0, separator) : '';
		if (counts.has(referrerUserId)) {
			counts.set(referrerUserId, (counts.get(referrerUserId) || 0) + 1);
		}
	}
	return counts;
}

export async function getTotalCanonicalReferralCount(): Promise<number> {
	const programs = await prisma.affiliateProgram.findMany({ select: { userId: true } });
	const counts = await getCanonicalReferralCounts(programs.map((program) => program.userId));
	return [...counts.values()].reduce((sum, count) => sum + count, 0);
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

	const storedExisting = await getStoredReferralForUser(params.referredUserId);
	if (storedExisting) {
		const existing = await getLockedReferralForUser(params.referredUserId);
		if (!existing) {
			return {
				locked: false,
				alreadyLocked: true,
				reason: 'affiliate_inactive',
				attribution: storedExisting
			};
		}
		return {
			locked: true,
			alreadyLocked: true,
			reason: 'already_locked',
			attribution: existing
		};
	}

	const [affiliateValidation, referredUser, affiliateConfig] = await Promise.all([
		validateAffiliateCode(normalizedCode),
		prisma.user.findUnique({
			where: { id: params.referredUserId },
			select: {
				id: true,
				isActive: true
			}
		}),
		getAffiliateConfig()
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
			where: { AND: [buildRevenueOrderWhere(), { userId: params.referredUserId }] }
		});
		if (priorPaidOrders > 0) {
			return { locked: false, alreadyLocked: false, reason: 'buyer_has_prior_paid_orders' };
		}
	}

	const nowIso = new Date().toISOString();
	const policySnapshot = buildCurrentAffiliatePolicySnapshot({
		programId: affiliateValidation.affiliateProgramId,
		isSuperAffiliate: Boolean(affiliateValidation.isSuperAffiliate),
		config: affiliateConfig,
		snapshottedAt: nowIso
	});
	const attribution: LockedReferralAttribution = {
		affiliateProgramId: affiliateValidation.affiliateProgramId,
		affiliateCode: normalizedCode,
		referrerUserId: affiliateValidation.userId,
		referredUserId: params.referredUserId,
		source: params.source,
		lockedAt: nowIso,
		policySnapshot
	};

	const legacyData = {
		key: getReferralLockKey(params.referredUserId),
		value: JSON.stringify(attribution),
		description: 'Legacy mirror of durable affiliate referral attribution',
		category: REFERRAL_LOCK_CATEGORY,
		isActive: true
	};
	const assertLockStillAllowed = async (tx: Prisma.TransactionClient) => {
		await tx.$queryRaw`SELECT id FROM users WHERE id = ${params.referredUserId}::uuid FOR UPDATE`;
		if (params.source !== 'signup' && params.source !== 'google_signup') {
			const priorPaidOrders = await tx.order.count({
				where: { AND: [buildRevenueOrderWhere(), { userId: params.referredUserId }] }
			});
			if (priorPaidOrders > 0) throw new Error('REFERRAL_BUYER_ALREADY_PAID');
		}
		const activeProgram = await tx.affiliateProgram.findFirst({
			where: {
				id: attribution.affiliateProgramId,
				userId: attribution.referrerUserId,
				affiliateCode: attribution.affiliateCode,
				status: 'active',
				user: { isActive: true, isAffiliateEnabled: true }
			},
			select: { id: true, isSuperAffiliate: true }
		});
		if (!activeProgram) throw new Error('REFERRAL_AFFILIATE_INACTIVE');
		const frozenPolicy = parseAffiliatePolicySnapshot(attribution.policySnapshot);
		if (
			!frozenPolicy ||
			frozenPolicy.programId !== activeProgram.id ||
			(frozenPolicy.programType === 'super') !== Boolean(activeProgram.isSuperAffiliate)
		) {
			throw new Error('REFERRAL_PROGRAM_CHANGED');
		}
	};

	try {
		try {
			await prisma.$transaction(async (tx) => {
				await assertLockStillAllowed(tx);
				const [durableExisting, legacyExisting] = await Promise.all([
					tx.affiliateReferral.findUnique({
						where: { referredUserId: params.referredUserId },
						select: { id: true }
					}),
					tx.microcopy.findUnique({ where: { key: legacyData.key }, select: { id: true } })
				]);
				if (durableExisting || legacyExisting) throw new Error('REFERRAL_ALREADY_LOCKED');
				await tx.affiliateReferral.create({
					data: {
						affiliateProgramId: attribution.affiliateProgramId,
						affiliateCode: attribution.affiliateCode,
						referrerUserId: attribution.referrerUserId,
						referredUserId: attribution.referredUserId,
						source: attribution.source,
						policySnapshot: attribution.policySnapshot as Prisma.InputJsonObject,
						lockedAt: new Date(attribution.lockedAt)
					}
				});
				await tx.microcopy.create({ data: legacyData });
			});
		} catch (error) {
			if ((error as { code?: string })?.code !== 'P2021') throw error;
			// Migration-window compatibility: preserve the same user lock and paid-order
			// recheck even when the durable table is not available yet.
			await prisma.$transaction(async (tx) => {
				await assertLockStillAllowed(tx);
				const existing = await tx.microcopy.findUnique({
					where: { key: legacyData.key },
					select: { id: true }
				});
				if (existing) throw new Error('REFERRAL_ALREADY_LOCKED');
				await tx.microcopy.create({ data: legacyData });
			});
		}
	} catch (error) {
		if ((error as Error)?.message === 'REFERRAL_BUYER_ALREADY_PAID') {
			return { locked: false, alreadyLocked: false, reason: 'buyer_has_prior_paid_orders' };
		}
		if ((error as Error)?.message === 'REFERRAL_AFFILIATE_INACTIVE') {
			return { locked: false, alreadyLocked: false, reason: 'affiliate_inactive' };
		}
		if ((error as Error)?.message === 'REFERRAL_PROGRAM_CHANGED') {
			return { locked: false, alreadyLocked: false, reason: 'affiliate_program_changed' };
		}
		if (
			(error as Error)?.message === 'REFERRAL_ALREADY_LOCKED' ||
			(error as { code?: string })?.code === 'P2002'
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

	await recordAffiliateEvent({
		affiliateProgramId: attribution.affiliateProgramId,
		affiliateUserId: attribution.referrerUserId,
		referredUserId: attribution.referredUserId,
		type: 'referral_locked',
		source: attribution.source,
		dedupeKey: `affiliate:referral_locked:${attribution.referredUserId}`,
		metadata: { affiliateCode: attribution.affiliateCode }
	}).catch((error) => console.error('Failed to record affiliate referral event:', error));

	// Best-effort notification for referrer.
	await prisma.notification
		.create({
			data: {
				userId: attribution.referrerUserId,
				type: 'affiliate_referral_signup',
				title: 'New referral joined',
				message: 'A new user signed up through your affiliate code. Keep sharing to grow your Cash.'
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
	policySnapshot: Record<string, unknown> | null;
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
				policySnapshot: null,
				source: 'none',
				error: 'Self-referral is not allowed.'
			};
		}

		return {
			affiliateCode: locked.affiliateCode,
			affiliateUserId: locked.referrerUserId,
			affiliateProgramId: locked.affiliateProgramId,
			policySnapshot: locked.policySnapshot,
			source: 'locked'
		};
	}

	const manualCode = normalizeAffiliateCode(params.explicitAffiliateCode || null);
	if (!manualCode) {
		return {
			affiliateCode: null,
			affiliateUserId: null,
			affiliateProgramId: null,
			policySnapshot: null,
			source: 'none'
		};
	}

	const validation = await validateAffiliateCode(manualCode);
	if (!validation.valid || !validation.userId || !validation.affiliateProgramId) {
		return {
			affiliateCode: null,
			affiliateUserId: null,
			affiliateProgramId: null,
			policySnapshot: null,
			source: 'none',
			error: 'Affiliate code is invalid.'
		};
	}

	if (validation.userId === params.buyerUserId) {
		return {
			affiliateCode: null,
			affiliateUserId: null,
			affiliateProgramId: null,
			policySnapshot: null,
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
			policySnapshot: lockResult.attribution.policySnapshot,
			source: 'manual'
		};
	}

	if (lockResult.reason === 'buyer_has_prior_paid_orders') {
		return {
			affiliateCode: null,
			affiliateUserId: null,
			affiliateProgramId: null,
			policySnapshot: null,
			source: 'none',
			error: 'Affiliate codes can only be linked before a customer completes their first purchase.'
		};
	}

	return {
		affiliateCode: null,
		affiliateUserId: null,
		affiliateProgramId: null,
		policySnapshot: null,
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
	const itemRows = Array.isArray(params.orderItems) ? params.orderItems : [];
	const discount = calculateAffiliateBuyerDiscount({
		successfulAccountOrdersBefore: successfulOrdersBefore,
		orderItems: itemRows.map((item) => ({
			productName: item.productName,
			totalPrice: item.totalPrice,
			metadata: item.categoryMetadata ?? item.category?.metadata
		})),
		discountPercent: config.discountStage1Percent,
		discountCap: config.discountStage1Cap,
		discountedOrderLimit: config.buyerDiscountOrderLimit,
		excludedKeywords: config.excludedTierKeywords
	});
	const active = discount.discountAmount > 0;
	const expiresAfterOrder = active ? discount.remainingDiscountedOrders + 1 : 0;

	return {
		discountAmount: discount.discountAmount,
		orderIndex: discount.orderIndex,
		stage: active ? 'stage_1' : 'none',
		stageLabel: active ? 'First two orders' : 'Expired',
		remainingRewardedOrders: discount.remainingDiscountedOrders,
		expiresAfterOrder,
		maxRewardedOrders: discount.discountedOrderLimit,
		ruleMode: active ? 'percent_cap' : 'none'
	};
}

// Super affiliate: a referral ACTIVATES on EITHER threshold (whichever first),
// counting only paid, non-refunded orders. On activation the super affiliate
// earns a flat reward, once per referral.
export const SUPER_ACTIVATION_SPEND_THRESHOLD = 3500;
export const SUPER_ACTIVATION_ORDER_THRESHOLD = 3;
export const SUPER_ACTIVATION_REWARD = 700;

/** Live progress of one referral toward activation (reused by the dashboard). */
export async function getSuperReferralProgress(
	superUserId: string,
	referredUserId: string,
	config: AffiliateConfig | null = null
): Promise<{ orderCount: number; cumulativeSpend: number; activated: boolean }> {
	const policy = config || (await getAffiliateConfig());
	return getSuperReferralProgressForPolicy(superUserId, referredUserId, {
		enabled: policy.superAffiliateEnabled,
		spendThreshold: policy.superActivationSpendThreshold,
		orderThreshold: policy.superActivationOrderThreshold
	});
}

async function getSuperReferralProgressForPolicy(
	superUserId: string,
	referredUserId: string,
	policy: { enabled: boolean; spendThreshold: number; orderThreshold: number }
): Promise<{ orderCount: number; cumulativeSpend: number; activated: boolean }> {
	const paidOrders = await prisma.order.findMany({
		where: {
			AND: [
				buildRevenueOrderWhere(),
				{ userId: referredUserId, affiliateUserId: superUserId, orderType: 'account' }
			]
		},
		select: { totalAmount: true, refundedAmount: true }
	});
	return calculateSuperReferralProgress({
		orders: paidOrders,
		enabled: policy.enabled,
		spendThreshold: policy.spendThreshold,
		orderThreshold: policy.orderThreshold
	});
}

/**
 * Super-affiliate reward path (replaces the per-order reward). On each paid order
 * by a referral: if the referral is already activated, do nothing (value captured,
 * pings stop). Otherwise re-check the thresholds and, if newly crossed, credit the
 * flat reward exactly once (idempotent via the activation reference).
 */
function superMonthKey(date = new Date()): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getConfiguredSuperMonthlyTiers(config: AffiliateConfig): SuperMonthlyTier[] {
	return [
		{ count: config.superTier1Count, amount: config.superTier1Amount },
		{ count: config.superTier2Count, amount: config.superTier2Amount },
		{ count: config.superTier3Count, amount: config.superTier3Amount }
	];
}

function parseSnapshottedSuperMonthlyTiers(value: unknown): SuperMonthlyTier[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((tier) => {
			const row =
				tier && typeof tier === 'object' && !Array.isArray(tier)
					? (tier as Record<string, unknown>)
					: {};
			return {
				count: Math.max(0, Math.floor(Number(row.count || 0))),
				amount: Math.max(0, Number(row.amount || 0))
			};
		})
		.filter((tier) => tier.count > 0 && Number.isFinite(tier.amount));
}

export interface SuperReferralTerms {
	enabled: boolean | null;
	activationSpendThreshold: number;
	activationOrderThreshold: number;
	activationReward: number;
	monthlyTiers: SuperMonthlyTier[];
}

interface AffiliatePolicySnapshot {
	version: number;
	programId: string;
	programType: 'regular' | 'super';
	superTerms: SuperReferralTerms | null;
	snapshottedAt: string | null;
}

function parseSuperReferralTerms(value: unknown): SuperReferralTerms | null {
	const terms =
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const activationSpendThreshold = Number(terms.activationSpendThreshold || 0);
	const activationOrderThreshold = Math.floor(Number(terms.activationOrderThreshold || 0));
	const activationReward = Number(terms.activationReward);
	const monthlyTiers = parseSnapshottedSuperMonthlyTiers(terms.monthlyTiers);
	const enabled = typeof terms.enabled === 'boolean' ? terms.enabled : null;
	if (
		!Number.isFinite(activationSpendThreshold) ||
		activationSpendThreshold <= 0 ||
		!Number.isFinite(activationOrderThreshold) ||
		activationOrderThreshold <= 0 ||
		!Number.isFinite(activationReward) ||
		activationReward < 0 ||
		monthlyTiers.length !== 3 ||
		!(
			monthlyTiers[0].count < monthlyTiers[1].count && monthlyTiers[1].count < monthlyTiers[2].count
		) ||
		!(
			monthlyTiers[0].amount <= monthlyTiers[1].amount &&
			monthlyTiers[1].amount <= monthlyTiers[2].amount
		)
	) {
		return null;
	}
	return {
		enabled,
		activationSpendThreshold,
		activationOrderThreshold,
		activationReward,
		monthlyTiers
	};
}

function parseAffiliatePolicySnapshot(value: unknown): AffiliatePolicySnapshot | null {
	const policy =
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const version = Math.floor(Number(policy.version || 0));
	const programId = String(policy.programId || '').trim();
	const rawProgramType = String(policy.programType || '')
		.trim()
		.toLowerCase();
	const programType =
		rawProgramType === 'regular' || rawProgramType === 'super' ? rawProgramType : null;
	if (version < 1 || !programId || !programType) return null;

	const superTerms = programType === 'super' ? parseSuperReferralTerms(policy.superTerms) : null;
	if (programType === 'super' && !superTerms) return null;

	const snapshottedAt = String(policy.snapshottedAt || '').trim() || null;
	return { version, programId, programType, superTerms, snapshottedAt };
}

function serializeSuperReferralTerms(terms: SuperReferralTerms): Record<string, unknown> {
	return {
		enabled: terms.enabled ?? false,
		activationSpendThreshold: terms.activationSpendThreshold,
		activationOrderThreshold: terms.activationOrderThreshold,
		activationReward: terms.activationReward,
		monthlyTiers: terms.monthlyTiers.map((tier) => ({ count: tier.count, amount: tier.amount }))
	};
}

function applySuperReferralTerms(
	fallbackConfig: AffiliateConfig,
	terms: SuperReferralTerms
): AffiliateConfig {
	return {
		...fallbackConfig,
		superAffiliateEnabled: terms.enabled ?? fallbackConfig.superAffiliateEnabled,
		superActivationSpendThreshold: terms.activationSpendThreshold,
		superActivationOrderThreshold: terms.activationOrderThreshold,
		superActivationReward: terms.activationReward,
		superTier1Count: terms.monthlyTiers[0]?.count ?? fallbackConfig.superTier1Count,
		superTier1Amount: terms.monthlyTiers[0]?.amount ?? fallbackConfig.superTier1Amount,
		superTier2Count: terms.monthlyTiers[1]?.count ?? fallbackConfig.superTier2Count,
		superTier2Amount: terms.monthlyTiers[1]?.amount ?? fallbackConfig.superTier2Amount,
		superTier3Count: terms.monthlyTiers[2]?.count ?? fallbackConfig.superTier3Count,
		superTier3Amount: terms.monthlyTiers[2]?.amount ?? fallbackConfig.superTier3Amount
	};
}

function buildCurrentAffiliatePolicySnapshot(params: {
	programId: string;
	isSuperAffiliate: boolean;
	config: AffiliateConfig;
	snapshottedAt?: string;
}): Record<string, unknown> {
	const snapshottedAt = params.snapshottedAt || new Date().toISOString();
	return {
		version: 1,
		programId: params.programId,
		programType: params.isSuperAffiliate ? 'super' : 'regular',
		...(params.isSuperAffiliate
			? {
					superTerms: {
						enabled: params.config.superAffiliateEnabled,
						activationSpendThreshold: params.config.superActivationSpendThreshold,
						activationOrderThreshold: params.config.superActivationOrderThreshold,
						activationReward: params.config.superActivationReward,
						monthlyTiers: getConfiguredSuperMonthlyTiers(params.config)
					}
				}
			: {}),
		snapshottedAt
	};
}

/**
 * Produces the immutable policy copied onto an order. A durable first-touch
 * snapshot wins over the affiliate's current type/settings. Legacy referrals
 * without one freeze the live policy at checkout and remain auditable as such.
 */
export function resolveAffiliatePolicyForOrder(params: {
	storedPolicySnapshot?: unknown;
	programId: string;
	liveIsSuperAffiliate: boolean;
	liveConfig: AffiliateConfig;
	orderSnapshottedAt?: string;
}): Record<string, unknown> {
	const stored = parseAffiliatePolicySnapshot(params.storedPolicySnapshot);
	const accepted = stored?.programId === params.programId ? stored : null;
	const relationship =
		accepted ||
		parseAffiliatePolicySnapshot(
			buildCurrentAffiliatePolicySnapshot({
				programId: params.programId,
				isSuperAffiliate: params.liveIsSuperAffiliate,
				config: params.liveConfig,
				snapshottedAt: params.orderSnapshottedAt
			})
		);
	if (!relationship) throw new Error('AFFILIATE_POLICY_SNAPSHOT_INVALID');

	return {
		version: 3,
		programId: relationship.programId,
		programType: relationship.programType,
		...(relationship.superTerms
			? { superTerms: serializeSuperReferralTerms(relationship.superTerms) }
			: {}),
		relationshipSnapshottedAt: relationship.snapshottedAt,
		orderSnapshottedAt: params.orderSnapshottedAt || new Date().toISOString(),
		source: accepted ? 'referral_contract' : 'legacy_checkout_fallback'
	};
}

export interface ResolvedAffiliateRelationshipPolicy {
	programType: 'regular' | 'super';
	superTerms: SuperReferralTerms | null;
	termsFrozen: boolean;
	source: 'referral_contract' | 'order_contract' | 'current_fallback';
}

/** Resolve dashboard/progress policy without ever substituting newer terms for a
 * valid older contract. The current policy is used only for legacy relationships
 * that have no durable referral or trustworthy order snapshot yet. */
export function resolveAffiliateRelationshipPolicy(params: {
	referralPolicySnapshot?: unknown;
	orderPolicySnapshots?: readonly unknown[];
	programId: string;
	liveIsSuperAffiliate: boolean;
	liveConfig: AffiliateConfig;
}): ResolvedAffiliateRelationshipPolicy {
	const referralPolicy = parseAffiliatePolicySnapshot(params.referralPolicySnapshot);
	if (referralPolicy?.programId === params.programId) {
		return {
			programType: referralPolicy.programType,
			superTerms: referralPolicy.superTerms,
			termsFrozen: true,
			source: 'referral_contract'
		};
	}

	for (const value of params.orderPolicySnapshots || []) {
		const orderPolicy = parseAffiliatePolicySnapshot(value);
		if (orderPolicy?.programId !== params.programId) continue;
		return {
			programType: orderPolicy.programType,
			superTerms: orderPolicy.superTerms,
			termsFrozen: true,
			source: 'order_contract'
		};
	}

	const current = parseAffiliatePolicySnapshot(
		buildCurrentAffiliatePolicySnapshot({
			programId: params.programId,
			isSuperAffiliate: params.liveIsSuperAffiliate,
			config: params.liveConfig
		})
	);
	if (!current) throw new Error('AFFILIATE_POLICY_SNAPSHOT_INVALID');
	return {
		programType: current.programType,
		superTerms: current.superTerms,
		termsFrozen: false,
		source: 'current_fallback'
	};
}

/**
 * The first settled Super order fixes this affiliate/buyer relationship's
 * qualification contract. Admin changes remain useful for future relationships,
 * but cannot silently move the goalposts on one already in progress.
 */
async function getSuperReferralContractConfig(
	superUserId: string,
	referredUserId: string,
	fallbackConfig: AffiliateConfig
): Promise<AffiliateConfig> {
	const settledOrders = await prisma.order.findMany({
		where: {
			AND: [
				buildSettledOrderWhere(),
				{ userId: referredUserId, affiliateUserId: superUserId, orderType: 'account' }
			]
		},
		select: { analyticsMetadata: true },
		orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
	});
	for (const order of settledOrders) {
		const metadata =
			order.analyticsMetadata &&
			typeof order.analyticsMetadata === 'object' &&
			!Array.isArray(order.analyticsMetadata)
				? (order.analyticsMetadata as Record<string, unknown>)
				: {};
		const policy =
			metadata.affiliatePolicy &&
			typeof metadata.affiliatePolicy === 'object' &&
			!Array.isArray(metadata.affiliatePolicy)
				? (metadata.affiliatePolicy as Record<string, unknown>)
				: {};
		if (Number(policy.version || 0) < 2 || String(policy.programType || '') !== 'super') continue;
		const terms = parseSuperReferralTerms(policy.superTerms);
		if (!terms) continue;
		return applySuperReferralTerms(fallbackConfig, terms);
	}
	return fallbackConfig;
}

function getUtcMonthWindow(date: Date): { start: Date; end: Date; key: string } {
	const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
	const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
	return { start, end, key: superMonthKey(start) };
}

/**
 * The first Super activation in a UTC month fixes that month's tier contract. Admin
 * setting changes therefore apply to a later month, not retroactively to activations
 * already earned under a standing agreement.
 */
async function getSuperMonthlyPolicy(
	superUserId: string,
	monthDate: Date,
	fallbackConfig: AffiliateConfig
): Promise<SuperMonthlyTier[]> {
	const { start, end } = getUtcMonthWindow(monthDate);
	const firstActivation = await prisma.walletTransaction.findFirst({
		where: {
			userId: superUserId,
			reference: { startsWith: `super:activation:${superUserId}:` },
			createdAt: { gte: start, lt: end }
		},
		orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
		select: { metadata: true }
	});
	const metadata =
		firstActivation?.metadata &&
		typeof firstActivation.metadata === 'object' &&
		!Array.isArray(firstActivation.metadata)
			? (firstActivation.metadata as Record<string, unknown>)
			: {};
	const snapshotted = parseSnapshottedSuperMonthlyTiers(metadata.monthlyTiers);
	return snapshotted.length > 0 ? snapshotted : getConfiguredSuperMonthlyTiers(fallbackConfig);
}

/** Record only the increase to the highest monthly bonus total (maximum = tier 3). */
async function recordSuperMonthlyTierCrossing(
	superUserId: string,
	config: AffiliateConfig,
	monthDate: Date = new Date()
): Promise<void> {
	const { start: startOfMonth, end: endOfMonth, key: monthKey } = getUtcMonthWindow(monthDate);
	const monthlyTiers = await getSuperMonthlyPolicy(superUserId, monthDate, config);
	const count = await prisma.walletTransaction.count({
		where: {
			userId: superUserId,
			reference: { startsWith: `super:activation:${superUserId}:` },
			status: { notIn: [AFFILIATE_LEDGER_STATUS.reversed, 'failed', 'cancelled'] },
			NOT: { metadata: { path: ['suspectedSelfReferral'], equals: true } },
			createdAt: { gte: startOfMonth, lt: endOfMonth }
		}
	});
	const tier = getHighestSuperMonthlyTier(monthlyTiers, count);
	if (!tier || tier.amount <= 0) return;
	const vestsAt = computeVestsAt(await getRewardVestingDays());

	try {
		await prisma.$transaction(async (tx) => {
			const wallet = await tx.wallet.upsert({
				where: { userId: superUserId },
				update: {},
				create: { userId: superUserId, balance: 0, currency: 'NGN' }
			});
			// Tier crossings and refund reconciliation serialize on the same wallet row.
			// This prevents concurrent activation jobs from awarding the same increase twice.
			await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id}::uuid FOR UPDATE`;
			const creditRows = await tx.walletTransaction.findMany({
				where: {
					userId: superUserId,
					type: AFFILIATE_LEDGER_CREDIT_TYPE,
					reference: { startsWith: `super:monthly_bonus:${superUserId}:${monthKey}:` },
					status: { in: [AFFILIATE_LEDGER_STATUS.pending, AFFILIATE_LEDGER_STATUS.available] }
				},
				select: { id: true, amount: true, reference: true }
			});
			const adjustmentRows = await tx.walletTransaction.findMany({
				where: {
					userId: superUserId,
					type: SC_AFFILIATE_ADJUSTMENT,
					status: AFFILIATE_LEDGER_STATUS.available,
					metadata: { path: ['superMonthKey'], equals: monthKey }
				},
				select: { amount: true }
			});
			const credited = creditRows.reduce(
				(sum, row) => sum + Math.max(0, Number(row.amount || 0)),
				0
			);
			const adjusted = adjustmentRows.reduce(
				(sum, row) => sum + Math.max(0, Number(row.amount || 0)),
				0
			);
			const incrementalAmount = calculateSuperMonthlyBonusIncrement(
				tier.amount,
				Math.max(0, credited - adjusted)
			);
			if (incrementalAmount <= 0) return;

			const baseReference = `super:monthly_bonus:${superUserId}:${monthKey}:${tier.count}`;
			const [baseAlreadyUsed, historicalAwardCount] = await Promise.all([
				tx.walletTransaction.findUnique({
					where: { reference: baseReference },
					select: { id: true }
				}),
				tx.walletTransaction.count({
					where: {
						userId: superUserId,
						type: AFFILIATE_LEDGER_CREDIT_TYPE,
						reference: { startsWith: `super:monthly_bonus:${superUserId}:${monthKey}:` }
					}
				})
			]);
			const reference = baseAlreadyUsed
				? `${baseReference}:award:${historicalAwardCount + 1}`
				: baseReference;
			const liveWallet = await tx.wallet.findUnique({
				where: { id: wallet.id },
				select: { balance: true }
			});
			const balanceBefore = Number(liveWallet?.balance || 0);
			await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId: superUserId,
					type: AFFILIATE_LEDGER_CREDIT_TYPE,
					amount: incrementalAmount,
					balanceBefore,
					balanceAfter: balanceBefore,
					description: `Super affiliate monthly bonus — ${monthKey}`,
					reference,
					status: AFFILIATE_LEDGER_STATUS.pending,
					metadata: {
						kind: 'super_monthly_bonus',
						superUserId,
						monthKey,
						monthlyTiers: monthlyTiers.map((monthlyTier) => ({
							count: monthlyTier.count,
							amount: monthlyTier.amount
						})),
						tierCount: tier.count,
						tierTotalAmount: tier.amount,
						activationCountAtAward: count,
						vestsAt: vestsAt.toISOString(),
						lifecycleStatus: AFFILIATE_LEDGER_STATUS.pending
					}
				}
			});
			await recordAffiliateEvent(
				{
					type: 'super_monthly_bonus_pending',
					dedupeKey: reference,
					affiliateUserId: superUserId,
					source: 'super_monthly_tier',
					metadata: {
						amount: incrementalAmount,
						monthKey,
						tierCount: tier.count,
						tierTotalAmount: tier.amount,
						activationCount: count
					}
				},
				tx
			);
			await tx.notification.create({
				data: {
					userId: superUserId,
					type: 'affiliate_store_credit',
					title: 'Monthly bonus unlocked 🚀',
					message: `You reached ${tier.count} activations this month — your monthly bonus total is now ₦${tier.amount.toLocaleString()}.`
				}
			});
		});
	} catch (error) {
		if ((error as { code?: string })?.code !== 'P2002') throw error;
	}
}

/** Repair/re-evaluate the monthly tier obligation for one already-created activation.
 * Safe to call after an identity review or settlement retry: wallet locking and the
 * existing net-credit calculation make repeated calls idempotent. */
export async function reconcileSuperMonthlyTierForActivation(
	superUserId: string,
	activationCreatedAt: Date
): Promise<void> {
	const config = await getAffiliateConfig();
	await recordSuperMonthlyTierCrossing(superUserId, config, activationCreatedAt);
}

export async function reconcileSuperMonthlyBonusAfterActivationReversal(
	superUserId: string,
	activationCreatedAt: Date,
	activationTransactionId: string,
	monthlyTiers: readonly SuperMonthlyTier[]
): Promise<void> {
	const monthStart = new Date(
		Date.UTC(activationCreatedAt.getUTCFullYear(), activationCreatedAt.getUTCMonth(), 1)
	);
	const monthEnd = new Date(
		Date.UTC(activationCreatedAt.getUTCFullYear(), activationCreatedAt.getUTCMonth() + 1, 1)
	);
	const monthKey = superMonthKey(monthStart);
	const validActivationCount = await prisma.walletTransaction.count({
		where: {
			userId: superUserId,
			reference: { startsWith: `super:activation:${superUserId}:` },
			status: { notIn: [AFFILIATE_LEDGER_STATUS.reversed, 'failed', 'cancelled'] },
			NOT: { metadata: { path: ['suspectedSelfReferral'], equals: true } },
			createdAt: { gte: monthStart, lt: monthEnd }
		}
	});
	const validTier = getHighestSuperMonthlyTier(monthlyTiers, validActivationCount);
	const validTierCount = validTier?.count || 0;
	const targetBonusTotal = validTier?.amount || 0;

	await prisma.$transaction(async (tx) => {
		const wallet = await tx.wallet.findUnique({
			where: { userId: superUserId },
			select: { id: true, balance: true }
		});
		if (!wallet) return;
		await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id}::uuid FOR UPDATE`;
		const bonusRows = await tx.walletTransaction.findMany({
			where: {
				userId: superUserId,
				type: AFFILIATE_LEDGER_CREDIT_TYPE,
				reference: { startsWith: `super:monthly_bonus:${superUserId}:${monthKey}:` },
				status: { in: [AFFILIATE_LEDGER_STATUS.pending, AFFILIATE_LEDGER_STATUS.available] }
			},
			select: { id: true, amount: true, status: true, metadata: true, createdAt: true }
		});
		const adjustmentRows = await tx.walletTransaction.findMany({
			where: {
				userId: superUserId,
				type: SC_AFFILIATE_ADJUSTMENT,
				status: AFFILIATE_LEDGER_STATUS.available,
				metadata: { path: ['superMonthKey'], equals: monthKey }
			},
			select: { amount: true }
		});
		const totalCredits = bonusRows.reduce(
			(sum, row) => sum + Math.max(0, Number(row.amount || 0)),
			0
		);
		const totalAdjustments = adjustmentRows.reduce(
			(sum, row) => sum + Math.max(0, Number(row.amount || 0)),
			0
		);
		let remainingReduction = Math.max(0, totalCredits - totalAdjustments - targetBonusTotal);
		if (remainingReduction <= 0) return;
		const totalReduction = remainingReduction;

		const pendingRows = bonusRows
			.filter((row) => row.status === AFFILIATE_LEDGER_STATUS.pending)
			.sort((a, b) => {
				const tierA = Number((a.metadata as Record<string, unknown> | null)?.tierCount || 0);
				const tierB = Number((b.metadata as Record<string, unknown> | null)?.tierCount || 0);
				return tierB - tierA || b.createdAt.getTime() - a.createdAt.getTime();
			});
		for (const row of pendingRows) {
			if (remainingReduction <= 0) break;
			const rowAmount = Math.max(0, Number(row.amount || 0));
			if (rowAmount <= remainingReduction) {
				await tx.walletTransaction.update({
					where: { id: row.id },
					data: { status: AFFILIATE_LEDGER_STATUS.reversed }
				});
				remainingReduction -= rowAmount;
				continue;
			}

			const metadata =
				row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
					? (row.metadata as Record<string, unknown>)
					: {};
			await tx.walletTransaction.update({
				where: { id: row.id },
				data: {
					amount: rowAmount - remainingReduction,
					metadata: {
						...metadata,
						tierCount: validTierCount,
						tierTotalAmount: targetBonusTotal,
						adjustedAfterActivationRefundAt: new Date().toISOString()
					}
				}
			});
			remainingReduction = 0;
		}

		if (remainingReduction > 0) {
			const liveWallet = await tx.wallet.findUnique({
				where: { id: wallet.id },
				select: { balance: true }
			});
			const balanceBefore = Number(liveWallet?.balance || 0);
			const recoveredNow = Math.min(remainingReduction, Math.max(0, balanceBefore));
			const balanceAfter = balanceBefore - recoveredNow;
			if (recoveredNow > 0) {
				await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
			}
			await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId: superUserId,
					type: SC_AFFILIATE_ADJUSTMENT,
					amount: remainingReduction,
					balanceBefore,
					balanceAfter,
					description: `Super affiliate monthly bonus adjusted — ${monthKey}`,
					reference: `super:monthly_bonus_adjustment:${superUserId}:${monthKey}:${activationTransactionId}`,
					status: AFFILIATE_LEDGER_STATUS.available,
					metadata: {
						kind: 'super_monthly_bonus_adjustment',
						superMonthKey: monthKey,
						activationTransactionId,
						validActivationCount,
						validTierTotal: targetBonusTotal,
						recoveredAdjustmentAmount: recoveredNow,
						unrecoveredAdjustmentAmount: remainingReduction - recoveredNow
					}
				}
			});
		}

		await recordAffiliateEvent(
			{
				type: 'super_monthly_bonus_reversed',
				dedupeKey: `affiliate:super_monthly_adjustment:${activationTransactionId}`,
				affiliateUserId: superUserId,
				source: 'refund',
				metadata: {
					activationTransactionId,
					amount: totalReduction,
					monthKey,
					validActivationCount,
					validTierTotal: targetBonusTotal
				}
			},
			tx
		);
		await tx.notification.create({
			data: {
				userId: superUserId,
				type: 'affiliate_store_credit',
				title: 'Monthly bonus adjusted',
				message: `A refunded referral changed your ${monthKey} activation total. ₦${totalReduction.toLocaleString()} in unqualified monthly bonus was reversed.`
			}
		});
	});
}

async function recordSuperAffiliateActivation(params: {
	superUserId: string;
	referredUserId: string;
	affiliateCode: string;
	triggerOrderId: string;
}): Promise<{ success: boolean; storeCreditAwarded?: number; error?: string }> {
	const { superUserId, referredUserId, affiliateCode, triggerOrderId } = params;
	const liveConfig = await getAffiliateConfig();
	const config = await getSuperReferralContractConfig(superUserId, referredUserId, liveConfig);
	if (!config.superAffiliateEnabled || config.superActivationReward <= 0) {
		return { success: true, storeCreditAwarded: 0 };
	}
	const activationReference = `super:activation:${superUserId}:${referredUserId}`;

	const existing = await prisma.walletTransaction.findUnique({
		where: { reference: activationReference },
		select: { id: true, createdAt: true }
	});
	if (existing) {
		// A prior attempt may have committed the activation and then failed before
		// recording the monthly tier increment. Settlement retries must repair that
		// second, independently idempotent obligation instead of returning early.
		await recordSuperMonthlyTierCrossing(superUserId, config, existing.createdAt);
		return { success: true, storeCreditAwarded: 0 };
	}

	const { orderCount, cumulativeSpend, activated } = await getSuperReferralProgress(
		superUserId,
		referredUserId,
		config
	);
	if (!activated) {
		return { success: true, storeCreditAwarded: 0 };
	}

	const referredUser = await prisma.user
		.findUnique({ where: { id: referredUserId }, select: { fullName: true } })
		.catch(() => null);
	const referralName = formatAffiliateDisplayName(referredUser?.fullName);
	const superVestsAt = computeVestsAt(await getRewardVestingDays());
	const identityRiskSignals = await detectAffiliateIdentityRiskSignals(superUserId, referredUserId);
	const suspectedSelfReferral = identityRiskSignals.length > 0;
	if (suspectedSelfReferral) {
		console.warn(
			`[affiliate] super activation held for identity review on order ${triggerOrderId}: ${identityRiskSignals.join(', ')}`
		);
	}

	try {
		const activationCreatedAt = await prisma.$transaction(async (tx) => {
			const wallet = await tx.wallet.upsert({
				where: { userId: superUserId },
				update: {},
				create: { userId: superUserId, balance: 0, currency: 'NGN' }
			});
			const balanceBefore = Number(wallet.balance || 0);
			// Vesting: pending, not added to the balance until it vests (same as regular).
			const createdActivation = await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId: superUserId,
					type: 'affiliate_credit',
					amount: config.superActivationReward,
					balanceBefore,
					balanceAfter: balanceBefore,
					description: 'Super affiliate — referral activated',
					reference: activationReference,
					status: AFFILIATE_LEDGER_STATUS.pending,
					metadata: {
						kind: 'super_activation',
						referredUserId,
						affiliateCode,
						activatedByOrderId: triggerOrderId,
						cumulativeSpend,
						orderCount,
						activationSpendThreshold: config.superActivationSpendThreshold,
						activationOrderThreshold: config.superActivationOrderThreshold,
						activationReward: config.superActivationReward,
						monthlyTiers: [
							{ count: config.superTier1Count, amount: config.superTier1Amount },
							{ count: config.superTier2Count, amount: config.superTier2Amount },
							{ count: config.superTier3Count, amount: config.superTier3Amount }
						],
						policyVersion: 2,
						vestsAt: superVestsAt.toISOString(),
						lifecycleStatus: AFFILIATE_LEDGER_STATUS.pending,
						...(suspectedSelfReferral ? { suspectedSelfReferral: true, identityRiskSignals } : {})
					}
				},
				select: { createdAt: true }
			});
			await recordAffiliateEvent(
				{
					type: 'super_referral_activated',
					dedupeKey: activationReference,
					affiliateUserId: superUserId,
					referredUserId,
					orderId: triggerOrderId,
					source: 'order_settlement',
					metadata: {
						amount: config.superActivationReward,
						cumulativeSpend,
						orderCount,
						affiliateCode
					}
				},
				tx
			);
			await tx.notification.create({
				data: {
					userId: superUserId,
					type: 'affiliate_store_credit',
					title: 'Referral qualified 🎉',
					message: `${referralName} qualified — ₦${config.superActivationReward.toLocaleString()} earned. It clears for spending and withdrawal after the return window.`
				}
			});
			return createdActivation.createdAt;
		});

		// Monthly tiers are credited as non-additive totals: 3k, then +5k, then +7k.
		// Let a failure surface so a settlement/integrity retry repairs the second,
		// independently idempotent obligation against the activation's actual month.
		await recordSuperMonthlyTierCrossing(superUserId, config, activationCreatedAt);
	} catch (error) {
		// Unique-reference collision = a concurrent order already activated this
		// referral. Re-read it and repair its monthly obligation rather than silently
		// dropping that second half of settlement.
		if ((error as { code?: string })?.code === 'P2002') {
			const concurrentActivation = await prisma.walletTransaction.findUnique({
				where: { reference: activationReference },
				select: { createdAt: true }
			});
			if (concurrentActivation) {
				await recordSuperMonthlyTierCrossing(superUserId, config, concurrentActivation.createdAt);
			}
			return { success: true, storeCreditAwarded: 0 };
		}
		throw error;
	}

	return { success: true, storeCreditAwarded: config.superActivationReward };
}

/**
 * If a refunded order removes a referral's qualification, void the one-time ₦700
 * super-affiliate activation reward — but only while it's still available (not
 * requested/paid out). Called from the refund flow. Idempotent + best-effort.
 */
export async function maybeVoidSuperActivationOnRefund(order: {
	userId: string | null;
	affiliateUserId: string | null;
}): Promise<void> {
	const superUserId = order.affiliateUserId;
	const referredUserId = order.userId;
	if (!superUserId || !referredUserId) return;

	const activationReference = `super:activation:${superUserId}:${referredUserId}`;
	const activation = await prisma.walletTransaction.findUnique({
		where: { reference: activationReference },
		select: { id: true, amount: true, status: true, createdAt: true, metadata: true }
	});
	if (
		!activation ||
		(activation.status !== AFFILIATE_LEDGER_STATUS.pending &&
			activation.status !== AFFILIATE_LEDGER_STATUS.available)
	)
		return;

	// getSuperReferralProgress already excludes the now-refunded order.
	const config = await getAffiliateConfig();
	const activationMetadata =
		activation.metadata &&
		typeof activation.metadata === 'object' &&
		!Array.isArray(activation.metadata)
			? (activation.metadata as Record<string, unknown>)
			: {};
	const activationSpendThreshold = Math.max(
		1,
		Number(activationMetadata.activationSpendThreshold || config.superActivationSpendThreshold)
	);
	const activationOrderThreshold = Math.max(
		1,
		Number(activationMetadata.activationOrderThreshold || config.superActivationOrderThreshold)
	);
	const snapshottedMonthlyTiers = Array.isArray(activationMetadata.monthlyTiers)
		? activationMetadata.monthlyTiers
				.map((tier) => {
					const row =
						tier && typeof tier === 'object' && !Array.isArray(tier)
							? (tier as Record<string, unknown>)
							: {};
					return { count: Number(row.count || 0), amount: Number(row.amount || 0) };
				})
				.filter((tier) => tier.count > 0 && tier.amount >= 0)
		: [];
	const monthlyTiers =
		snapshottedMonthlyTiers.length > 0
			? snapshottedMonthlyTiers
			: [
					{ count: config.superTier1Count, amount: config.superTier1Amount },
					{ count: config.superTier2Count, amount: config.superTier2Amount },
					{ count: config.superTier3Count, amount: config.superTier3Amount }
				];
	const { activated } = await getSuperReferralProgressForPolicy(superUserId, referredUserId, {
		enabled: true,
		spendThreshold: activationSpendThreshold,
		orderThreshold: activationOrderThreshold
	});
	if (activated) return; // still qualifies via other orders — keep the reward

	const amount = Math.max(0, Number(activation.amount || 0));
	let reversed = false;
	await prisma.$transaction(async (tx) => {
		if (activation.status === AFFILIATE_LEDGER_STATUS.pending) {
			const changed = await tx.walletTransaction.updateMany({
				where: { id: activation.id, status: AFFILIATE_LEDGER_STATUS.pending },
				data: { status: AFFILIATE_LEDGER_STATUS.reversed }
			});
			if (changed.count > 0) {
				reversed = true;
				await recordAffiliateEvent(
					{
						type: 'super_referral_activation_reversed',
						dedupeKey: `affiliate:reward_reversed:${activation.id}`,
						affiliateUserId: superUserId,
						referredUserId,
						source: 'refund',
						metadata: { rewardTransactionId: activation.id, amount }
					},
					tx
				);
				await tx.notification.create({
					data: {
						userId: superUserId,
						type: 'affiliate_store_credit',
						title: 'Activation reversed',
						message: `A referral no longer qualifies after a refund — the pending ₦${amount.toLocaleString()} reward was cancelled.`
					}
				});
			}
			return;
		}
		const wallet = await tx.wallet.findUnique({
			where: { userId: superUserId },
			select: { id: true }
		});
		if (!wallet) return;
		await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${superUserId}::uuid FOR UPDATE`;
		const liveActivation = await tx.walletTransaction.findUnique({
			where: { id: activation.id },
			select: { status: true, amount: true }
		});
		if (liveActivation?.status !== AFFILIATE_LEDGER_STATUS.available) return;

		await tx.walletTransaction.update({
			where: { id: activation.id },
			data: { status: AFFILIATE_LEDGER_STATUS.reversed }
		});
		reversed = true;
		await recordAffiliateEvent(
			{
				type: 'super_referral_activation_reversed',
				dedupeKey: `affiliate:reward_reversed:${activation.id}`,
				affiliateUserId: superUserId,
				referredUserId,
				source: 'refund',
				metadata: { rewardTransactionId: activation.id, amount }
			},
			tx
		);
		const liveWallet = await tx.wallet.findUnique({
			where: { id: wallet.id },
			select: { balance: true }
		});
		if (!liveWallet) return;
		await tx.wallet.update({
			where: { id: wallet.id },
			data: {
				balance: Math.max(0, Number(liveWallet.balance || 0) - Number(liveActivation.amount || 0))
			}
		});
		await tx.notification.create({
			data: {
				userId: superUserId,
				type: 'affiliate_store_credit',
				title: 'Activation reversed',
				message: `A referral no longer qualifies after a refund — ₦${amount.toLocaleString()} was reversed.`
			}
		});
	});
	if (reversed) {
		await reconcileSuperMonthlyBonusAfterActivationReversal(
			superUserId,
			activation.createdAt,
			activation.id,
			monthlyTiers
		);
	}
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
				orderType: true,
				subtotal: true,
				discountAmount: true,
				storeCreditApplied: true,
				totalAmount: true,
				status: true,
				paymentStatus: true,
				deliveryStatus: true,
				refundedAmount: true,
				analyticsMetadata: true,
				orderItems: {
					select: {
						id: true,
						quantity: true,
						totalPrice: true,
						refundedAmount: true,
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

		// Checkout already restricts affiliate attribution to account purchases. Keep
		// the money-creation layer independently strict so no future caller, legacy row,
		// or manual database correction can reward Numbers or boosting orders.
		if (!isAffiliateEligibleOrderType(order.orderType)) {
			return { success: true, storeCreditAwarded: 0 };
		}

		if (order.userId === order.affiliateUserId) {
			return { success: true, storeCreditAwarded: 0 };
		}

		if (!isRevenueOrder(order)) {
			return { success: true, storeCreditAwarded: 0 };
		}

		await recordAffiliateEvent({
			type: 'referred_order_retained',
			dedupeKey: `affiliate:referred_order_retained:${order.id}`,
			affiliateUserId: order.affiliateUserId,
			referredUserId: order.userId,
			orderId: order.id,
			source: 'order_settlement',
			metadata: {
				orderType: order.orderType,
				netRetainedValue: toNetSales(order.totalAmount, order.refundedAmount),
				buyerDiscountAmount: Math.max(0, Number(order.discountAmount || 0))
			}
		});

		// Super affiliates use a flat per-ACTIVATION reward instead of the per-order
		// reward below — flag-gated so the regular path is completely untouched.
		const affiliateProgram = await prisma.affiliateProgram.findFirst({
			where: {
				userId: order.affiliateUserId,
				affiliateCode: order.affiliateCode
			},
			select: { id: true, isSuperAffiliate: true }
		});
		const analyticsMetadata =
			order.analyticsMetadata &&
			typeof order.analyticsMetadata === 'object' &&
			!Array.isArray(order.analyticsMetadata)
				? (order.analyticsMetadata as Record<string, unknown>)
				: {};
		const affiliatePolicy =
			analyticsMetadata.affiliatePolicy &&
			typeof analyticsMetadata.affiliatePolicy === 'object' &&
			!Array.isArray(analyticsMetadata.affiliatePolicy)
				? (analyticsMetadata.affiliatePolicy as Record<string, unknown>)
				: {};
		const snapshottedProgramType =
			Number(affiliatePolicy.version || 0) >= 1 &&
			String(affiliatePolicy.programId || '') === String(affiliateProgram?.id || '')
				? String(affiliatePolicy.programType || '').toLowerCase()
				: '';
		const isSuperOrder = snapshottedProgramType
			? snapshottedProgramType === 'super'
			: Boolean(affiliateProgram?.isSuperAffiliate);
		if (isSuperOrder) {
			return await recordSuperAffiliateActivation({
				superUserId: order.affiliateUserId,
				referredUserId: order.userId,
				affiliateCode: order.affiliateCode,
				triggerOrderId: order.id
			});
		}

		const reference = `affiliate:credit:order:${order.id}`;
		const existingCredit = await prisma.walletTransaction.findUnique({
			where: { reference },
			select: { id: true }
		});
		if (existingCredit) {
			return { success: true, storeCreditAwarded: 0 };
		}

		// A regular commission belongs to the same two orders that received the
		// referral buyer benefit. This also keeps a stale/legacy attribution from
		// creating rewards after the buyer's offer has ended. The idempotency check
		// deliberately comes first so a settled retry remains settled even if a later
		// repair changes the order's discount fields.
		if (Number(order.discountAmount || 0) <= 0) {
			return { success: true, storeCreditAwarded: 0 };
		}

		const [config, successfulOrderCountForPair] = await Promise.all([
			getAffiliateConfig(),
			countSuccessfulOrdersForAffiliatePair(order.userId, order.affiliateUserId)
		]);

		// successfulOrderCountForPair already includes this discounted order: the guard above
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

		// Commission is earned only on money paid outside Store Credit. Refund,
		// earned, or gifted credit can therefore never be recycled into new cashable
		// affiliate earnings.
		const commissionablePaidAmount = Math.max(
			0,
			Number(order.totalAmount || 0) - Number(order.storeCreditApplied || 0)
		);
		const reward = calculateRegularAffiliateReward({
			subtotal: order.subtotal,
			totalAmount: commissionablePaidAmount,
			orderRefundedAmount: order.refundedAmount,
			orderItems: order.orderItems.map((item) => ({
				id: item.id,
				productName: item.productName,
				totalPrice: item.totalPrice,
				refundedAmount: item.refundedAmount,
				metadata: item.category.metadata
			})),
			rewardPercent: config.storeCreditFallbackPercent,
			rewardCap: config.storeCreditMax,
			excludedKeywords: config.excludedTierKeywords
		});
		if (reward.amount <= 0) {
			return { success: true, storeCreditAwarded: 0 };
		}

		const creditAmount = reward.amount;
		const rewardVestsAt = computeVestsAt(await getRewardVestingDays());
		const identityRiskSignals = await detectAffiliateIdentityRiskSignals(
			order.affiliateUserId as string,
			order.userId as string
		);
		const suspectedSelfReferral = identityRiskSignals.length > 0;
		if (suspectedSelfReferral) {
			console.warn(
				`[affiliate] reward held for identity review on order ${order.id}: ${identityRiskSignals.join(', ')}`
			);
		}

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

			// Vesting: record as PENDING and do NOT add to the spendable balance yet. A
			// vesting job flips it to available after the refund window; a refund inside
			// the window voids it (see affiliate-vesting.ts).
			await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId: order.affiliateUserId as string,
					type: 'affiliate_credit',
					amount: creditAmount,
					balanceBefore,
					balanceAfter: balanceBefore,
					description: `Affiliate Cash from referred order ${order.orderNumber}`,
					reference,
					status: AFFILIATE_LEDGER_STATUS.pending,
					metadata: {
						orderId: order.id,
						buyerUserId: order.userId,
						affiliateCode: order.affiliateCode,
						awardedFrom: 'referral_order',
						originalAwardAmount: creditAmount,
						commissionBaseAmount: reward.commissionBaseAmount,
						rewardPercent: reward.rewardPercent,
						rewardCap: reward.rewardCap,
						eligibleOrderItemIds: reward.eligibleOrderItemIds,
						policyVersion: 3,
						storeCreditApplied: Number(order.storeCreditApplied || 0),
						orderRefundedAmount: Number(order.refundedAmount || 0),
						vestsAt: rewardVestsAt.toISOString(),
						lifecycleStatus: AFFILIATE_LEDGER_STATUS.pending,
						...(suspectedSelfReferral ? { suspectedSelfReferral: true, identityRiskSignals } : {})
					}
				}
			});

			await recordAffiliateEvent(
				{
					type: 'regular_reward_pending',
					dedupeKey: reference,
					affiliateProgramId: affiliateProgram?.id || null,
					affiliateUserId: order.affiliateUserId,
					referredUserId: order.userId,
					orderId: order.id,
					source: 'order_settlement',
					metadata: {
						amount: creditAmount,
						commissionBaseAmount: reward.commissionBaseAmount,
						rewardPercent: reward.rewardPercent,
						rewardCap: reward.rewardCap
					}
				},
				tx
			);

			await tx.notification.create({
				data: {
					userId: order.affiliateUserId as string,
					type: 'affiliate_store_credit',
					title: 'Referral reward earned',
					message: `₦${creditAmount.toLocaleString()} from referred order ${order.orderNumber} — it clears for spending and withdrawal after the return window.`
				}
			});
		});

		if (!suspectedSelfReferral) {
			void sendFirstStoreCreditEmailIfNeeded({
				userId: order.affiliateUserId,
				creditAmount
			}).catch((error) => {
				console.error('Failed to send first Store Credit email:', error);
			});
		}

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

export interface AffiliateIntegrityRecoveryResult {
	examinedOrders: number;
	recoveredRewards: number;
	reconciledRegularRewards: number;
	reconciledSuperActivations: number;
	reconciledSuperMonths: number;
	reconciledAffiliateSales: number;
	failed: number;
}

/**
 * Durable settlement/refund recovery for obligations that sit immediately after an
 * order transaction. Every operation called here is independently idempotent. Only
 * orders carrying the new checkout policy snapshot are eligible for automatic missing-
 * reward creation; ambiguous legacy history remains a review/reporting concern instead
 * of being auto-paid under today's rules.
 */
export async function recoverAffiliateRewardIntegrity(
	limit = 500
): Promise<AffiliateIntegrityRecoveryResult> {
	const take = Math.min(Math.max(Math.floor(limit), 1), 1_000);
	const result: AffiliateIntegrityRecoveryResult = {
		examinedOrders: 0,
		recoveredRewards: 0,
		reconciledRegularRewards: 0,
		reconciledSuperActivations: 0,
		reconciledSuperMonths: 0,
		reconciledAffiliateSales: 0,
		failed: 0
	};

	const candidateOrders = await prisma.order.findMany({
		where: {
			AND: [
				buildRevenueOrderWhere(),
				{ orderType: 'account', affiliateUserId: { not: null }, userId: { not: null } }
			]
		},
		select: {
			id: true,
			userId: true,
			affiliateUserId: true,
			discountAmount: true,
			analyticsMetadata: true
		},
		orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
		take
	});
	result.examinedOrders = candidateOrders.length;

	const snapshottedOrders = candidateOrders.flatMap((order) => {
		const metadata =
			order.analyticsMetadata &&
			typeof order.analyticsMetadata === 'object' &&
			!Array.isArray(order.analyticsMetadata)
				? (order.analyticsMetadata as Record<string, unknown>)
				: {};
		const policy =
			metadata.affiliatePolicy &&
			typeof metadata.affiliatePolicy === 'object' &&
			!Array.isArray(metadata.affiliatePolicy)
				? (metadata.affiliatePolicy as Record<string, unknown>)
				: {};
		const programType = String(policy.programType || '').toLowerCase();
		if (Number(policy.version || 0) < 1 || !['regular', 'super'].includes(programType)) return [];
		return [{ ...order, programType: programType as 'regular' | 'super' }];
	});

	const regularCandidates = snapshottedOrders.filter(
		(order) => order.programType === 'regular' && Number(order.discountAmount || 0) > 0
	);
	const regularReferences = regularCandidates.map((order) => `affiliate:credit:order:${order.id}`);
	const existingRegularRewards = regularReferences.length
		? await prisma.walletTransaction.findMany({
				where: { reference: { in: regularReferences } },
				select: { reference: true }
			})
		: [];
	const existingRegularReferences = new Set(
		existingRegularRewards.map((row) => String(row.reference || ''))
	);

	for (const order of regularCandidates) {
		const reference = `affiliate:credit:order:${order.id}`;
		if (existingRegularReferences.has(reference)) continue;
		try {
			const recovered = await recordAffiliateStoreCreditForOrder(order.id);
			if (!recovered.success) result.failed += 1;
			else if (Number(recovered.storeCreditAwarded || 0) > 0) result.recoveredRewards += 1;
		} catch (error) {
			result.failed += 1;
			console.error('Failed to recover a missing regular affiliate reward:', error);
		}
	}

	const superByPair = new Map<string, (typeof snapshottedOrders)[number]>();
	for (const order of snapshottedOrders) {
		if (order.programType !== 'super' || !order.affiliateUserId || !order.userId) continue;
		const pair = `${order.affiliateUserId}:${order.userId}`;
		// Orders are newest-first, so the first row is the clearest trigger to retain.
		if (!superByPair.has(pair)) superByPair.set(pair, order);
	}
	const superReferences = [...superByPair.values()].map(
		(order) => `super:activation:${order.affiliateUserId}:${order.userId}`
	);
	const existingSuperActivations = superReferences.length
		? await prisma.walletTransaction.findMany({
				where: { reference: { in: superReferences } },
				select: { reference: true, userId: true, createdAt: true }
			})
		: [];
	const existingSuperReferences = new Set(
		existingSuperActivations.map((row) => String(row.reference || ''))
	);
	// An activation and its monthly bonus are two independently committed obligations.
	// Re-evaluate the month even when the one-time activation already exists, so a
	// crash between those writes cannot leave the monthly tier permanently unpaid.
	const reconciledSuperMonthKeys = new Set<string>();
	for (const activation of existingSuperActivations) {
		const key = `${activation.userId}:${superMonthKey(activation.createdAt)}`;
		if (reconciledSuperMonthKeys.has(key)) continue;
		reconciledSuperMonthKeys.add(key);
		try {
			await reconcileSuperMonthlyTierForActivation(activation.userId, activation.createdAt);
			result.reconciledSuperMonths += 1;
		} catch (error) {
			result.failed += 1;
			console.error('Failed to recover a Super affiliate monthly tier:', error);
		}
	}
	for (const order of superByPair.values()) {
		const reference = `super:activation:${order.affiliateUserId}:${order.userId}`;
		if (existingSuperReferences.has(reference)) continue;
		try {
			const recovered = await recordAffiliateStoreCreditForOrder(order.id);
			if (!recovered.success) result.failed += 1;
			else if (Number(recovered.storeCreditAwarded || 0) > 0) result.recoveredRewards += 1;
		} catch (error) {
			result.failed += 1;
			console.error('Failed to recover a missing Super affiliate activation:', error);
		}
	}

	// Refund recovery starts from the changed order, rather than repeatedly scanning
	// the oldest active rewards. The prior reward-first scan could permanently starve
	// newer refunds once an affiliate had more than `take` unchanged ledger rows.
	const refundedOrders = await prisma.order.findMany({
		where: {
			orderType: 'account',
			affiliateUserId: { not: null },
			userId: { not: null },
			OR: [
				{ refundedAmount: { gt: 0 } },
				{ status: 'refunded' },
				{ paymentStatus: 'refunded' },
				{ deliveryStatus: 'refunded' }
			]
		},
		select: {
			id: true,
			userId: true,
			affiliateUserId: true,
			status: true,
			paymentStatus: true,
			deliveryStatus: true
		},
		orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
		take
	});
	const affiliatesNeedingSalesReconciliation = new Set<string>();
	for (const order of refundedOrders) {
		try {
			if (isRevenueOrder(order)) {
				await reconcileRegularRewardForOrder(order.id);
			} else {
				await voidUnvestedRewardsForOrder(order.id);
				await reverseVestedRegularRewardForOrder(order.id);
			}
			result.reconciledRegularRewards += 1;
		} catch (error) {
			result.failed += 1;
			console.error('Failed to recover a regular affiliate refund adjustment:', error);
		}
		try {
			await maybeVoidSuperActivationOnRefund({
				userId: order.userId,
				affiliateUserId: order.affiliateUserId
			});
			result.reconciledSuperActivations += 1;
		} catch (error) {
			result.failed += 1;
			console.error('Failed to recover a Super affiliate refund adjustment:', error);
		}
		if (order.affiliateUserId) affiliatesNeedingSalesReconciliation.add(order.affiliateUserId);
	}
	for (const affiliateUserId of affiliatesNeedingSalesReconciliation) {
		try {
			await reconcileAffiliateSales(affiliateUserId);
			result.reconciledAffiliateSales += 1;
		} catch (error) {
			result.failed += 1;
			console.error('Failed to recover cached affiliate sales after a refund:', error);
		}
	}

	return result;
}

/** Rebuild the cached sales total for one affiliate from canonical net retained orders. */
export async function reconcileAffiliateSales(
	affiliateUserId: string | null | undefined
): Promise<void> {
	if (!affiliateUserId) return;
	const programs = await prisma.affiliateProgram.findMany({
		where: { userId: affiliateUserId },
		select: { id: true, affiliateCode: true }
	});
	for (const program of programs) {
		const aggregate = await prisma.order.aggregate({
			where: {
				AND: [
					buildRevenueOrderWhere(),
					{ affiliateUserId, affiliateCode: program.affiliateCode, orderType: 'account' }
				]
			},
			_sum: { totalAmount: true, refundedAmount: true }
		});
		await prisma.affiliateProgram.update({
			where: { id: program.id },
			data: { totalSales: toNetSales(aggregate._sum.totalAmount, aggregate._sum.refundedAmount) }
		});
	}
}

export async function maybeSendAffiliateUnlockInvite(userId: string): Promise<void> {
	try {
		const [qualification, existingProgram, user] = await Promise.all([
			getAffiliateQualificationStatus(userId),
			prisma.affiliateProgram.findFirst({
				where: { userId },
				select: { id: true, status: true }
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
		if (existingProgram?.status === 'active' && user.isAffiliateEnabled) return;

		// A retained first purchase creates the program automatically. An explicitly
		// disabled/inactive program is never silently re-enabled.
		const enabled = await enableAffiliateMode(userId);
		if (!enabled.success || !enabled.affiliateCode) return;

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
					title: 'Your affiliate code is ready',
					message: `Share ${enabled.affiliateCode} to bring buyers and earn Cash from retained account orders.`
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
				status: true,
				isSuperAffiliate: true
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
				affiliateUnlockedPopupSeenAt: true,
				affiliateShareCodePopupSeenAt: true,
				affiliatePayoutDetails: { select: { id: true, status: true } }
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

	const [successfulReferredOrders, referredOrderUsersRaw, lockedReferrals, codeUsesThisMonth] =
		await Promise.all([
			prisma.order.count({
				where: {
					AND: [
						buildRevenueOrderWhere(),
						{ affiliateUserId: userId, userId: { not: null }, orderType: 'account' }
					]
				}
			}),
			prisma.order.findMany({
				where: {
					AND: [
						buildRevenueOrderWhere(),
						{ affiliateUserId: userId, userId: { not: null }, orderType: 'account' }
					]
				},
				select: {
					userId: true
				}
			}),
			listStoredReferralsForReferrer(userId),
			prisma.order.count({
				where: {
					affiliateUserId: userId,
					affiliateCode: { not: null },
					orderType: 'account',
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
	const storedReferralPolicyByUser = new Map<string, Record<string, unknown> | null>();

	for (const referral of lockedReferrals) {
		if (referral.referredUserId) {
			referredUserIds.add(referral.referredUserId);
			storedReferralPolicyByUser.set(referral.referredUserId, referral.policySnapshot);
			if (!referralLockedAtByUser.has(referral.referredUserId)) {
				referralLockedAtByUser.set(referral.referredUserId, referral.lockedAt);
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
							AND: [
								buildRevenueOrderWhere(),
								{
									affiliateUserId: userId,
									userId: { in: referredUserIdList },
									orderType: 'account'
								}
							]
						},
						select: {
							id: true,
							userId: true,
							createdAt: true,
							analyticsMetadata: true
						},
						orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
					})
				: Promise.resolve([]),
			referredUserIdList.length
				? prisma.walletTransaction.findMany({
						where: {
							userId,
							type: { in: [AFFILIATE_LEDGER_CREDIT_TYPE, SC_AFFILIATE_ADJUSTMENT] },
							status: { notIn: ['reversed', 'failed', 'cancelled'] }
						},
						select: {
							type: true,
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
						in: [
							AFFILIATE_LEDGER_CREDIT_TYPE,
							AFFILIATE_LEDGER_PAYOUT_TYPE,
							SC_REDEEM_EARNED,
							SC_AFFILIATE_ADJUSTMENT
						]
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
	const orderPolicySnapshotsByUser = new Map<string, unknown[]>();
	for (const order of referredOrdersRaw) {
		if (!order.userId) continue;
		const current = referralOrdersByUser.get(order.userId) || { ordersCount: 0, lastOrderAt: null };
		current.ordersCount += 1;
		if (!current.lastOrderAt || order.createdAt > current.lastOrderAt) {
			current.lastOrderAt = order.createdAt;
		}
		referralOrdersByUser.set(order.userId, current);
		paidUserIdSet.add(order.userId);
		const metadata = parseMetadataObject(order.analyticsMetadata);
		const policy = metadata.affiliatePolicy;
		if (policy) {
			const snapshots = orderPolicySnapshotsByUser.get(order.userId) || [];
			snapshots.push(policy);
			orderPolicySnapshotsByUser.set(order.userId, snapshots);
		}
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
		const amount = Math.max(0, Number(tx.amount || 0));
		current.total += tx.type === SC_AFFILIATE_ADJUSTMENT ? -amount : amount;
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
			const status = String(row.status || '')
				.trim()
				.toLowerCase();
			const isCredit =
				(row.type === AFFILIATE_LEDGER_CREDIT_TYPE && status !== 'reversed') ||
				(row.type !== AFFILIATE_LEDGER_CREDIT_TYPE && status === 'reversed');
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

	// Resolve each relationship independently. A current Super affiliate may still
	// have older regular contracts, while a demoted affiliate may still have Super
	// contracts that must be honoured and displayed.
	const superContractByUser = new Map<
		string,
		{ terms: SuperReferralTerms; termsFrozen: boolean }
	>();
	if (program?.id) {
		for (const referredUserId of referredUserIdList) {
			const resolved = resolveAffiliateRelationshipPolicy({
				referralPolicySnapshot: storedReferralPolicyByUser.get(referredUserId),
				orderPolicySnapshots: orderPolicySnapshotsByUser.get(referredUserId),
				programId: program.id,
				liveIsSuperAffiliate: Boolean(program.isSuperAffiliate),
				liveConfig: config
			});
			if (
				resolved.programType === 'super' &&
				resolved.superTerms &&
				(resolved.superTerms.enabled ?? config.superAffiliateEnabled)
			) {
				superContractByUser.set(referredUserId, {
					terms: resolved.superTerms,
					termsFrozen: resolved.termsFrozen
				});
			}
		}
	}

	// Super-affiliate per-referral progress + current-month activations.
	const isSuperAffiliate = Boolean(program?.isSuperAffiliate || superContractByUser.size > 0);
	let superReferrals: SuperReferralProgressItem[] = [];
	let superActivationsThisMonth = 0;
	let activeSuperMonthlyTiers = getConfiguredSuperMonthlyTiers(config);
	if (isSuperAffiliate) {
		const superReferralIds = [...superContractByUser.keys()];
		const firstContract = superContractByUser.values().next().value as
			| { terms: SuperReferralTerms; termsFrozen: boolean }
			| undefined;
		const monthlyFallbackConfig = firstContract
			? applySuperReferralTerms(config, firstContract.terms)
			: config;
		const [superOrderAgg, activationRows, monthlyPolicy] = await Promise.all([
			superReferralIds.length
				? prisma.order.groupBy({
						by: ['userId'],
						where: {
							AND: [
								buildRevenueOrderWhere(),
								{
									userId: { in: superReferralIds },
									affiliateUserId: userId,
									orderType: 'account'
								}
							]
						},
						_count: { _all: true },
						_sum: { totalAmount: true, refundedAmount: true }
					})
				: Promise.resolve([]),
			prisma.walletTransaction.findMany({
				where: {
					userId,
					reference: { startsWith: `super:activation:${userId}:` },
					status: { notIn: [AFFILIATE_LEDGER_STATUS.reversed, 'failed', 'cancelled'] },
					NOT: { metadata: { path: ['suspectedSelfReferral'], equals: true } }
				},
				select: { reference: true, createdAt: true }
			}),
			getSuperMonthlyPolicy(userId, new Date(), monthlyFallbackConfig)
		]);
		activeSuperMonthlyTiers = monthlyPolicy;

		const orderAggByUser = new Map<string, { orderCount: number; cumulativeSpend: number }>();
		for (const row of superOrderAgg) {
			if (!row.userId) continue;
			orderAggByUser.set(row.userId, {
				orderCount: row._count._all,
				cumulativeSpend: toNetSales(row._sum.totalAmount, row._sum.refundedAmount)
			});
		}

		const { start: superMonthStart, end: superMonthEnd } = getUtcMonthWindow(new Date());
		const activatedAtByUser = new Map<string, string>();
		for (const row of activationRows) {
			const referredUserId = row.reference?.split(':').pop() || '';
			if (referredUserId) activatedAtByUser.set(referredUserId, row.createdAt.toISOString());
			if (row.createdAt >= superMonthStart && row.createdAt < superMonthEnd) {
				superActivationsThisMonth += 1;
			}
		}

		superReferrals = superReferralIds
			.map((referredUserId) => {
				const contract = superContractByUser.get(referredUserId);
				if (!contract) return null;
				const agg = orderAggByUser.get(referredUserId) || { orderCount: 0, cumulativeSpend: 0 };
				const activatedAt = activatedAtByUser.get(referredUserId) || null;
				return {
					userId: referredUserId,
					displayName: formatAffiliateDisplayName(usersById.get(referredUserId)?.fullName),
					status: activatedAt ? ('activated' as const) : ('pending' as const),
					orderCount: agg.orderCount,
					cumulativeSpend: agg.cumulativeSpend,
					orderTarget: contract.terms.activationOrderThreshold,
					spendTarget: contract.terms.activationSpendThreshold,
					activationReward: contract.terms.activationReward,
					termsFrozen: contract.termsFrozen,
					activatedAt
				};
			})
			.filter((row): row is SuperReferralProgressItem => Boolean(row))
			// Pending first (she cares who's close), then by most progress.
			.sort((a, b) => {
				if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
				return b.cumulativeSpend - a.cumulativeSpend;
			});
	}

	const accountAgeDays = user
		? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
		: 0;
	const availableStoreCredit = ledger.availableStoreCredit;
	const bankDetailsStatus = user?.affiliatePayoutDetails?.status || null;
	const payoutEligibility = calculateAffiliatePayoutEligibility({
		availableStoreCredit,
		requestedStoreCredit: ledger.requestedStoreCredit,
		payoutMinimum: config.payoutMinimum,
		accountAgeDays,
		payoutMinAccountAgeDays: config.payoutMinAccountAgeDays,
		bankDetailsStatus
	});
	const payoutHasOpenRequest = payoutEligibility.hasOpenRequest;
	const payoutBlockers = payoutEligibility.blockers;
	const payoutEligible = payoutEligibility.eligible;

	const payoutProgressPercentForPopup =
		config.payoutMinimum > 0
			? Math.min(100, Math.floor((availableStoreCredit / config.payoutMinimum) * 100))
			: 0;
	const pendingPopup = getPendingAffiliatePopup({
		unlocked,
		hasBankDetails: Boolean(user?.affiliatePayoutDetails),
		payoutProgressPercent: payoutProgressPercentForPopup,
		popupsEnabled: config.dashboardPopupsEnabled,
		seenAt: {
			welcome: user?.affiliateWelcomePopupSeenAt ?? null,
			progress50: user?.affiliateProgress50PopupSeenAt ?? null,
			progress80: user?.affiliateProgress80PopupSeenAt ?? null,
			progress95: user?.affiliateProgress95PopupSeenAt ?? null,
			unlocked: user?.affiliateUnlockedPopupSeenAt ?? null,
			shareCode: user?.affiliateShareCodePopupSeenAt ?? null
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
		payoutHasOpenRequest,
		payoutBlockers,
		hasBankDetails: Boolean(user?.affiliatePayoutDetails),
		bankDetailsStatus,
		payoutMinimum: config.payoutMinimum,
		payoutMinAccountAgeDays: config.payoutMinAccountAgeDays,
		accountAgeDays,
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
		pendingPopup,
		isSuperAffiliate,
		superReferrals,
		superActivationsThisMonth,
		regularPolicy: {
			buyerDiscountPercent: config.discountStage1Percent,
			affiliateRewardPercent: config.storeCreditFallbackPercent,
			orderLimit: config.buyerDiscountOrderLimit,
			perOrderCap: Math.min(config.discountStage1Cap, config.storeCreditMax)
		},
		superPolicy: {
			enabledForNewReferrals: config.superAffiliateEnabled,
			activationSpendThreshold: config.superActivationSpendThreshold,
			activationOrderThreshold: config.superActivationOrderThreshold,
			activationReward: config.superActivationReward,
			monthlyTiers: activeSuperMonthlyTiers.map((tier) => ({
				count: tier.count,
				totalAmount: tier.amount
			}))
		}
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

		if (dashboard.bankDetailsStatus !== 'approved') {
			return { success: false, error: 'Approved bank details are required before payout.' };
		}

		if (!dashboard.payoutEligible) {
			return { success: false, error: 'Payout requirements are not met yet.' };
		}

		const estimatedAmount = toRoundedNaira(dashboard.availableStoreCredit);
		if (estimatedAmount <= 0) {
			return { success: false, error: 'No available Cash to request.' };
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

		const payoutResult = await prisma.$transaction(async (tx) => {
			// One affiliate can submit only one live request at a time. The wallet lock
			// serializes double-clicks and parallel devices before we re-read the ledger.
			await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;
			const [liveUser, liveProgram] = await Promise.all([
				tx.user.findUnique({
					where: { id: userId },
					select: { isActive: true, isAffiliateEnabled: true, createdAt: true }
				}),
				tx.affiliateProgram.findUnique({
					where: { userId },
					select: { status: true }
				})
			]);
			if (!liveUser?.isActive || !liveUser.isAffiliateEnabled || liveProgram?.status !== 'active') {
				return {
					success: false as const,
					error: 'Affiliate access is no longer active. Refresh before requesting payout.'
				};
			}
			const liveAccountAgeDays = Math.floor(
				(Date.now() - liveUser.createdAt.getTime()) / (1000 * 60 * 60 * 24)
			);
			if (liveAccountAgeDays < dashboard.payoutMinAccountAgeDays) {
				return {
					success: false as const,
					error: `Your account must be ${dashboard.payoutMinAccountAgeDays} days old before payout.`
				};
			}

			const existingOpenRequest = await tx.walletTransaction.findFirst({
				where: {
					userId,
					type: AFFILIATE_LEDGER_PAYOUT_TYPE,
					status: {
						in: [AFFILIATE_LEDGER_STATUS.requested, AFFILIATE_LEDGER_STATUS.underReview]
					}
				},
				select: { id: true }
			});
			if (existingOpenRequest) {
				return {
					success: false as const,
					error: 'A payout request is already pending review. Please wait for processing.'
				};
			}

			const approvedBankDetails = await tx.affiliatePayoutDetails.findFirst({
				where: { userId, status: 'approved' },
				select: { id: true }
			});
			if (!approvedBankDetails) {
				return {
					success: false as const,
					error: 'Approved bank details are required before payout.'
				};
			}

			const liveLedger = await getAffiliateLedgerSummary(userId, tx);
			const amount = toRoundedNaira(liveLedger.availableStoreCredit);
			if (amount <= 0 || amount < dashboard.payoutMinimum) {
				return {
					success: false as const,
					error: 'Payout requirements are no longer met. Refresh and try again.'
				};
			}

			const liveWallet = await tx.wallet.findUnique({
				where: { id: wallet.id },
				select: { balance: true }
			});
			if (!liveWallet) throw new Error('AFFILIATE_WALLET_NOT_FOUND');
			const balance = Number(liveWallet.balance || 0);
			const reference = `affiliate:payout:request:${userId}:${randomUUID()}`;
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
			await recordAffiliateEvent(
				{
					type: 'payout_requested',
					dedupeKey: reference,
					affiliateUserId: userId,
					source: 'affiliate_dashboard',
					metadata: { amount, payoutTransactionId: payoutTransaction.id }
				},
				tx
			);
			return {
				success: true as const,
				payoutTransactionId: payoutTransaction.id,
				amount,
				reference
			};
		});

		if (!payoutResult.success) return payoutResult;
		const { payoutTransactionId, amount, reference } = payoutResult;

		const recipients = await getOperationalAlertRecipients().catch(() => []);
		const payoutRecipients = recipients.filter(Boolean);
		const baseUrl = getBaseUrl();
		const affiliateName = sanitizeEmailName(user.fullName || user.email || 'affiliate');

		await Promise.allSettled(
			payoutRecipients.map((recipientEmail) =>
				sendEmail({
					to: recipientEmail,
					subject: `[FastAccs Ops] Affiliate payout request (${affiliateName})`,
					body: `A new affiliate payout request was submitted.\n\nAffiliate: ${user.fullName || 'N/A'}\nEmail: ${user.email || 'N/A'}\nRequested amount: ₦${amount.toLocaleString()}\nAvailable Affiliate Cash at request time: ₦${amount.toLocaleString()}\nRequested at: ${new Date().toISOString()}\n\nReview affiliate details in admin to approve or follow up.`,
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
