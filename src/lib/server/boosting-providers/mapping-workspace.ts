import { Prisma, type PrismaClient } from '@prisma/client';
import { env } from '$env/dynamic/private';
import {
	computeBoostingPrice,
	getBoostingServiceConfig,
	getQuantityChips
} from '$lib/helpers/boosting-service-config';
import type {
	BoostMappingCandidate,
	BoostMappingOfferDraft,
	BoostMappingRouteDraft,
	BoostMappingSaveInput,
	BoostMappingWorkspace
} from '$lib/helpers/boosting-mapping-types';
import { getRequiredLinkType } from '$lib/helpers/social-link-validator';
import { prisma } from '$lib/prisma';

const CANDIDATE_LIMIT = 80;
const PROVIDER_LABELS = { smm_raja: 'SMM Raja', bulk_follows: 'BulkFollows' } as const;

export class BoostMappingError extends Error {
	constructor(
		message: string,
		readonly status = 400,
		readonly code = 'invalid_mapping'
	) {
		super(message);
		this.name = 'BoostMappingError';
	}
}

export function isBoostFoundationMissing(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		(error.code === 'P2021' || error.code === 'P2022')
	);
}

function configuredFxRate(): number {
	const value = Number(env.BOOSTING_USD_NGN_RATE || env.HUBMAN_USD_NGN_RATE || 1700);
	return Number.isFinite(value) && value > 0 ? value : 1700;
}

function configuredCurrencyBufferPercent(): number {
	const value = Number(env.BOOSTING_CURRENCY_BUFFER_PERCENT || 5);
	return Number.isFinite(value) && value >= 0 ? value : 5;
}

