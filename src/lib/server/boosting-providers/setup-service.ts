import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { supportsBoostServiceInput } from '$lib/helpers/boosting-service-input';
import { parseBoostServiceId } from './service-id';
import { getBoostingServiceConfig, getQuantityChips } from '$lib/helpers/boosting-service-config';
import type {
	BoostMappingCandidate,
	BoostServiceLookupResult
} from '$lib/helpers/boosting-mapping-types';
import { getRequiredLinkType } from '$lib/helpers/social-link-validator';
import type { BoostProviderId } from './types';
import {
	inferAdvertisedRefillDays,
	isThreadsService,
	isUnsafeAutomaticServiceLabel,
	serviceMatchesBoostOutcome,
	supplierTextAdvertisesRefill
} from './catalog-normalizer';

const LABELS: Record<BoostProviderId, string> = {
	smm_raja: 'SMM Raja',
	bulk_follows: 'BulkFollows'
};

// Alternatives behind one customer option should have comparable economics. A route that costs
// several times more than its peers distorts the displayed price and is not a safe fallback.
export const SMART_AUTO_MAX_PRICE_RATIO = 1.6;

type ServiceRow = Prisma.BoostProviderServiceGetPayload<Record<string, never>>;

function isAutomaticOnlyUnsafe(
	row: Pick<ServiceRow, 'name' | 'category' | 'providerType'>,
	platform: string,
	outcome: string
): boolean {
	return (
		(isThreadsService(row) && platform !== 'threads') ||
		isUnsafeAutomaticServiceLabel(row) ||
		!supportsBoostServiceInput(row.providerType, outcome) ||
		!serviceMatchesBoostOutcome(row, outcome)
	);
}

function toCandidate(row: ServiceRow): BoostMappingCandidate | null {
	if (
		!(row.provider in LABELS) ||
		row.ratePerThousand === null ||
		row.minQuantity === null ||
		row.maxQuantity === null
	) {
		return null;
	}
	const provider = row.provider as BoostProviderId;
	const refillText = `${row.name} ${row.category} ${row.description ?? ''}`;
	const refillDaysClaimed = inferAdvertisedRefillDays(refillText);
	const refillAdvertised =
		row.refillAdvertised === true || supplierTextAdvertisesRefill(refillText);
	const qualitySignals = [
		...new Set([...row.qualitySignals, ...(refillAdvertised ? ['refill_claim'] : [])])
	];
	return {
		id: row.id,
		provider,
		providerLabel: LABELS[provider],
		serviceId: row.serviceId,
		name: row.name,
		category: row.category,
		providerType: row.providerType,
		ratePerThousand: Number(row.ratePerThousand),
		minQuantity: row.minQuantity,
		maxQuantity: row.maxQuantity,
		refillAdvertised,
		refillDaysClaimed,
		cancelAdvertised: row.cancelAdvertised,
		dripfeedAdvertised: row.dripfeedAdvertised,
		qualitySignals,
		catalogueStatus: row.catalogueStatus,
		lastSeenAt: row.lastSeenAt.toISOString(),
		mappedRoute: null
	};
}

