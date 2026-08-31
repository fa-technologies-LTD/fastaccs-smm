import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const REFERRAL_PREFIX = 'affiliate.referral.lock.user.';
const REFUNDED_STATES = new Set(['refunded', 'cancelled', 'canceled', 'failed', 'expired']);
const REVENUE_ORDER_STATES = new Set(['paid', 'processing', 'completed']);
const REVENUE_PAYMENT_STATES = new Set(['paid', 'success', 'overpaid']);
const OPEN_PAYOUT_STATES = new Set(['requested', 'under_review']);
const ACTIVE_REWARD_STATES = new Set(['pending', 'available', 'under_review', 'requested', 'paid']);

const APPROVED_POLICY = {
	'config.affiliate.discount_stage1_percent': '5',
	'config.affiliate.discount_stage1_cap': '1000',
	'config.affiliate.buyer_discount_order_limit': '2',
	'config.affiliate.max_rewarded_orders_per_buyer': '2',
	'config.affiliate.store_credit_max': '1000',
	'config.affiliate.store_credit_fallback_percent': '5',
	'config.affiliate.payout_minimum': '5000',
	'config.affiliate.payout_min_account_age_days': '15',
	'config.affiliate.super.enabled': 'true',
	'config.affiliate.super.activation_spend_threshold': '3500',
	'config.affiliate.super.activation_order_threshold': '3',
	'config.affiliate.super.activation_reward': '700',
	'config.affiliate.super.tier_1_count': '10',
	'config.affiliate.super.tier_1_amount': '3000',
	'config.affiliate.super.tier_2_count': '20',
	'config.affiliate.super.tier_2_amount': '8000',
	'config.affiliate.super.tier_3_count': '30',
	'config.affiliate.super.tier_3_amount': '15000'
};