function asNumber(value: Prisma.Decimal | number | null): number | null {
	if (value === null) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function safeSearch(value: string | null | undefined): string {
	return String(value || '')
		.trim()
		.slice(0, 80);
}

function offerDto(offer: {
	id: string;
	qualityTier: string;
	customerName: string;
	shortPromise: string;
	minimumMarginPercent: Prisma.Decimal;
	normalCostTargetNgn: Prisma.Decimal;
	maximumSupplierCostNgn: Prisma.Decimal;
	attemptCap: number;
	status: string;
	routingPolicy: string;
	preferredRoute?: { providerServiceId: string } | null;
	lockedRoute?: { providerServiceId: string } | null;
}): BoostMappingWorkspace['offer'] {
	return {
		id: offer.id,
		qualityTier: offer.qualityTier,
		customerName: offer.customerName,
		shortPromise: offer.shortPromise,
		minimumMarginPercent: Number(offer.minimumMarginPercent),
		normalCostTargetNgn: Number(offer.normalCostTargetNgn),
		maximumSupplierCostNgn: Number(offer.maximumSupplierCostNgn),
		attemptCap: offer.attemptCap,
		status: offer.status === 'reviewed' ? 'reviewed' : 'hidden',
		routingPolicy:
			offer.routingPolicy === 'preferred' || offer.routingPolicy === 'locked'
				? offer.routingPolicy
				: 'automatic',
		preferredProviderServiceId: offer.preferredRoute?.providerServiceId ?? null,
		lockedProviderServiceId: offer.lockedRoute?.providerServiceId ?? null
	};
}

function routeDto(route: {
	id: string;
	providerServiceId: string;
	state: string;
	equivalenceApproved: boolean;
	verifiedSignals: string[];
	audienceTags: string[];
	verifiedRefillDays: number | null;
	maximumPilotQuantity: number | null;
	expectedRecoveryCostPercent: Prisma.Decimal;
}): BoostMappingCandidate['mappedRoute'] {
	return {
		id: route.id,
		providerServiceId: route.providerServiceId,
		state: route.state === 'enabled' || route.state === 'paused' ? route.state : 'shadow',
		equivalenceApproved: route.equivalenceApproved,
		verifiedSignals: route.verifiedSignals,
		audienceTags: route.audienceTags,
		verifiedRefillDays: route.verifiedRefillDays,
		maximumPilotQuantity: route.maximumPilotQuantity,
		expectedRecoveryCostPercent: Number(route.expectedRecoveryCostPercent)
	};
}

export async function loadBoostMappingWorkspace(
	categoryId: string,
	options: { search?: string; database?: PrismaClient } = {}
): Promise<BoostMappingWorkspace> {
	const database = options.database ?? prisma;
	const category = await database.category.findFirst({
		where: { id: categoryId, categoryType: 'boosting_service' },
		select: { id: true, name: true, description: true, metadata: true }
	});
	if (!category) throw new BoostMappingError('Boosting offer not found.', 404, 'not_found');

	const config = getBoostingServiceConfig(category.metadata);
	const targetType = getRequiredLinkType(config.actionType);
	const categoryDto: BoostMappingWorkspace['category'] = {
		id: category.id,
		name: category.name,
		platform: config.platform,
		outcome: config.actionType,
		minQuantity: config.minQuantity,
		stepQuantity: config.stepQuantity,
		pricePerStepNgn: config.pricePerStep,
		refillDays: config.refillDays
	};

	try {
		const offer = await database.boostCustomerOffer.findUnique({
			where: { categoryId },
			include: {
				preferredRoute: { select: { providerServiceId: true } },
				lockedRoute: { select: { providerServiceId: true } },
				routes: { where: { state: { not: 'paused' } } }
			}
		});
		const mappedByServiceId = new Map(
			(offer?.routes ?? []).map((route) => [route.providerServiceId, routeDto(route)])
		);
		const mappedServiceIds = [...mappedByServiceId.keys()];
		const search = safeSearch(options.search);
		const baseWhere: Prisma.BoostProviderServiceWhereInput = {
			platforms: { has: config.platform },
			outcomes: { has: config.actionType },
			targetType,
			unavailableAt: null,
			catalogueStatus: { not: 'quarantined' },
			ratePerThousand: { not: null },
			minQuantity: { not: null },
			maxQuantity: { not: null }
		};
		const searchWhere: Prisma.BoostProviderServiceWhereInput | undefined = search
			? {
					OR: [
						{ name: { contains: search, mode: 'insensitive' } },
						{ category: { contains: search, mode: 'insensitive' } },
						{ serviceId: { contains: search, mode: 'insensitive' } }
					]
				}
			: undefined;
		const [candidateCount, matchedServices, mappedServices] = await Promise.all([
			database.boostProviderService.count({
				where: { AND: [baseWhere, ...(searchWhere ? [searchWhere] : [])] }
			}),
			database.boostProviderService.findMany({
				where: { AND: [baseWhere, ...(searchWhere ? [searchWhere] : [])] },
				orderBy: [{ catalogueStatus: 'asc' }, { ratePerThousand: 'asc' }, { name: 'asc' }],
				take: CANDIDATE_LIMIT
			}),
			mappedServiceIds.length
				? database.boostProviderService.findMany({ where: { id: { in: mappedServiceIds } } })
				: Promise.resolve([])
		]);
		// Always retain already-mapped services even when a search or the 80-row review window would
		// otherwise hide them. A harmless search must never make a saved route disappear on next save.
		const services = [
			...mappedServices,
			...matchedServices.filter(
				(service) => !mappedServices.some((mapped) => mapped.id === service.id)
			)
		];

		const candidates: BoostMappingCandidate[] = services.flatMap((service) => {
			const ratePerThousand = asNumber(service.ratePerThousand);
			if (
				ratePerThousand === null ||
				service.minQuantity === null ||
				service.maxQuantity === null ||
				!(service.provider in PROVIDER_LABELS)
			) {
				return [];
			}
			const provider = service.provider as keyof typeof PROVIDER_LABELS;
			return [
				{
					id: service.id,
					provider,
					providerLabel: PROVIDER_LABELS[provider],
					serviceId: service.serviceId,
					name: service.name,
					category: service.category,
					providerType: service.providerType,
					ratePerThousand,
					minQuantity: service.minQuantity,
					maxQuantity: service.maxQuantity,
					refillAdvertised: service.refillAdvertised,
					cancelAdvertised: service.cancelAdvertised,
					dripfeedAdvertised: service.dripfeedAdvertised,
					qualitySignals: service.qualitySignals,
					catalogueStatus: service.catalogueStatus,
					lastSeenAt: service.lastSeenAt.toISOString(),
					mappedRoute: mappedByServiceId.get(service.id) ?? null
				}
			];
		});

		return {
			foundationReady: true,
			migrationMessage: null,
			category: categoryDto,
			offer: offer ? offerDto(offer) : null,
			candidates,
			candidateCount,
			configuredFxNgnPerUsd: configuredFxRate(),
			configuredCurrencyBufferPercent: configuredCurrencyBufferPercent()
		};
	} catch (error) {
		if (!isBoostFoundationMissing(error)) throw error;
		return {
			foundationReady: false,
			migrationMessage:
				'The Boosting foundation migration must be applied before supplier routes can be mapped.',
			category: categoryDto,
			offer: null,
			candidates: [],
			candidateCount: 0,
			configuredFxNgnPerUsd: configuredFxRate(),
			configuredCurrencyBufferPercent: configuredCurrencyBufferPercent()
		};
	}
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
		throw new BoostMappingError(`${label} must be between ${minimum} and ${maximum}.`);
	}
	return parsed;
}