function manualSelectionIssues(
	row: ServiceRow,
	config: ReturnType<typeof getBoostingServiceConfig>,
	qualityTier: string
): { blocking: string[]; advisory: string[] } {
	const blocking: string[] = [];
	const advisory: string[] = [];
	const maximumPreset = Math.max(...getQuantityChips(config));
	if (row.unavailableAt) blocking.push('The supplier no longer lists this service.');
	if (!supportsBoostServiceInput(row.providerType, config.actionType))
		blocking.push('This service needs extra inputs that checkout does not support yet.');
	if (row.catalogueStatus === 'quarantined')
		blocking.push('The supplier row failed catalogue safety checks.');
	if (isThreadsService(row) && config.platform !== 'threads') {
		blocking.push('It is a Threads service, not this platform.');
	}
	if (!row.platforms.includes(config.platform)) blocking.push('It is for a different platform.');
	if (
		!row.outcomes.includes(config.actionType) ||
		!serviceMatchesBoostOutcome(row, config.actionType)
	)
		blocking.push('It delivers a different result.');
	if (row.targetType !== getRequiredLinkType(config.actionType)) {
		blocking.push('It expects a different type of link.');
	}
	if (row.ratePerThousand === null) blocking.push('The supplier price is missing.');
	if (row.minQuantity === null) blocking.push('The supplier minimum is missing.');
	if (row.maxQuantity === null) blocking.push('The supplier maximum is missing.');
	if (row.minQuantity === null || row.minQuantity > config.minQuantity) {
		if (row.minQuantity !== null) {
			advisory.push(
				`Its minimum is ${row.minQuantity.toLocaleString()}; that will become the customer starting quantity.`
			);
		}
	}
	if (row.maxQuantity === null || row.maxQuantity < maximumPreset) {
		if (row.maxQuantity !== null) {
			advisory.push(
				`Its maximum is ${row.maxQuantity.toLocaleString()}; customer quantities will be capped there.`
			);
		}
	}
	const candidate = toCandidate(row);
	const signals = new Set(candidate?.qualitySignals ?? []);
	const hasStabilityEvidence =
		candidate?.refillAdvertised === true ||
		signals.has('stability_claim') ||
		signals.has('refill_claim');
	if ((qualityTier === 'stable' || qualityTier === 'premium') && !hasStabilityEvidence) {
		advisory.push(
			'The supplier listing does not state stable delivery or refill protection; use your own test result.'
		);
	}
	if (qualityTier === 'premium' && !signals.has('quality_claim')) {
		advisory.push(
			'The supplier listing does not state premium, high-quality, HQ or real delivery; use your own test result.'
		);
	}
	return { blocking, advisory };
}

async function loadCategory(database: PrismaClient, categoryId: string) {
	const category = await database.category.findFirst({
		where: { id: categoryId, categoryType: 'boosting_service' },
		select: { metadata: true }
	});
	return category ? getBoostingServiceConfig(category.metadata) : null;
}

export async function lookupBoostProviderService(
	input: {
		categoryId: string;
		provider: BoostProviderId;
		serviceCode: string;
		qualityTier?: string;
	},
	database: PrismaClient = prisma
): Promise<BoostServiceLookupResult> {
	const config = await loadCategory(database, input.categoryId);
	if (!config)
		return {
			found: false,
			compatible: false,
			issues: ['Customer result not found.'],
			service: null
		};
	const code = parseBoostServiceId(input.provider, input.serviceCode);
	if (!code) {
		return {
			found: false,
			compatible: false,
			issues: ['Enter the exact supplier service code, including any s prefix.'],
			service: null
		};
	}
	const row = await database.boostProviderService.findUnique({
		where: { provider_serviceId: { provider: input.provider, serviceId: code } }
	});
	if (!row) {
		return {
			found: false,
			compatible: false,
			issues: [`No ${LABELS[input.provider]} service with code ${code} is in the latest snapshot.`],
			service: null
		};
	}
	const { blocking, advisory } = manualSelectionIssues(row, config, input.qualityTier ?? 'value');
	return {
		found: true,
		compatible: blocking.length === 0,
		issues: [...blocking, ...advisory],
		service: toCandidate(row)
	};
}

function tierScore(candidate: BoostMappingCandidate, qualityTier: string): number {
	const signals = new Set(candidate.qualitySignals);
	const refill = candidate.refillAdvertised ? 1 : 0;
	const stability = signals.has('stability_claim') || signals.has('refill_claim') ? 1 : 0;
	const quality = signals.has('quality_claim') ? 1 : 0;
	if (qualityTier === 'premium') return quality * 100 + stability * 40 + refill * 25;
	if (qualityTier === 'stable') return stability * 100 + refill * 40 + quality * 10;
	return 0;
}

