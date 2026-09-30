import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { env } from '$env/dynamic/private';
import {
	BOOSTING_ACTION_LABELS,
	BOOSTING_ACTIONS_BY_PLATFORM,
	BOOSTING_PLATFORM_LABELS,
	getBoostingServiceConfig,
	getQuantityChips
} from '$lib/helpers/boosting-service-config';
import { getRequiredLinkType } from '$lib/helpers/social-link-validator';
import { prisma } from '$lib/prisma';

export type SuggestedQualityTier = 'value' | 'stable' | 'premium';

export interface DraftSuggestionCandidate {
	id: string;
	provider: string;
	ratePerThousand: number;
	minQuantity: number;
	maxQuantity: number;
	qualitySignals: string[];
}

const TIER_DEFINITIONS = {
	value: {
		customerName: 'Affordable',
		shortPromise: 'A lower-cost option for straightforward growth.',
		expectationChips: ['Affordable'],
		requiredVerifiedSignals: [],
		displayOrder: 0,
		priceMultiplier: 1
	},
	stable: {
		customerName: 'More stable',
		shortPromise: 'Less likely to drop, with stronger staying power.',
		expectationChips: ['Less likely to drop'],
		requiredVerifiedSignals: ['stability_verified'],
		displayOrder: 1,
		priceMultiplier: 1.25
	},
	premium: {
		customerName: 'Premium',
		shortPromise: 'Higher-quality delivery when staying power matters most.',
		expectationChips: ['Premium quality'],
		requiredVerifiedSignals: ['stability_verified', 'premium_quality_verified'],
		displayOrder: 2,
		priceMultiplier: 1.5
	}
} as const;

const DRAFT_TRANSACTION_OPTIONS = {
	maxWait: 10_000,
	timeout: 30_000
} as const;

function configuredFxRate(): number {
	const value = Number(env.BOOSTING_USD_NGN_RATE || env.HUBMAN_USD_NGN_RATE || 1700);
	return Number.isFinite(value) && value > 0 ? value : 1700;
}

function configuredCurrencyBufferPercent(): number {
	return 0;
}

function signalCount(candidate: DraftSuggestionCandidate, signals: string[]): number {
	return signals.filter((signal) => candidate.qualitySignals.includes(signal)).length;
}

function eligibleForTier(candidate: DraftSuggestionCandidate, tier: SuggestedQualityTier): boolean {
	if (tier === 'value') return true;
	if (tier === 'stable') {
		return signalCount(candidate, ['stability_claim', 'refill_claim']) > 0;
	}
	return candidate.qualitySignals.includes('quality_claim');
}

/**
 * Produces a compact provisional shortlist. These are catalogue suggestions, not reliability
 * approvals: supplier marketing signals affect review order only and never enable a live route.
 */
export function rankDraftSuggestionCandidates(
	candidates: DraftSuggestionCandidate[],
	tier: SuggestedQualityTier,
	limit = 4
): DraftSuggestionCandidate[] {
	const eligible = candidates.filter((candidate) => eligibleForTier(candidate, tier));
	const ranked = [...eligible].sort((left, right) => {
		if (tier !== 'value') {
			const wanted =
				tier === 'premium'
					? ['quality_claim', 'stability_claim', 'refill_claim']
					: ['stability_claim', 'refill_claim'];
			const signalDifference = signalCount(right, wanted) - signalCount(left, wanted);
			if (signalDifference) return signalDifference;
		}
		return left.ratePerThousand - right.ratePerThousand || left.id.localeCompare(right.id);
	});

	const selected: DraftSuggestionCandidate[] = [];
	for (const provider of [...new Set(ranked.map((candidate) => candidate.provider))]) {
		const candidate = ranked.find((item) => item.provider === provider);
		if (candidate) selected.push(candidate);
	}
	for (const candidate of ranked) {
		if (selected.length >= limit) break;
		if (!selected.some((item) => item.id === candidate.id)) selected.push(candidate);
	}
	return selected.slice(0, limit);
}