function limitedText(value: unknown, label: string, minimum: number, maximum: number): string {
	const text = String(value || '').trim();
	if (text.length < minimum || text.length > maximum) {
		throw new BoostMappingError(`${label} must be ${minimum}–${maximum} characters.`);
	}
	return text;
}

function cleanStringList(value: unknown, maximumItems: number): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
		.slice(0, maximumItems)
		.map((item) => item.slice(0, 60));
}

function parseOffer(value: unknown): BoostMappingOfferDraft {
	const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	const qualityTier = String(input.qualityTier || 'value');
	if (!['value', 'stable', 'premium'].includes(qualityTier)) {
		throw new BoostMappingError('Choose a valid customer option.');
	}
	const status = input.status === 'reviewed' ? 'reviewed' : 'hidden';
	const routingPolicy = ['preferred', 'locked'].includes(String(input.routingPolicy))
		? (String(input.routingPolicy) as 'preferred' | 'locked')
		: 'automatic';
	return {
		qualityTier,
		customerName: limitedText(input.customerName, 'Customer name', 2, 80),
		shortPromise: limitedText(input.shortPromise, 'Short promise', 2, 120),
		minimumMarginPercent: finiteNumber(input.minimumMarginPercent, 'Minimum margin', 0, 95),
		normalCostTargetNgn: finiteNumber(
			input.normalCostTargetNgn,
			'Normal cost target',
			0,
			10_000_000
		),
		maximumSupplierCostNgn: finiteNumber(
			input.maximumSupplierCostNgn,
			'Maximum supplier cost',
			1,
			10_000_000
		),
		attemptCap: Math.round(finiteNumber(input.attemptCap, 'Attempt cap', 1, 2)),
		status,
		routingPolicy,
		preferredProviderServiceId: input.preferredProviderServiceId
			? String(input.preferredProviderServiceId)
			: null,
		lockedProviderServiceId: input.lockedProviderServiceId
			? String(input.lockedProviderServiceId)
			: null
	};
}

