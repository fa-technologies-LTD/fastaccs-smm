import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { env } from '$env/dynamic/private';
import { BOOSTING_ACTION_TYPES } from '$lib/helpers/boosting-service-config';
import { getRequiredLinkType, type BoostingActionType } from '$lib/helpers/social-link-validator';
import { supportsBoostServiceInput } from '$lib/helpers/boosting-service-input';
import type {
	BoostSupplierChoice,
	BoostSupplierChoices
} from '$lib/helpers/boosting-supplier-choice';
import {
	inferAdvertisedRefillDays,
	isThreadsService,
	serviceMatchesBoostOutcome
} from './catalog-normalizer';
import { parseBoostServiceId } from './service-id';

type Database = PrismaClient | Prisma.TransactionClient;
export type ChoiceService = Prisma.BoostProviderServiceGetPayload<{
	include: { providerState: true };
}>;
type Identity = { platform: string; outcome: string };

/** Version of the facts the owner sees, never a client-supplied quote or approval. */
export function supplierChoiceRevision(service: ChoiceService) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				service.id,
				service.provider,
				service.serviceId,
				service.name,
				service.providerType,
				String(service.ratePerThousand),
				service.minQuantity,
				service.maxQuantity,
				service.platforms,
				service.outcomes,
				service.targetType,
				service.unavailableAt,
				service.catalogueStatus,
				service.refillAdvertised,
				service.description
			])
		)
		.digest('hex');
}

export function supplierChoice(service: ChoiceService, identity: Identity): BoostSupplierChoice {
	const issues: string[] = [];
	if (!BOOSTING_ACTION_TYPES.includes(identity.outcome as never))
		issues.push('Checkout does not support this result yet.');
	if (!['smm_raja', 'bulk_follows'].includes(service.provider))
		issues.push('Unsupported supplier.');
	if (
		!service.platforms.includes(identity.platform) ||
		(identity.platform !== 'threads' && isThreadsService(service))
	)
		issues.push('This service is for a different platform.');
	if (
		!service.outcomes.includes(identity.outcome) ||
		!serviceMatchesBoostOutcome(service, identity.outcome)
	)
		issues.push('This service delivers a different result.');
	if (
		!supportsBoostServiceInput(service.providerType, identity.outcome) ||
		service.targetType !== getRequiredLinkType(identity.outcome as BoostingActionType)
	)
		issues.push('This service requires inputs this checkout cannot accept.');
	if (
		service.unavailableAt ||
		!['ready_for_review', 'needs_classification'].includes(service.catalogueStatus)
	)
		issues.push('This supplier service is unavailable.');
	if (!(Number(service.ratePerThousand) > 0) || service.ratePerThousand == null)
		issues.push('The supplier price is missing.');
	if (!service.minQuantity || !service.maxQuantity || service.minQuantity > service.maxQuantity)
		issues.push('The supplier quantity limits are missing or invalid.');
	const age = Date.now() - service.lastSeenAt.getTime();
	if (age < 0 || age > Math.max(5, Number(env.BOOSTING_CATALOG_MAX_AGE_MINUTES) || 390) * 60000)
		issues.push('Supplier costs need refreshing before selecting this service.');
	const publicationIssues: string[] = [];
	const state = service.providerState;
	if (!state?.enabled || state.circuitOpen || state.currency?.toUpperCase() !== 'USD')
		publicationIssues.push('The supplier account is paused or its currency is unsupported.');
	for (const [date, minutes, message] of [
		[
			state?.lastCatalogueSuccessAt,
			Number(env.BOOSTING_CATALOG_MAX_AGE_MINUTES) || 390,
			'Supplier catalogue information needs refreshing.'
		],
		[
			state?.lastBalanceSuccessAt,
			Number(env.BOOSTING_BALANCE_MAX_AGE_MINUTES) || 390,
			'Supplier balance information needs refreshing.'
		]
	] as const) {
		const age = date ? Date.now() - date.getTime() : Infinity;
		if (age < 0 || age > Math.max(5, minutes) * 60000) publicationIssues.push(message);
	}
	return {
		providerServiceId: service.id,
		provider: service.provider as BoostSupplierChoice['provider'],
		serviceId: service.serviceId,
		name: service.name,
		rateUsd: service.ratePerThousand == null ? null : Number(service.ratePerThousand),
		min: service.minQuantity,
		max: service.maxQuantity,
		checkedAt: service.lastSeenAt.toISOString(),
		issues,
		publicationIssues,
		revision: supplierChoiceRevision(service),
		refillAdvertised: service.refillAdvertised === true,
		refillDaysClaimed: inferAdvertisedRefillDays(
			`${service.name} ${service.category} ${service.description ?? ''}`
		)
	};
}

/** Manual browse/search of the stored catalogue. No ranking, auto-selection or provider calls. */
export async function loadBoostSupplierChoices(
	identity: Identity,
	input: { provider?: string; search?: string },
	database: Database
): Promise<BoostSupplierChoices> {
	const provider = input.provider && input.provider !== 'all' ? input.provider : undefined;
	const search = (input.search ?? '')
		.trim()
		.replace(/^#/, '')
		.replace(/^S(?=\d)/, 's');
	const exactCode = provider
		? parseBoostServiceId(provider as BoostSupplierChoice['provider'], search)
		: null;
	const rows = await database.boostProviderService.findMany({
		where: {
			provider: provider ? provider : { in: ['smm_raja', 'bulk_follows'] },
			...(exactCode
				? { serviceId: exactCode }
				: {
						platforms: { has: identity.platform },
						outcomes: { has: identity.outcome },
						...(search
							? {
									OR: [
										{ name: { contains: search, mode: 'insensitive' } },
										{ serviceId: { equals: search } }
									]
								}
							: {})
					})
		},
		include: { providerState: true },
		orderBy: [{ name: 'asc' }, { id: 'asc' }],
		take: 31
	});
	return {
		services: rows.slice(0, 30).map((service) => supplierChoice(service, identity)),
		hasMore: rows.length > 30
	};
}
