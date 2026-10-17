import type { PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import type { BoostSupplierDetails } from '$lib/helpers/boosting-supplier-details';
import { inferAdvertisedRefillDays, supplierTextAdvertisesRefill } from './catalog-normalizer';

const providers = [
	{ id: 'smm_raja', label: 'SMM Raja' },
	{ id: 'bulk_follows', label: 'BulkFollows' }
] as const;

/** Inspection of stored records only: no provider calls, recommendations or writes. */
export async function loadBoostSupplierDetails(
	offerId: string,
	database: PrismaClient = prisma
): Promise<BoostSupplierDetails | null> {
	const offer = await database.boostCustomerOffer.findFirst({
		where: { id: offerId, category: { categoryType: 'boosting_service' } },
		select: {
			id: true,
			routes: {
				orderBy: { createdAt: 'asc' },
				select: {
					state: true,
					equivalenceApproved: true,
					verifiedRefillDays: true,
					verifiedSignals: true,
					reliabilityObservations: true,
					consecutiveFailures: true,
					providerService: {
						select: {
							id: true,
							provider: true,
							serviceId: true,
							name: true,
							category: true,
							description: true,
							ratePerThousand: true,
							minQuantity: true,
							maxQuantity: true,
							lastSeenAt: true,
							unavailableAt: true,
							catalogueStatus: true,
							refillAdvertised: true
						}
					}
				}
			}
		}
	});
	if (!offer) return null;
	const balances = await database.boostProviderState.findMany({
		where: { provider: { in: providers.map((p) => p.id) } },
		select: {
			provider: true,
			balance: true,
			currency: true,
			lastBalanceSuccessAt: true,
			enabled: true,
			circuitOpen: true
		}
	});
	return {
		offerId: offer.id,
		providers: providers.map((provider) => {
			const balance = balances.find((row) => row.provider === provider.id);
			return {
				...provider,
				balance: balance?.balance == null ? null : Number(balance.balance),
				currency: balance?.currency ?? null,
				balanceCheckedAt: balance?.lastBalanceSuccessAt?.toISOString() ?? null,
				enabled: balance?.enabled ?? null,
				healthPaused: balance?.circuitOpen ?? null,
				services: offer.routes
					.filter((route) => route.providerService.provider === provider.id)
					.map((route) => {
						const service = route.providerService;
						const text = `${service.name} ${service.category} ${service.description ?? ''}`;
						return {
							id: service.id,
							serviceId: service.serviceId,
							name: service.name,
							rateUsd: service.ratePerThousand == null ? null : Number(service.ratePerThousand),
							min: service.minQuantity,
							max: service.maxQuantity,
							lastSeenAt: service.lastSeenAt.toISOString(),
							unavailable:
								Boolean(service.unavailableAt) || service.catalogueStatus === 'quarantined',
							state: route.state,
							approved: route.equivalenceApproved,
							refillAdvertised:
								service.refillAdvertised === true || supplierTextAdvertisesRefill(text),
							refillDaysClaimed: inferAdvertisedRefillDays(text),
							recordedVerifiedRefillDays:
								route.verifiedSignals.includes('refill_verified') &&
								(route.verifiedRefillDays ?? 0) > 0
									? route.verifiedRefillDays
									: null,
							recordedObservations: route.reliabilityObservations,
							consecutiveFailures: route.consecutiveFailures
						};
					})
			};
		})
	};
}