function parseRoutes(value: unknown): BoostMappingRouteDraft[] {
	if (!Array.isArray(value) || value.length > 20) {
		throw new BoostMappingError('Choose no more than 20 supplier routes.');
	}
	const routes = value.map((raw) => {
		const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
		const state: BoostMappingRouteDraft['state'] = ['enabled', 'paused'].includes(
			String(input.state)
		)
			? (String(input.state) as 'enabled' | 'paused')
			: 'shadow';
		const equivalenceApproved = input.equivalenceApproved === true;
		if (state === 'enabled' && !equivalenceApproved) {
			throw new BoostMappingError('A route must be promise-checked before it can be enabled.');
		}
		const maximumPilotQuantity =
			input.maximumPilotQuantity === null || input.maximumPilotQuantity === ''
				? null
				: Math.round(finiteNumber(input.maximumPilotQuantity, 'Pilot limit', 1, 10_000_000));
		if (state === 'enabled' && maximumPilotQuantity === null) {
			throw new BoostMappingError('Set a pilot quantity limit before enabling a supplier route.');
		}
		return {
			providerServiceId: limitedText(input.providerServiceId, 'Supplier service', 1, 100),
			state,
			equivalenceApproved,
			verifiedSignals: cleanStringList(input.verifiedSignals, 12),
			audienceTags: cleanStringList(input.audienceTags, 8),
			verifiedRefillDays:
				input.verifiedRefillDays === null || input.verifiedRefillDays === ''
					? null
					: Math.round(finiteNumber(input.verifiedRefillDays, 'Verified refill days', 1, 365)),
			maximumPilotQuantity,
			expectedRecoveryCostPercent: finiteNumber(
				input.expectedRecoveryCostPercent,
				'Recovery cost buffer',
				0,
				100
			)
		};
	});
	if (new Set(routes.map((route) => route.providerServiceId)).size !== routes.length) {
		throw new BoostMappingError('Each supplier service can only be mapped once.');
	}
	return routes;
}

function requiredSignalsForOffer(qualityTier: string, refillDays: number | null): string[] {
	return [
		...(refillDays ? ['refill_verified'] : []),
		...(qualityTier === 'stable' || qualityTier === 'premium' ? ['stability_verified'] : []),
		...(qualityTier === 'premium' ? ['premium_quality_verified'] : [])
	];
}