function normalize(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

function money(value) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function jsonObject(value) {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isRevenueOrder(order) {
	if (normalize(order.paymentChannel) === 'manual_release') return false;
	if (
		[order.status, order.paymentStatus, order.deliveryStatus].some((state) =>
			REFUNDED_STATES.has(normalize(state))
		)
	) {
		return false;
	}
	return (
		REVENUE_ORDER_STATES.has(normalize(order.status)) ||
		REVENUE_PAYMENT_STATES.has(normalize(order.paymentStatus))
	);
}

function netSale(order) {
	return isRevenueOrder(order)
		? Math.max(0, money(order.totalAmount) - money(order.refundedAmount))
		: 0;
}

function parseLegacyReferral(row) {
	try {
		const value = JSON.parse(row.value);
		const referredUserId = String(value.referredUserId || row.key.slice(REFERRAL_PREFIX.length));
		const parsed = {
			affiliateProgramId: String(value.affiliateProgramId || ''),
			affiliateCode: String(value.affiliateCode || '')
				.trim()
				.toUpperCase(),
			referrerUserId: String(value.referrerUserId || ''),
			referredUserId,
			source: String(value.source || 'legacy_backfill'),
			lockedAt: String(value.lockedAt || row.createdAt?.toISOString() || ''),
			policySnapshot: parseAffiliatePolicy(value.policySnapshot) ? value.policySnapshot : null
		};
		if (
			!parsed.affiliateProgramId ||
			!parsed.affiliateCode ||
			!parsed.referrerUserId ||
			!parsed.referredUserId
		) {
			return { error: 'missing required attribution fields', key: row.key };
		}
		return parsed;
	} catch {
		return { error: 'invalid JSON', key: row.key };
	}
}

function fingerprint(value) {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function monthKey(date) {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseMonthlyTiers(value) {
	if (!Array.isArray(value)) return [];
	return value
		.map((tier) => {
			const row = jsonObject(tier);
			return {
				count: Math.max(0, Math.floor(Number(row.count || 0))),
				amount: Math.max(0, money(row.amount))
			};
		})
		.filter((tier) => tier.count > 0)
		.sort((a, b) => a.count - b.count);
}

function parseSuperTerms(value) {
	const terms = jsonObject(value);
	const activationSpendThreshold = money(terms.activationSpendThreshold);
	const activationOrderThreshold = Math.floor(Number(terms.activationOrderThreshold || 0));
	const activationReward = money(terms.activationReward);
	const monthlyTiers = parseMonthlyTiers(terms.monthlyTiers);
	if (
		activationSpendThreshold <= 0 ||
		activationOrderThreshold <= 0 ||
		activationReward < 0 ||
		monthlyTiers.length !== 3 ||
		monthlyTiers[0].count >= monthlyTiers[1].count ||
		monthlyTiers[1].count >= monthlyTiers[2].count ||
		monthlyTiers[0].amount > monthlyTiers[1].amount ||
		monthlyTiers[1].amount > monthlyTiers[2].amount
	) {
		return null;
	}
	return {
		enabled: typeof terms.enabled === 'boolean' ? terms.enabled : null,
		activationSpendThreshold,
		activationOrderThreshold,
		activationReward,
		monthlyTiers
	};
}

function parseAffiliatePolicy(value) {
	const policy = jsonObject(value);
	const version = Math.floor(Number(policy.version || 0));
	const programId = String(policy.programId || '').trim();
	const programType = normalize(policy.programType);
	if (version < 1 || !programId || !['regular', 'super'].includes(programType)) return null;
	const superTerms = programType === 'super' ? parseSuperTerms(policy.superTerms) : null;
	if (programType === 'super' && !superTerms) return null;
	return {
		version,
		programId,
		programType,
		superTerms,
		snapshottedAt: String(policy.snapshottedAt || policy.relationshipSnapshottedAt || '') || null
	};
}

function buildCurrentPolicy(program, settingsByKey, snapshottedAt) {
	const setting = (key) => settingsByKey.get(key) ?? APPROVED_POLICY[key];
	const isSuper = Boolean(program.isSuperAffiliate);
	return {
		version: 1,
		programId: program.id,
		programType: isSuper ? 'super' : 'regular',
		...(isSuper
			? {
					superTerms: {
						enabled: normalize(setting('config.affiliate.super.enabled')) === 'true',
						activationSpendThreshold: money(
							setting('config.affiliate.super.activation_spend_threshold')
						),
						activationOrderThreshold: Math.floor(
							Number(setting('config.affiliate.super.activation_order_threshold'))
						),
						activationReward: money(setting('config.affiliate.super.activation_reward')),
						monthlyTiers: [1, 2, 3].map((tier) => ({
							count: Math.floor(Number(setting(`config.affiliate.super.tier_${tier}_count`))),
							amount: money(setting(`config.affiliate.super.tier_${tier}_amount`))
						}))
					}
				}
			: {}),
		snapshottedAt
	};
}

function highestMonthlyTier(tiers, count) {
	return tiers.reduce((highest, tier) => (count >= tier.count ? tier : highest), null);
}

if (process.argv.includes('--apply')) {
	console.error(
		'This command is intentionally read-only. Review its fingerprinted report first; an apply tool must be built against the exact owner-approved record list.'
	);
	process.exit(2);
}

try {
	const [programs, legacyRows, durableReferrals, payoutDetails, orders, ledger, settings] =
		await Promise.all([
			prisma.affiliateProgram.findMany({
				orderBy: { id: 'asc' },
				select: {
					id: true,
					userId: true,
					affiliateCode: true,
					isSuperAffiliate: true,
					totalReferrals: true,
					totalSales: true,
					status: true
				}
			}),
			prisma.microcopy.findMany({
				where: { category: 'affiliate_referral', key: { startsWith: REFERRAL_PREFIX } },
				orderBy: { key: 'asc' },
				select: { key: true, value: true, createdAt: true }
			}),
			prisma.affiliateReferral.findMany({
				orderBy: { referredUserId: 'asc' },
				select: {
					id: true,
					affiliateProgramId: true,
					referrerUserId: true,
					referredUserId: true,
					affiliateCode: true,
					lockedAt: true,
					policySnapshot: true
				}
			}),
			prisma.affiliatePayoutDetails.findMany({
				orderBy: { userId: 'asc' },
				select: {
					id: true,
					userId: true,
					bankName: true,
					accountNumber: true,
					accountName: true,
					phone: true,
					encryptedPayload: true,
					encryptionKeyId: true,
					accountNumberLast4: true,
					status: true
				}
			}),
			prisma.order.findMany({
				where: { OR: [{ affiliateUserId: { not: null } }, { userId: { not: null } }] },
				orderBy: { id: 'asc' },
				select: {
					id: true,
					userId: true,
					affiliateUserId: true,
					affiliateCode: true,
					orderType: true,
					discountAmount: true,
					promotionId: true,
					storeCreditApplied: true,
					totalAmount: true,
					refundedAmount: true,
					status: true,
					paymentStatus: true,
					deliveryStatus: true,
					paymentChannel: true,
					analyticsMetadata: true,
					createdAt: true
				}
			}),
			prisma.walletTransaction.findMany({
				where: {
					type: {
						in: [
							'affiliate_credit',
							'affiliate_credit_adjustment',
							'affiliate_payout',
							'store_credit_redemption_earned'
						]
					}
				},
				orderBy: { id: 'asc' },
				select: {
					id: true,
					userId: true,
					type: true,
					amount: true,
					status: true,
					reference: true,
					metadata: true,
					createdAt: true
				}
			}),
			prisma.microcopy.findMany({
				where: { key: { in: Object.keys(APPROVED_POLICY) } },
				orderBy: { key: 'asc' },
				select: { key: true, value: true }
			})
		]);

	const blockers = [];
	const warnings = [];
	const settingsByKey = new Map(settings.map((row) => [row.key, String(row.value)]));
	const programById = new Map(programs.map((program) => [program.id, program]));
	const programByUserId = new Map();
	for (const program of programs) {
		const bucket = programByUserId.get(program.userId) || [];
		bucket.push(program);
		programByUserId.set(program.userId, bucket);
	}
	for (const [userId, rows] of programByUserId) {
		if (rows.length > 1)
			blockers.push({
				type: 'duplicate_programs_for_user',
				userId,
				programIds: rows.map((row) => row.id)
			});
	}

	const durableByBuyer = new Map(durableReferrals.map((row) => [row.referredUserId, row]));
	const malformedLegacyReferrals = [];
	const referralBackfillCandidates = [];
	const referralConflicts = [];
	for (const row of legacyRows) {
		const parsed = parseLegacyReferral(row);
		if (parsed.error) {
			malformedLegacyReferrals.push(parsed);
			continue;
		}
		const program = programById.get(parsed.affiliateProgramId);
		if (
			!program ||
			program.userId !== parsed.referrerUserId ||
			program.affiliateCode !== parsed.affiliateCode
		) {
			referralConflicts.push({ type: 'legacy_program_mismatch', ...parsed });
			continue;
		}
		const durable = durableByBuyer.get(parsed.referredUserId);
		if (!durable) {
			referralBackfillCandidates.push(parsed);
			continue;
		}
		if (
			durable.affiliateProgramId !== parsed.affiliateProgramId ||
			durable.referrerUserId !== parsed.referrerUserId ||
			durable.affiliateCode !== parsed.affiliateCode
		) {
			referralConflicts.push({
				type: 'legacy_durable_attribution_conflict',
				referredUserId: parsed.referredUserId,
				legacyProgramId: parsed.affiliateProgramId,
				durableProgramId: durable.affiliateProgramId
			});
		}
	}
	blockers.push(...referralConflicts);

	const ordersById = new Map(orders.map((order) => [order.id, order]));
	const referredOrders = orders.filter((order) => order.affiliateUserId);
	const relationshipContractBackfill = [];
	const relationshipContractBlockers = [];
	const knownRelationships = [
		...durableReferrals.map((row) => ({ ...row, storage: 'durable' })),
		...referralBackfillCandidates.map((row) => ({ ...row, id: null, storage: 'legacy_only' }))
	];
	for (const referral of knownRelationships) {
		const program = programById.get(referral.affiliateProgramId);
		if (!program) continue;
		const existingPolicy = parseAffiliatePolicy(referral.policySnapshot);
		if (existingPolicy?.programId === program.id) {
			if (existingPolicy.programType === 'super' && existingPolicy.superTerms?.enabled === null) {
				relationshipContractBlockers.push({
					type: 'frozen_super_contract_missing_enabled_state',
					referralId: referral.id,
					referredUserId: referral.referredUserId
				});
			}
			continue;
		}

		const matchingOrders = referredOrders
			.filter(
				(order) =>
					order.userId === referral.referredUserId &&
					order.affiliateUserId === referral.referrerUserId &&
					normalize(order.orderType) === 'account'
			)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
		const snapshottedOrder = matchingOrders.find((order) => {
			const policy = parseAffiliatePolicy(jsonObject(order.analyticsMetadata).affiliatePolicy);
			return policy?.programId === program.id;
		});
		if (snapshottedOrder) {
			const rawPolicy = jsonObject(snapshottedOrder.analyticsMetadata).affiliatePolicy;
			const parsedPolicy = parseAffiliatePolicy(rawPolicy);
			if (parsedPolicy?.programType === 'super' && parsedPolicy.superTerms?.enabled === null) {
				relationshipContractBlockers.push({
					type: 'legacy_super_contract_missing_enabled_state',
					referralId: referral.id,
					referredUserId: referral.referredUserId,
					orderId: snapshottedOrder.id
				});
				continue;
			}
			relationshipContractBackfill.push({
				referralId: referral.id,
				storage: referral.storage,
				referredUserId: referral.referredUserId,
				affiliateProgramId: program.id,
				basis: 'earliest_order_contract',
				basisOrderId: snapshottedOrder.id,
				proposedPolicySnapshot: rawPolicy
			});
			continue;
		}

		if (matchingOrders.length > 0) {
			relationshipContractBlockers.push({
				type: 'legacy_relationship_with_orders_but_no_trustworthy_contract',
				referralId: referral.id,
				referredUserId: referral.referredUserId,
				affiliateProgramId: program.id,
				orderIds: matchingOrders.map((order) => order.id)
			});
			continue;
		}

		relationshipContractBackfill.push({
			referralId: referral.id,
			storage: referral.storage,
			referredUserId: referral.referredUserId,
			affiliateProgramId: program.id,
			basis: 'current_policy_no_order_history',
			basisOrderId: null,
			proposedPolicySnapshot: {
				...buildCurrentPolicy(
					program,
					settingsByKey,
					referral.lockedAt.toISOString?.() || referral.lockedAt
				),
				legacyBackfillBasis: 'current_policy_no_order_history'
			}
		});
	}
	blockers.push(...relationshipContractBlockers);
	const selfAttributedOrders = referredOrders
		.filter((order) => order.userId && order.userId === order.affiliateUserId)
		.map((order) => ({ orderId: order.id, userId: order.userId }));
	const stackedDiscountOrders = referredOrders
		.filter((order) => order.promotionId && money(order.discountAmount) > 0)
		.map((order) => ({
			orderId: order.id,
			affiliateUserId: order.affiliateUserId,
			promotionId: order.promotionId,
			discountAmount: money(order.discountAmount)
		}));
	blockers.push(
		...selfAttributedOrders.map((row) => ({ type: 'self_attributed_order', ...row })),
		...stackedDiscountOrders.map((row) => ({
			type: 'promotion_and_affiliate_discount_stacked',
			...row
		}))
	);
	const linkedAfterPriorPurchase = [];
	for (const referral of durableReferrals) {
		const earlierOrder = orders.find(
			(order) =>
				order.userId === referral.referredUserId &&
				isRevenueOrder(order) &&
				order.createdAt < referral.lockedAt
		);
		if (earlierOrder) {
			linkedAfterPriorPurchase.push({
				referredUserId: referral.referredUserId,
				referralId: referral.id,
				priorOrderId: earlierOrder.id
			});
		}
	}
	if (linkedAfterPriorPurchase.length)
		blockers.push(
			...linkedAfterPriorPurchase.map((row) => ({
				type: 'referral_linked_after_prior_purchase',
				...row
			}))
		);

	const nonAccountAttributedOrders = referredOrders
		.filter((order) => normalize(order.orderType) !== 'account')
		.map((order) => ({
			orderId: order.id,
			orderType: order.orderType,
			affiliateUserId: order.affiliateUserId
		}));
	const nonAccountRewards = [];
	const activeRewardsOnRefundedOrders = [];
	const regularRewardPolicyAnomalies = [];
	const regularRewardsByPair = new Map();
	const rewardReferences = new Set();
	for (const row of ledger.filter((entry) => entry.type === 'affiliate_credit')) {
		if (row.reference) rewardReferences.add(String(row.reference));
		const metadata = jsonObject(row.metadata);
		const orderId =
			typeof metadata.orderId === 'string'
				? metadata.orderId
				: String(row.reference || '').match(/^affiliate:credit:order:(.+)$/)?.[1] || null;
		if (!orderId) continue;
		const order = ordersById.get(orderId);
		if (!order) {
			warnings.push({ type: 'reward_missing_order', rewardId: row.id, orderId });
			continue;
		}
		if (normalize(order.orderType) !== 'account')
			nonAccountRewards.push({ rewardId: row.id, orderId, orderType: order.orderType });
		if (!isRevenueOrder(order) && ACTIVE_REWARD_STATES.has(normalize(row.status))) {
			activeRewardsOnRefundedOrders.push({
				rewardId: row.id,
				orderId,
				status: row.status,
				amount: money(row.amount)
			});
		}
		if (
			typeof metadata.buyerUserId === 'string' &&
			String(row.reference || '').startsWith('affiliate:credit:order:')
		) {
			const externalCash = Math.max(0, money(order.totalAmount) - money(order.storeCreditApplied));
			const commissionBase = money(metadata.commissionBaseAmount);
			if (money(order.discountAmount) <= 0) {
				regularRewardPolicyAnomalies.push({
					type: 'regular_reward_without_buyer_affiliate_discount',
					rewardId: row.id,
					orderId
				});
			}
			if (money(row.amount) > 1_000.01) {
				regularRewardPolicyAnomalies.push({
					type: 'regular_reward_above_approved_cap',
					rewardId: row.id,
					orderId,
					amount: money(row.amount)
				});
			}
			if (Number(metadata.policyVersion || 0) >= 3 && commissionBase - externalCash > 0.01) {
				regularRewardPolicyAnomalies.push({
					type: 'commission_base_exceeds_external_cash',
					rewardId: row.id,
					orderId,
					commissionBase,
					externalCash
				});
			}
			const pair = `${row.userId}:${metadata.buyerUserId}`;
			const bucket = regularRewardsByPair.get(pair) || [];
			bucket.push({ rewardId: row.id, orderId, status: row.status });
			regularRewardsByPair.set(pair, bucket);
		}
	}
	const tooManyRegularRewards = [...regularRewardsByPair.entries()]
		.filter(([, rows]) => rows.filter((row) => normalize(row.status) !== 'reversed').length > 2)
		.map(([pair, rows]) => ({ pair, rows }));
	blockers.push(
		...nonAccountRewards.map((row) => ({ type: 'non_account_affiliate_reward', ...row })),
		...activeRewardsOnRefundedOrders.map((row) => ({
			type: 'active_reward_on_non_revenue_order',
			...row
		})),
		...regularRewardPolicyAnomalies,
		...tooManyRegularRewards.map((row) => ({
			type: 'more_than_two_regular_rewards_for_pair',
			...row
		}))
	);

	const snapshottedAttributedOrders = referredOrders.flatMap((order) => {
		const policy = parseAffiliatePolicy(jsonObject(order.analyticsMetadata).affiliatePolicy);
		if (!policy) return [];
		return [{ ...order, snapshottedProgramType: policy.programType, snapshottedPolicy: policy }];
	});
	const missingRegularSettlements = snapshottedAttributedOrders
		.filter(
			(order) =>
				order.snapshottedProgramType === 'regular' &&
				normalize(order.orderType) === 'account' &&
				order.userId !== order.affiliateUserId &&
				money(order.discountAmount) > 0 &&
				isRevenueOrder(order) &&
				!rewardReferences.has(`affiliate:credit:order:${order.id}`)
		)
		.map((order) => ({
			orderId: order.id,
			buyerUserId: order.userId,
			affiliateUserId: order.affiliateUserId,
			discountAmount: money(order.discountAmount),
			netRetainedValue: netSale(order)
		}));
	blockers.push(
		...missingRegularSettlements.map((row) => ({
			type: 'missing_regular_reward_settlement',
			...row
		}))
	);

	const activeSuperActivations = ledger.filter((entry) => {
		if (entry.type !== 'affiliate_credit') return false;
		if (!String(entry.reference || '').startsWith('super:activation:')) return false;
		if (!ACTIVE_REWARD_STATES.has(normalize(entry.status))) return false;
		return jsonObject(entry.metadata).suspectedSelfReferral !== true;
	});
	const superActivationReferences = new Set(
		ledger
			.filter((entry) => String(entry.reference || '').startsWith('super:activation:'))
			.map((entry) => String(entry.reference))
	);
	const superPairs = new Map();
	for (const order of snapshottedAttributedOrders) {
		if (
			order.snapshottedProgramType !== 'super' ||
			!order.userId ||
			!order.affiliateUserId ||
			normalize(order.orderType) !== 'account'
		) {
			continue;
		}
		const pairKey = `${order.affiliateUserId}:${order.userId}`;
		const existingPair = superPairs.get(pairKey);
		if (existingPair && existingPair.contractCreatedAt <= order.createdAt) continue;
		superPairs.set(pairKey, {
			superUserId: order.affiliateUserId,
			referredUserId: order.userId,
			contractCreatedAt: order.createdAt,
			terms: order.snapshottedPolicy.superTerms
		});
	}
	const missingSuperActivations = [];
	for (const pair of superPairs.values()) {
		if (!pair.terms || pair.terms.enabled === false) continue;
		const retainedOrders = referredOrders.filter(
			(order) =>
				order.userId === pair.referredUserId &&
				order.affiliateUserId === pair.superUserId &&
				normalize(order.orderType) === 'account' &&
				isRevenueOrder(order)
		);
		const retainedOrderCount = retainedOrders.length;
		const retainedSpend = retainedOrders.reduce((sum, order) => sum + netSale(order), 0);
		const qualifies =
			retainedOrderCount >= pair.terms.activationOrderThreshold ||
			retainedSpend >= pair.terms.activationSpendThreshold;
		const reference = `super:activation:${pair.superUserId}:${pair.referredUserId}`;
		if (qualifies && !superActivationReferences.has(reference)) {
			missingSuperActivations.push({
				superUserId: pair.superUserId,
				referredUserId: pair.referredUserId,
				retainedOrderCount,
				retainedSpend,
				activationOrderThreshold: pair.terms.activationOrderThreshold,
				activationSpendThreshold: pair.terms.activationSpendThreshold,
				activationReward: pair.terms.activationReward,
				reference
			});
		}
	}
	blockers.push(
		...missingSuperActivations.map((row) => ({
			type: 'missing_super_activation_settlement',
			...row
		}))
	);

	const configuredMonthlyTiers = [1, 2, 3]
		.map((tier) => ({
			count: Number(APPROVED_POLICY[`config.affiliate.super.tier_${tier}_count`]),
			amount: Number(APPROVED_POLICY[`config.affiliate.super.tier_${tier}_amount`])
		}))
		.sort((a, b) => a.count - b.count);
	const activationMonths = new Map();
	for (const activation of activeSuperActivations) {
		const key = `${activation.userId}:${monthKey(activation.createdAt)}`;
		const bucket = activationMonths.get(key) || [];
		bucket.push(activation);
		activationMonths.set(key, bucket);
	}
	const superMonthlySettlementAnomalies = [];
	for (const [key, activations] of activationMonths) {
		activations.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
		const [superUserId, superMonth] = key.split(':');
		const snapshottedTiers = parseMonthlyTiers(jsonObject(activations[0].metadata).monthlyTiers);
		const tiers = snapshottedTiers.length > 0 ? snapshottedTiers : configuredMonthlyTiers;
		if (snapshottedTiers.length === 0) {
			warnings.push({
				type: 'super_month_uses_live_policy_fallback',
				superUserId,
				month: superMonth,
				firstActivationId: activations[0].id
			});
		}
		const target = highestMonthlyTier(tiers, activations.length)?.amount || 0;
		const credited = ledger
			.filter(
				(row) =>
					row.type === 'affiliate_credit' &&
					row.userId === superUserId &&
					String(row.reference || '').startsWith(
						`super:monthly_bonus:${superUserId}:${superMonth}:`
					) &&
					ACTIVE_REWARD_STATES.has(normalize(row.status))
			)
			.reduce((sum, row) => sum + money(row.amount), 0);
		const adjusted = ledger
			.filter(
				(row) =>
					row.type === 'affiliate_credit_adjustment' &&
					row.userId === superUserId &&
					normalize(row.status) === 'available' &&
					String(jsonObject(row.metadata).superMonthKey || '') === superMonth
			)
			.reduce((sum, row) => sum + money(row.amount), 0);
		const settled = Math.max(0, credited - adjusted);
		if (Math.abs(settled - target) > 0.01) {
			superMonthlySettlementAnomalies.push({
				type:
					settled < target
						? 'missing_super_monthly_bonus_settlement'
						: 'excess_super_monthly_bonus_settlement',
				superUserId,
				month: superMonth,
				activationCount: activations.length,
				target,
				credited,
				adjusted,
				settled
			});
		}
	}
	blockers.push(...superMonthlySettlementAnomalies);

	const bankEncryptionBackfill = [];
	const bankEncryptionBlockers = [];
	for (const row of payoutDetails) {
		if (row.encryptedPayload) {
			if (!row.encryptionKeyId || !row.accountNumberLast4) {
				bankEncryptionBlockers.push({
					type: 'incomplete_encrypted_bank_envelope',
					userId: row.userId,
					payoutDetailsId: row.id
				});
			}
			continue;
		}
		if (!row.bankName || !row.accountNumber || !row.accountName || !row.phone) {
			bankEncryptionBlockers.push({
				type: 'incomplete_plaintext_bank_details',
				userId: row.userId,
				payoutDetailsId: row.id
			});
			continue;
		}
		bankEncryptionBackfill.push({
			userId: row.userId,
			payoutDetailsId: row.id,
			status: row.status,
			accountNumberLast4: String(row.accountNumber).slice(-4)
		});
	}
	blockers.push(...bankEncryptionBlockers);

	const approvedBankUsers = new Set(
		payoutDetails.filter((row) => row.status === 'approved').map((row) => row.userId)
	);
	const openPayoutsByUser = new Map();
	for (const row of ledger.filter(
		(entry) => entry.type === 'affiliate_payout' && OPEN_PAYOUT_STATES.has(normalize(entry.status))
	)) {
		const bucket = openPayoutsByUser.get(row.userId) || [];
		bucket.push({ id: row.id, amount: money(row.amount), status: row.status });
		openPayoutsByUser.set(row.userId, bucket);
	}
	const payoutAnomalies = [];
	const maximumPayableByUser = new Map();
	for (const row of ledger) {
		const status = normalize(row.status);
		let delta = 0;
		if (row.type === 'affiliate_credit' && status === 'available') delta = money(row.amount);
		else if (
			['affiliate_credit_adjustment', 'store_credit_redemption_earned'].includes(row.type) &&
			status === 'available'
		) {
			delta = -money(row.amount);
		} else if (row.type === 'affiliate_payout' && status === 'paid') {
			delta = -money(row.amount);
		}
		if (delta !== 0) {
			maximumPayableByUser.set(row.userId, (maximumPayableByUser.get(row.userId) || 0) + delta);
		}
	}
	for (const [userId, rows] of openPayoutsByUser) {
		if (rows.length > 1)
			payoutAnomalies.push({ type: 'multiple_open_payouts', userId, payouts: rows });
		if (!approvedBankUsers.has(userId))
			payoutAnomalies.push({ type: 'open_payout_without_approved_bank', userId, payouts: rows });
		const maximumPayable = Math.max(0, money(maximumPayableByUser.get(userId)));
		for (const payout of rows) {
			if (payout.amount > maximumPayable + 0.01) {
				payoutAnomalies.push({
					type: 'open_payout_exceeds_final_entitlement',
					userId,
					payoutId: payout.id,
					requestedAmount: payout.amount,
					maximumPayable
				});
			}
		}
	}
	blockers.push(...payoutAnomalies);

	const referralsPerProgram = new Map();
	for (const referral of durableReferrals) {
		referralsPerProgram.set(
			referral.affiliateProgramId,
			(referralsPerProgram.get(referral.affiliateProgramId) || 0) + 1
		);
	}
	const programReconciliation = programs
		.map((program) => {
			const canonicalReferrals = referralsPerProgram.get(program.id) || 0;
			const canonicalSales = referredOrders
				.filter(
					(order) =>
						order.affiliateUserId === program.userId &&
						order.affiliateCode === program.affiliateCode &&
						normalize(order.orderType) === 'account'
				)
				.reduce((sum, order) => sum + netSale(order), 0);
			return {
				programId: program.id,
				userId: program.userId,
				isSuperAffiliate: program.isSuperAffiliate,
				before: { totalReferrals: program.totalReferrals, totalSales: money(program.totalSales) },
				after: { totalReferrals: canonicalReferrals, totalSales: money(canonicalSales) }
			};
		})
		.filter(
			(row) =>
				row.before.totalReferrals !== row.after.totalReferrals ||
				Math.abs(row.before.totalSales - row.after.totalSales) > 0.01
		);

	const policyChanges = Object.entries(APPROVED_POLICY)
		.map(([key, approvedValue]) => ({
			key,
			currentValue: settingsByKey.get(key) ?? null,
			approvedValue
		}))
		.filter((row) => row.currentValue !== row.approvedValue);

	const paidBuyerIds = new Set(
		orders
			.filter(isRevenueOrder)
			.map((order) => order.userId)
			.filter(Boolean)
	);
	const missingAffiliatePrograms = [...paidBuyerIds].filter(
		(userId) => !programByUserId.has(userId)
	);

	const report = {
		mode: 'dry-run-read-only',
		generatedAt: new Date().toISOString(),
		policyVersion: 3,
		summary: {
			programs: programs.length,
			legacyReferralLocks: legacyRows.length,
			durableReferrals: durableReferrals.length,
			referralBackfillCandidates: referralBackfillCandidates.length,
			relationshipContractsNeedingBackfill: relationshipContractBackfill.length,
			ambiguousRelationshipContracts: relationshipContractBlockers.length,
			bankRowsNeedingEncryption: bankEncryptionBackfill.length,
			programTotalsNeedingReconciliation: programReconciliation.length,
			policySettingsNeedingUpdate: policyChanges.length,
			paidBuyersMissingAffiliateProgram: missingAffiliatePrograms.length,
			blockers: blockers.length,
			warnings: warnings.length,
			nonAccountAttributedOrders: nonAccountAttributedOrders.length,
			missingRegularSettlements: missingRegularSettlements.length,
			missingSuperActivations: missingSuperActivations.length,
			superMonthlySettlementAnomalies: superMonthlySettlementAnomalies.length
		},
		blockers,
		warnings,
		referralBackfillCandidates,
		relationshipContractBackfill,
		relationshipContractBlockers,
		malformedLegacyReferrals,
		bankEncryptionBackfill,
		programReconciliation,
		policyChanges,
		missingAffiliatePrograms,
		nonAccountAttributedOrders,
		missingRegularSettlements,
		missingSuperActivations,
		superMonthlySettlementAnomalies
	};
	const { generatedAt: _generatedAt, ...stableReport } = report;
	const reportFingerprint = fingerprint(stableReport);
	console.log(JSON.stringify({ ...report, reportFingerprint }, null, 2));
	if (blockers.length > 0) process.exitCode = 2;
} catch (error) {
	if (error?.code === 'P2021' || error?.code === 'P2022') {
		console.error(
			'[affiliate-audit] The additive affiliate migration is not present. Deploy only that migration before running this read-only historical audit.'
		);
	} else {
		console.error('[affiliate-audit] Failed:', error);
	}
	process.exitCode = 1;
} finally {
	await prisma.$disconnect();
}