function slugPart(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function defaultQuantity(outcome: string): number {
	return ['views', 'streams'].includes(outcome) ? 1000 : 100;
}

async function ensureCoreDraftCategories(database: PrismaClient) {
	const existing = await database.category.findMany({
		where: { categoryType: 'boosting_service' },
		orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
	});
	const byKey = new Map<string, (typeof existing)[number]>();
	for (const category of existing) {
		const config = getBoostingServiceConfig(category.metadata);
		const key = `${config.platform}:${config.actionType}`;
		if (!byKey.has(key)) byKey.set(key, category);
	}

	const pending: Prisma.CategoryCreateManyInput[] = [];
	for (const [platformIndex, platform] of Object.keys(BOOSTING_ACTIONS_BY_PLATFORM).entries()) {
		const actions =
			BOOSTING_ACTIONS_BY_PLATFORM[platform as keyof typeof BOOSTING_ACTIONS_BY_PLATFORM];
		for (const [actionIndex, outcome] of actions.entries()) {
			const key = `${platform}:${outcome}`;
			if (byKey.has(key)) continue;
			const quantity = defaultQuantity(outcome);
			pending.push({
				id: randomUUID(),
				name: `${BOOSTING_PLATFORM_LABELS[platform as keyof typeof BOOSTING_PLATFORM_LABELS]} ${BOOSTING_ACTION_LABELS[outcome]}`,
				slug: `boosting-${slugPart(platform)}-${slugPart(outcome)}`,
				description: 'Internal draft generated from current supplier coverage.',
				categoryType: 'boosting_service',
				isActive: false,
				sortOrder: 10_000 + platformIndex * 100 + actionIndex,
				metadata: {
					boosting_platform: platform,
					boosting_action_type: outcome,
					boosting_min_quantity: quantity,
					boosting_step_quantity: quantity,
					boosting_price_per_step: 0,
					boosting_refill_available: false,
					boosting_draft_generated: true
				}
			});
		}
	}

	if (pending.length === 0) return { categories: [...byKey.values()], created: 0 };
	const created = await database.category.createMany({ data: pending });
	const all = await database.category.findMany({
		where: { categoryType: 'boosting_service' },
		orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
	});
	const refreshedByKey = new Map<string, (typeof all)[number]>();
	for (const category of all) {
		const config = getBoostingServiceConfig(category.metadata);
		const key = `${config.platform}:${config.actionType}`;
		if (!refreshedByKey.has(key)) refreshedByKey.set(key, category);
	}
	return { categories: [...refreshedByKey.values()], created: created.count };
}

function safeMoney(value: number): number {
	return Math.min(99_999_999, Math.max(1, Math.round(value)));
}

export function suggestDraftPricePerStep(input: {
	maximumCostAtMinimum: number;
	minimumQuantity: number;
	stepQuantity: number;
	existingPricePerStep: number;
	priceMultiplier: number;
}): number {
	const safeMinimumPrice = input.maximumCostAtMinimum / 0.7;
	const safePricePerStep =
		(safeMinimumPrice * input.stepQuantity) / Math.max(1, input.minimumQuantity);
	const basePrice = Math.max(input.existingPricePerStep, safePricePerStep);
	const suggestedPrice = basePrice * input.priceMultiplier;
	return Math.min(99_999_950, Math.max(50, Math.ceil((suggestedPrice - 1e-9) / 50) * 50));
}

function isGeneratedDraftCategory(metadata: Prisma.JsonValue): boolean {
	return (
		Boolean(metadata) &&
		typeof metadata === 'object' &&
		!Array.isArray(metadata) &&
		(metadata as Record<string, unknown>).boosting_draft_generated === true
	);
}

export interface BoostDraftSuggestionSummary {
	processed: number;
	categoriesCreated: number;
	categoriesReviewed: number;
	offersCreated: number;
	routesSuggested: number;
	pricesRepaired: number;
	skippedWithoutCandidates: number;
}

export async function prepopulateBoostingDraftSuggestions(
	options: { database?: PrismaClient } = {}
): Promise<BoostDraftSuggestionSummary> {
	const database = options.database ?? prisma;
	const { categories, created: categoriesCreated } = await ensureCoreDraftCategories(database);
	const summary: BoostDraftSuggestionSummary = {
		processed: categories.length,
		categoriesCreated,
		categoriesReviewed: categories.length,
		offersCreated: 0,
		routesSuggested: 0,
		pricesRepaired: 0,
		skippedWithoutCandidates: 0
	};
	const fxRate = configuredFxRate();
	const costBuffer = 1 + configuredCurrencyBufferPercent() / 100;
	const categoryIds = categories.map((category) => category.id);
	const [services, existingOffers] = await Promise.all([
		database.boostProviderService.findMany({
			where: {
				catalogueStatus: 'ready_for_review',
				unavailableAt: null,
				ratePerThousand: { not: null }
			},
			select: {
				id: true,
				provider: true,
				platforms: true,
				outcomes: true,
				targetType: true,
				ratePerThousand: true,
				minQuantity: true,
				maxQuantity: true,
				qualitySignals: true
			},
			orderBy: { ratePerThousand: 'asc' }
		}),
		database.boostCustomerOffer.findMany({
			where: { categoryId: { in: categoryIds }, audienceTag: 'general' },
			select: {
				id: true,
				categoryId: true,
				qualityTier: true,
				audienceTag: true,
				pricePerStepNgn: true,
				status: true
			}
		})
	]);
	const existingOfferByKey = new Map(
		existingOffers.map((offer) => [
			`${offer.categoryId}:${offer.qualityTier}:${offer.audienceTag}`,
			offer
		])
	);
	const offerRows: Prisma.BoostCustomerOfferCreateManyInput[] = [];
	const routeRows: Prisma.BoostServiceRouteCreateManyInput[] = [];
	const auditRows: Prisma.AdminAuditLogCreateManyInput[] = [];
	const priceRepairs: Array<{ id: string; pricePerStepNgn: number }> = [];

	for (const category of categories) {
		const config = getBoostingServiceConfig(category.metadata);
		const targetType = getRequiredLinkType(config.actionType);
		const maximumPreset = Math.max(...getQuantityChips(config));
		const candidates: DraftSuggestionCandidate[] = services.flatMap((row) => {
			if (row.ratePerThousand === null || row.minQuantity === null || row.maxQuantity === null) {
				return [];
			}
			if (
				!row.platforms.includes(config.platform) ||
				!row.outcomes.includes(config.actionType) ||
				row.targetType !== targetType ||
				row.minQuantity > config.minQuantity ||
				row.maxQuantity < maximumPreset
			) {
				return [];
			}
			return [
				{
					id: row.id,
					provider: row.provider,
					ratePerThousand: Number(row.ratePerThousand),
					minQuantity: row.minQuantity,
					maxQuantity: row.maxQuantity,
					qualitySignals: row.qualitySignals
				}
			];
		});

		for (const tier of Object.keys(TIER_DEFINITIONS) as SuggestedQualityTier[]) {
			const existingOffer = existingOfferByKey.get(`${category.id}:${tier}:general`);
			const canRepairGeneratedPrice =
				Boolean(existingOffer) &&
				existingOffer?.status === 'hidden' &&
				Number(existingOffer.pricePerStepNgn) <= 0 &&
				isGeneratedDraftCategory(category.metadata);
			if (existingOffer && !canRepairGeneratedPrice) continue;
			const suggested = rankDraftSuggestionCandidates(candidates, tier);
			if (suggested.length < 2) {
				summary.skippedWithoutCandidates += 1;
				continue;
			}
			const definition = TIER_DEFINITIONS[tier];
			const costs = suggested.map(
				(candidate) => (candidate.ratePerThousand * config.minQuantity * fxRate * costBuffer) / 1000
			);
			const normalCost = safeMoney(costs[Math.floor(costs.length / 2)] ?? costs[0]);
			const maximumCost = safeMoney(Math.max(...costs) * 1.2);
			const pricePerStepNgn = suggestDraftPricePerStep({
				maximumCostAtMinimum: maximumCost,
				minimumQuantity: config.minQuantity,
				stepQuantity: config.stepQuantity,
				existingPricePerStep: config.pricePerStep,
				priceMultiplier: definition.priceMultiplier
			});
			if (existingOffer && canRepairGeneratedPrice) {
				priceRepairs.push({ id: existingOffer.id, pricePerStepNgn });
				auditRows.push({
					id: randomUUID(),
					action: 'boosting_draft_price_suggested',
					resourceType: 'boost_customer_offer',
					resourceId: existingOffer.id,
					description: `Added a rounded customer-price suggestion to the hidden ${tier} draft`,
					metadata: {
						categoryId: category.id,
						qualityTier: tier,
						pricePerStepNgn,
						automaticallyPublished: false
					} satisfies Prisma.InputJsonValue
				});
				continue;
			}
			const offerId = randomUUID();
			offerRows.push({
				id: offerId,
				categoryId: category.id,
				platform: config.platform,
				outcome: config.actionType,
				targetType,
				audienceTag: 'general',
				qualityTier: tier,
				customerName: definition.customerName,
				shortPromise: definition.shortPromise,
				expectationChips: [...definition.expectationChips],
				minQuantity: config.minQuantity,
				stepQuantity: config.stepQuantity,
				quantityPresets: getQuantityChips(config),
				pricePerStepNgn,
				requiredVerifiedSignals: [...definition.requiredVerifiedSignals],
				refillDays: null,
				minimumMarginPercent: 30,
				normalCostTargetNgn: normalCost,
				maximumSupplierCostNgn: maximumCost,
				attemptCap: 1,
				recoveryModes: [],
				status: 'hidden',
				displayOrder: definition.displayOrder,
				routingPolicy: 'automatic'
			});
			routeRows.push(
				...suggested.map((candidate) => ({
					id: randomUUID(),
					offerId,
					providerServiceId: candidate.id,
					state: 'shadow',
					equivalenceApproved: false,
					equivalenceLabel: 'Automatically suggested; owner review required',
					targetType,
					verifiedSignals: [],
					audienceTags: [],
					verifiedRefillDays: null,
					minimumQuantity: candidate.minQuantity,
					maximumQuantity: candidate.maxQuantity,
					maximumPilotQuantity: config.minQuantity,
					expectedRecoveryCostPercent: 10
				}))
			);
			auditRows.push({
				id: randomUUID(),
				action: 'boosting_draft_suggestions_created',
				resourceType: 'boost_customer_offer',
				resourceId: offerId,
				description: `Created hidden ${tier} draft with ${suggested.length} provisional route suggestions`,
				metadata: {
					categoryId: category.id,
					qualityTier: tier,
					providerServiceIds: suggested.map((candidate) => candidate.id),
					automaticallyApproved: false
				} satisfies Prisma.InputJsonValue
			});
		}
	}

	if (offerRows.length > 0 || priceRepairs.length > 0) {
		const created = await database.$transaction(async (tx) => {
			const offers = offerRows.length
				? await tx.boostCustomerOffer.createMany({ data: offerRows })
				: { count: 0 };
			const routes = routeRows.length
				? await tx.boostServiceRoute.createMany({ data: routeRows })
				: { count: 0 };
			let repaired = 0;
			if (priceRepairs.length > 0) {
				const values = priceRepairs.map(
					(item) => Prisma.sql`(${item.id}::uuid, ${item.pricePerStepNgn}::numeric)`
				);
				repaired = await tx.$executeRaw`
					UPDATE "boost_customer_offers" AS offer
					SET "price_per_step_ngn" = fixes.price,
						"updated_at" = NOW()
					FROM (VALUES ${Prisma.join(values)}) AS fixes(id, price)
					WHERE offer.id = fixes.id
						AND offer.status = 'hidden'
						AND offer."price_per_step_ngn" <= 0
				`;
			}
			if (auditRows.length > 0) await tx.adminAuditLog.createMany({ data: auditRows });
			return { offers: offers.count, routes: routes.count, repaired };
		}, DRAFT_TRANSACTION_OPTIONS);
		summary.offersCreated = created.offers;
		summary.routesSuggested = created.routes;
		summary.pricesRepaired = created.repaired;
	}
	return summary;
}