export async function saveBoostMappingWorkspace(
	categoryId: string,
	rawInput: unknown,
	actorUserId: string,
	options: { database?: PrismaClient } = {}
): Promise<void> {
	const database = options.database ?? prisma;
	const input =
		rawInput && typeof rawInput === 'object' ? (rawInput as Partial<BoostMappingSaveInput>) : {};
	const offerInput = parseOffer(input.offer);
	const routeInputs = parseRoutes(input.routes);
	const category = await database.category.findFirst({
		where: { id: categoryId, categoryType: 'boosting_service' },
		select: { id: true, metadata: true }
	});
	if (!category) throw new BoostMappingError('Boosting offer not found.', 404, 'not_found');
	const config = getBoostingServiceConfig(category.metadata);
	if (config.pricePerStep <= 0) {
		throw new BoostMappingError('Set a customer price before mapping supplier routes.');
	}
	const targetType = getRequiredLinkType(config.actionType);
	const minimumCustomerPrice = computeBoostingPrice(config, config.minQuantity);
	if (
		offerInput.normalCostTargetNgn > offerInput.maximumSupplierCostNgn ||
		offerInput.maximumSupplierCostNgn >= minimumCustomerPrice
	) {
		throw new BoostMappingError(
			'The normal cost must stay below the maximum cost, and the maximum cost must stay below the customer price.'
		);
	}

	const providerServiceIds = routeInputs.map((route) => route.providerServiceId);
	const providerServices = providerServiceIds.length
		? await database.boostProviderService.findMany({
				where: { id: { in: providerServiceIds } }
			})
		: [];
	if (providerServices.length !== providerServiceIds.length) {
		throw new BoostMappingError('One or more supplier services no longer exist.');
	}
	for (const service of providerServices) {
		if (
			service.unavailableAt ||
			service.catalogueStatus === 'quarantined' ||
			!service.platforms.includes(config.platform) ||
			!service.outcomes.includes(config.actionType) ||
			service.targetType !== targetType ||
			service.minQuantity === null ||
			service.maxQuantity === null ||
			(config.refillDays !== null && service.refillAdvertised !== true)
		) {
			throw new BoostMappingError('A selected supplier service is not safely compatible.');
		}
	}
	const routeByServiceId = new Map(routeInputs.map((route) => [route.providerServiceId, route]));
	const requiredVerifiedSignals = requiredSignalsForOffer(
		offerInput.qualityTier,
		config.refillDays
	);
	for (const route of routeInputs) {
		if (!route.equivalenceApproved || route.state === 'paused') continue;
		if (requiredVerifiedSignals.some((signal) => !route.verifiedSignals.includes(signal))) {
			throw new BoostMappingError('Recheck each mapped route after changing the customer promise.');
		}
		if (
			config.refillDays &&
			(route.verifiedRefillDays === null || route.verifiedRefillDays < config.refillDays)
		) {
			throw new BoostMappingError('The verified supplier refill must cover the customer promise.');
		}
	}
	if (
		offerInput.status === 'reviewed' &&
		!routeInputs.some((route) => route.state !== 'paused' && route.equivalenceApproved)
	) {
		throw new BoostMappingError(
			'Keep this offer hidden until at least one supplier route is promise-checked.'
		);
	}
	const policyServiceId =
		offerInput.routingPolicy === 'preferred'
			? offerInput.preferredProviderServiceId
			: offerInput.routingPolicy === 'locked'
				? offerInput.lockedProviderServiceId
				: null;
	if (policyServiceId) {
		const policyRoute = routeByServiceId.get(policyServiceId);
		if (!policyRoute || policyRoute.state !== 'enabled' || !policyRoute.equivalenceApproved) {
			throw new BoostMappingError(
				'Your preferred or locked service must be enabled and promise-checked.'
			);
		}
	} else if (offerInput.routingPolicy !== 'automatic') {
		throw new BoostMappingError('Choose the supplier service for this routing policy.');
	}

	await database.$transaction(async (tx) => {
		const offer = await tx.boostCustomerOffer.upsert({
			where: { categoryId },
			create: {
				categoryId,
				platform: config.platform,
				outcome: config.actionType,
				targetType,
				qualityTier: offerInput.qualityTier,
				customerName: offerInput.customerName,
				shortPromise: offerInput.shortPromise,
				expectationChips: [
					offerInput.qualityTier === 'value' ? 'Good value' : 'More stable',
					...(config.refillDays ? [`${config.refillDays}-day refill`] : [])
				],
				minQuantity: config.minQuantity,
				stepQuantity: config.stepQuantity,
				quantityPresets: getQuantityChips(config),
				pricePerStepNgn: config.pricePerStep,
				requiredVerifiedSignals,
				refillDays: config.refillDays,
				minimumMarginPercent: offerInput.minimumMarginPercent,
				normalCostTargetNgn: offerInput.normalCostTargetNgn,
				maximumSupplierCostNgn: offerInput.maximumSupplierCostNgn,
				attemptCap: offerInput.attemptCap,
				recoveryModes: offerInput.attemptCap > 1 ? ['retry_definitive_failure'] : [],
				status: offerInput.status,
				routingPolicy: offerInput.routingPolicy
			},
			update: {
				platform: config.platform,
				outcome: config.actionType,
				targetType,
				qualityTier: offerInput.qualityTier,
				customerName: offerInput.customerName,
				shortPromise: offerInput.shortPromise,
				expectationChips: [
					offerInput.qualityTier === 'value' ? 'Good value' : 'More stable',
					...(config.refillDays ? [`${config.refillDays}-day refill`] : [])
				],
				minQuantity: config.minQuantity,
				stepQuantity: config.stepQuantity,
				quantityPresets: getQuantityChips(config),
				pricePerStepNgn: config.pricePerStep,
				requiredVerifiedSignals,
				refillDays: config.refillDays,
				minimumMarginPercent: offerInput.minimumMarginPercent,
				normalCostTargetNgn: offerInput.normalCostTargetNgn,
				maximumSupplierCostNgn: offerInput.maximumSupplierCostNgn,
				attemptCap: offerInput.attemptCap,
				recoveryModes: offerInput.attemptCap > 1 ? ['retry_definitive_failure'] : [],
				status: offerInput.status,
				routingPolicy: offerInput.routingPolicy,
				preferredRouteId: null,
				lockedRouteId: null
			}
		});

		if (providerServiceIds.length) {
			await tx.boostServiceRoute.updateMany({
				where: { offerId: offer.id, providerServiceId: { notIn: providerServiceIds } },
				data: { state: 'paused' }
			});
		} else {
			await tx.boostServiceRoute.updateMany({
				where: { offerId: offer.id },
				data: { state: 'paused' }
			});
		}

		const savedRouteIds = new Map<string, string>();
		for (const routeInput of routeInputs) {
			const providerService = providerServices.find(
				(service) => service.id === routeInput.providerServiceId
			)!;
			const saved = await tx.boostServiceRoute.upsert({
				where: {
					offerId_providerServiceId: {
						offerId: offer.id,
						providerServiceId: providerService.id
					}
				},
				create: {
					offerId: offer.id,
					providerServiceId: providerService.id,
					state: routeInput.state,
					equivalenceApproved: routeInput.equivalenceApproved,
					targetType,
					verifiedSignals: routeInput.verifiedSignals,
					audienceTags: routeInput.audienceTags,
					verifiedRefillDays: routeInput.verifiedRefillDays,
					minimumQuantity: providerService.minQuantity!,
					maximumQuantity: providerService.maxQuantity!,
					maximumPilotQuantity: routeInput.maximumPilotQuantity,
					expectedRecoveryCostPercent: routeInput.expectedRecoveryCostPercent,
					reviewedByUserId: routeInput.equivalenceApproved ? actorUserId : null,
					reviewedAt: routeInput.equivalenceApproved ? new Date() : null
				},
				update: {
					state: routeInput.state,
					equivalenceApproved: routeInput.equivalenceApproved,
					targetType,
					verifiedSignals: routeInput.verifiedSignals,
					audienceTags: routeInput.audienceTags,
					verifiedRefillDays: routeInput.verifiedRefillDays,
					minimumQuantity: providerService.minQuantity!,
					maximumQuantity: providerService.maxQuantity!,
					maximumPilotQuantity: routeInput.maximumPilotQuantity,
					expectedRecoveryCostPercent: routeInput.expectedRecoveryCostPercent,
					reviewedByUserId: routeInput.equivalenceApproved ? actorUserId : null,
					reviewedAt: routeInput.equivalenceApproved ? new Date() : null
				}
			});
			savedRouteIds.set(providerService.id, saved.id);
		}

		await tx.boostCustomerOffer.update({
			where: { id: offer.id },
			data: {
				preferredRouteId:
					offerInput.routingPolicy === 'preferred' && offerInput.preferredProviderServiceId
						? (savedRouteIds.get(offerInput.preferredProviderServiceId) ?? null)
						: null,
				lockedRouteId:
					offerInput.routingPolicy === 'locked' && offerInput.lockedProviderServiceId
						? (savedRouteIds.get(offerInput.lockedProviderServiceId) ?? null)
						: null
			}
		});
		await tx.adminAuditLog.create({
			data: {
				actorUserId,
				action: 'boosting_mapping_saved',
				resourceType: 'boost_customer_offer',
				resourceId: offer.id,
				description: `Saved ${routeInputs.length} reviewed supplier route(s)`,
				metadata: {
					categoryId,
					routingPolicy: offerInput.routingPolicy,
					routeCount: routeInputs.length,
					offerStatus: offerInput.status
				}
			}
		});
	});
}