export function rankSmartBoostCandidates(
	candidates: BoostMappingCandidate[],
	qualityTier: string,
	limit = 4,
	selectionOffset = 0
): BoostMappingCandidate[] {
	const eligible = candidates.filter((candidate) => {
		if (!Number.isFinite(candidate.ratePerThousand) || candidate.ratePerThousand <= 0) return false;
		const signals = new Set(candidate.qualitySignals);
		const hasStabilityEvidence =
			candidate.refillAdvertised || signals.has('stability_claim') || signals.has('refill_claim');
		if (qualityTier === 'premium') {
			return signals.has('quality_claim') && hasStabilityEvidence;
		}
		if (qualityTier === 'stable') {
			return hasStabilityEvidence;
		}
		return true;
	});
	const ranked = [...eligible].sort((left, right) => {
		const signalDifference = tierScore(right, qualityTier) - tierScore(left, qualityTier);
		return (
			signalDifference ||
			left.ratePerThousand - right.ratePerThousand ||
			left.id.localeCompare(right.id)
		);
	});
	if (ranked.length === 0) return [];

	// Refreshing moves to the next sensible price cluster, rather than randomly mixing cheap and
	// expensive services. Every returned route remains within 60% of the cluster's lowest rate.
	const normalizedOffset = Number.isFinite(selectionOffset)
		? Math.abs(Math.trunc(selectionOffset)) % ranked.length
		: 0;
	const anchor = ranked[normalizedOffset];
	const maximumClusterRate = anchor.ratePerThousand * SMART_AUTO_MAX_PRICE_RATIO;
	const priceCluster = ranked.filter(
		(candidate) =>
			candidate.ratePerThousand >= anchor.ratePerThousand &&
			candidate.ratePerThousand <= maximumClusterRate
	);
	const orderedCluster = [
		anchor,
		...priceCluster.filter((candidate) => candidate.id !== anchor.id)
	];
	const selected: BoostMappingCandidate[] = [];
	selected.push(anchor);
	for (const provider of ['smm_raja', 'bulk_follows'] as const) {
		if (provider === anchor.provider) continue;
		const candidate = orderedCluster.find((row) => row.provider === provider);
		if (candidate) selected.push(candidate);
	}
	for (const candidate of orderedCluster) {
		if (selected.length >= limit) break;
		if (!selected.some((row) => row.id === candidate.id)) selected.push(candidate);
	}
	return selected.slice(0, Math.max(1, limit));
}

export async function recommendBoostProviderServices(
	input: {
		categoryId: string;
		qualityTier: string;
		limit?: number;
		maximumRatePerThousand?: number;
		selectionOffset?: number;
	},
	database: PrismaClient = prisma
): Promise<BoostMappingCandidate[]> {
	const config = await loadCategory(database, input.categoryId);
	if (!config) return [];
	const rows = await database.boostProviderService.findMany({
		where: {
			platforms: { has: config.platform },
			outcomes: { has: config.actionType },
			targetType: getRequiredLinkType(config.actionType),
			unavailableAt: null,
			catalogueStatus: 'ready_for_review',
			ratePerThousand:
				Number.isFinite(input.maximumRatePerThousand) && input.maximumRatePerThousand! > 0
					? { not: null, lte: input.maximumRatePerThousand }
					: { not: null },
			minQuantity: { lte: config.minQuantity },
			maxQuantity: { gte: Math.max(...getQuantityChips(config)) }
		},
		orderBy: [{ ratePerThousand: 'asc' }, { name: 'asc' }],
		take: 250
	});
	return rankSmartBoostCandidates(
		rows
			.filter((row) => !isAutomaticOnlyUnsafe(row, config.platform, config.actionType))
			.map(toCandidate)
			.filter((row): row is BoostMappingCandidate => Boolean(row)),
		input.qualityTier,
		input.limit ?? 4,
		input.selectionOffset ?? 0
	);
}
