import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { getBoostingServiceConfig, getQuantityChips } from '$lib/helpers/boosting-service-config';
import type {
	BoostMappingCandidate,
	BoostServiceLookupResult
} from '$lib/helpers/boosting-mapping-types';
import { getRequiredLinkType } from '$lib/helpers/social-link-validator';
import type { BoostProviderId } from './types';
import {
	inferAdvertisedRefillDays,
	supplierTextAdvertisesRefill
} from './catalog-normalizer';

const LABELS: Record<BoostProviderId, string> = {
	smm_raja: 'SMM Raja',
	bulk_follows: 'BulkFollows'
};

type ServiceRow = Prisma.BoostProviderServiceGetPayload<Record<string, never>>;

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
		refillAdvertised: row.refillAdvertised === true || supplierTextAdvertisesRefill(refillText),
		refillDaysClaimed,
		cancelAdvertised: row.cancelAdvertised,
		dripfeedAdvertised: row.dripfeedAdvertised,
		qualitySignals: row.qualitySignals,
		catalogueStatus: row.catalogueStatus,
		lastSeenAt: row.lastSeenAt.toISOString(),
		mappedRoute: null
	};
}

function compatibilityIssues(
	row: ServiceRow,
	config: ReturnType<typeof getBoostingServiceConfig>
): string[] {
	const issues: string[] = [];
	const maximumPreset = Math.max(...getQuantityChips(config));
	if (row.unavailableAt) issues.push('The supplier no longer lists this service.');
	if (row.catalogueStatus === 'quarantined') issues.push('The supplier row failed catalogue safety checks.');
	if (!row.platforms.includes(config.platform)) issues.push('It is for a different platform.');
	if (!row.outcomes.includes(config.actionType)) issues.push('It delivers a different result.');
	if (row.targetType !== getRequiredLinkType(config.actionType)) {
		issues.push('It expects a different type of link.');
	}
	if (row.ratePerThousand === null) issues.push('The supplier price is missing.');
	if (row.minQuantity === null || row.minQuantity > config.minQuantity) {
		issues.push(`Its minimum is above ${config.minQuantity.toLocaleString()}.`);
	}
	if (row.maxQuantity === null || row.maxQuantity < maximumPreset) {
		issues.push(`It cannot cover the normal quantity range up to ${maximumPreset.toLocaleString()}.`);
	}
	return issues;
}

async function loadCategory(database: PrismaClient, categoryId: string) {
	const category = await database.category.findFirst({
		where: { id: categoryId, categoryType: 'boosting_service' },
		select: { metadata: true }
	});
	return category ? getBoostingServiceConfig(category.metadata) : null;
}

export async function lookupBoostProviderService(
	input: { categoryId: string; provider: BoostProviderId; serviceCode: string },
	database: PrismaClient = prisma
): Promise<BoostServiceLookupResult> {
	const config = await loadCategory(database, input.categoryId);
	if (!config) return { found: false, compatible: false, issues: ['Customer result not found.'], service: null };
	const code = String(input.serviceCode || '').trim();
	if (!/^\d{1,20}$/.test(code)) {
		return { found: false, compatible: false, issues: ['Enter the numeric supplier service code.'], service: null };
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
	const issues = compatibilityIssues(row, config);
	return { found: true, compatible: issues.length === 0, issues, service: toCandidate(row) };
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
	limit = 4
): BoostMappingCandidate[] {
	const ranked = [...candidates].sort((left, right) => {
		const signalDifference = tierScore(right, qualityTier) - tierScore(left, qualityTier);
		return signalDifference || left.ratePerThousand - right.ratePerThousand || left.id.localeCompare(right.id);
	});
	const selected: BoostMappingCandidate[] = [];
	for (const provider of ['smm_raja', 'bulk_follows'] as const) {
		const candidate = ranked.find((row) => row.provider === provider);
		if (candidate) selected.push(candidate);
	}
	for (const candidate of ranked) {
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
		rows.map(toCandidate).filter((row): row is BoostMappingCandidate => Boolean(row)),
		input.qualityTier,
		input.limit ?? 4
	);
}
