import { Prisma, type PrismaClient } from '@prisma/client';
import { getBoostingServiceConfig, getQuantityChips } from '$lib/helpers/boosting-service-config';
import type {
	BoostMappingCandidate,
	BoostMappingOfferDraft,
	BoostMappingRouteDraft,
	BoostMappingSaveInput,
	BoostMappingWorkspace
} from '$lib/helpers/boosting-mapping-types';
import { getRequiredLinkType } from '$lib/helpers/social-link-validator';
import { roundCatalogPriceNgn } from '$lib/helpers/catalog-pricing';
import { prisma } from '$lib/prisma';
import { BOOSTING_MANAGED_STOREFRONT_KEY } from './storefront-rollout';
import { getBoostingPricingConfig } from '$lib/services/boosting-pricing';
import { inferAdvertisedRefillDays, supplierTextAdvertisesRefill } from './catalog-normalizer';

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
	refillDays: number | null;
	minQuantity: number;
	maxQuantity: number | null;
	stepQuantity: number;
	pricePerStepNgn: Prisma.Decimal;
	priceLocked: boolean;
	minimumMarginPercent: Prisma.Decimal;
	normalCostTargetNgn: Prisma.Decimal;
	maximumSupplierCostNgn: Prisma.Decimal;
	attemptCap: number;
	recoveryModes: string[];
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
		refillDays: offer.refillDays,
		minQuantity: offer.minQuantity,
		maxQuantity: offer.maxQuantity,
		stepQuantity: offer.stepQuantity,
		pricePerStepNgn: Number(offer.pricePerStepNgn),
		priceLocked: offer.priceLocked,
		minimumMarginPercent: Number(offer.minimumMarginPercent),
		normalCostTargetNgn: Number(offer.normalCostTargetNgn),
		maximumSupplierCostNgn: Number(offer.maximumSupplierCostNgn),
		attemptCap: offer.attemptCap,
		fallbackMode: offer.recoveryModes.includes('fallback_automatic')
			? 'automatic'
			: offer.recoveryModes.includes('fallback_manual')
				? 'manual'
				: 'none',
		status: offer.status === 'live' ? 'live' : offer.status === 'reviewed' ? 'reviewed' : 'hidden',
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
	options: { search?: string; qualityTier?: string; database?: PrismaClient } = {}
): Promise<BoostMappingWorkspace> {
	const database = options.database ?? prisma;
	const category = await database.category.findFirst({
		where: { id: categoryId, categoryType: 'boosting_service' },
		select: { id: true, name: true, description: true, metadata: true }
	});
	if (!category) throw new BoostMappingError('Boosting offer not found.', 404, 'not_found');

	const config = getBoostingServiceConfig(category.metadata);
	const targetType = getRequiredLinkType(config.actionType);
	const selectedQualityTier = ['value', 'stable', 'premium'].includes(String(options.qualityTier))
		? (String(options.qualityTier) as 'value' | 'stable' | 'premium')
		: 'value';
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
	const pricing = await getBoostingPricingConfig(database);

	try {
		const offer = await database.boostCustomerOffer.findUnique({
			where: {
				categoryId_qualityTier_audienceTag: {
					categoryId,
					qualityTier: selectedQualityTier,
					audienceTag: 'general'
				}
			},
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
			search
				? database.boostProviderService.findMany({
						where: { AND: [baseWhere, searchWhere!] },
						orderBy: [{ catalogueStatus: 'asc' }, { ratePerThousand: 'asc' }, { name: 'asc' }],
						take: CANDIDATE_LIMIT
					})
				: Promise.resolve([]),
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
			const refillText = `${service.name} ${service.category} ${service.description ?? ''}`;
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
					refillAdvertised:
						service.refillAdvertised === true || supplierTextAdvertisesRefill(refillText),
					refillDaysClaimed: inferAdvertisedRefillDays(refillText),
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
			selectedQualityTier,
			category: categoryDto,
			offer: offer ? offerDto(offer) : null,
			candidates,
			candidateCount,
			configuredFxNgnPerUsd: pricing.usdNgnRate,
			configuredCurrencyBufferPercent: pricing.currencyBufferPercent,
			configuredDefaultMarginPercent: pricing.defaultMarginPercent
		};
	} catch (error) {
		if (!isBoostFoundationMissing(error)) throw error;
		return {
			foundationReady: false,
			migrationMessage:
				'The Boosting foundation migration must be applied before supplier routes can be mapped.',
			selectedQualityTier,
			category: categoryDto,
			offer: null,
			candidates: [],
			candidateCount: 0,
			configuredFxNgnPerUsd: pricing.usdNgnRate,
			configuredCurrencyBufferPercent: pricing.currencyBufferPercent,
			configuredDefaultMarginPercent: pricing.defaultMarginPercent
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
	const status = ['reviewed', 'live'].includes(String(input.status))
		? (String(input.status) as 'reviewed' | 'live')
		: 'hidden';
	const routingPolicy = ['preferred', 'locked'].includes(String(input.routingPolicy))
		? (String(input.routingPolicy) as 'preferred' | 'locked')
		: 'automatic';
	return {
		qualityTier,
		customerName: limitedText(input.customerName, 'Customer name', 2, 80),
		shortPromise: limitedText(input.shortPromise, 'Short promise', 2, 120),
		refillDays:
			input.refillDays === null || input.refillDays === '' || input.refillDays === undefined
				? null
				: Math.round(finiteNumber(input.refillDays, 'Refill period', 1, 365)),
		minQuantity: Math.round(finiteNumber(input.minQuantity, 'Starting quantity', 1, 10_000_000)),
		// The customer ceiling belongs to the selected supplier routes, not the browser. It is
		// derived after those routes have been loaded and checked below. Ignoring the echoed value
		// also prevents a previously saved supplier maximum from failing stale client validation.
		maxQuantity: null,
		stepQuantity: Math.round(finiteNumber(input.stepQuantity, 'Quantity increment', 1, 10_000_000)),
		pricePerStepNgn: Math.max(
			50,
			Math.round(finiteNumber(input.pricePerStepNgn, 'Customer price', 50, 10_000_000) / 50) * 50
		),
		priceLocked: input.priceLocked === true,
		minimumMarginPercent: finiteNumber(input.minimumMarginPercent, 'Profit percentage', 0, 500),
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
		attemptCap: Math.round(finiteNumber(input.attemptCap, 'Attempt cap', 1, 4)),
		fallbackMode:
			input.fallbackMode === 'automatic' || input.fallbackMode === 'manual'
				? input.fallbackMode
				: 'none',
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

function expectationChipsForOffer(_qualityTier: string, refillDays: number | null): string[] {
	return refillDays ? [`${refillDays}-day refill protection`] : [];
}

function verifiedSignalLabel(signal: string): string {
	if (signal === 'refill_verified') return 'the promised refill period';
	if (signal === 'premium_quality_verified') return 'premium-quality evidence';
	return 'stability evidence';
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
	const targetType = getRequiredLinkType(config.actionType);
	const minimumCustomerPrice = roundCatalogPriceNgn(
		(offerInput.minQuantity / offerInput.stepQuantity) * offerInput.pricePerStepNgn
	);
	if (offerInput.normalCostTargetNgn > offerInput.maximumSupplierCostNgn) {
		throw new BoostMappingError(
			'This customer price is too low for the chosen supplier cost and profit percentage. Increase the price or reduce the profit percentage.'
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
	const routeByServiceId = new Map(routeInputs.map((route) => [route.providerServiceId, route]));
	if (offerInput.routingPolicy === 'preferred' && offerInput.preferredProviderServiceId) {
		const primary = providerServices.find(
			(service) => service.id === offerInput.preferredProviderServiceId
		);
		const primaryRate = Number(primary?.ratePerThousand);
		if (
			!primary ||
			!Number.isFinite(primaryRate) ||
			providerServices.some(
				(service) => service.id !== primary.id && Number(service.ratePerThousand) > primaryRate
			)
		) {
			throw new BoostMappingError(
				'Every fallback must cost the same as the primary service or less.'
			);
		}
	}
	for (const service of providerServices) {
		if (
			service.unavailableAt ||
			service.catalogueStatus === 'quarantined' ||
			service.ratePerThousand === null ||
			!Number.isFinite(Number(service.ratePerThousand)) ||
			Number(service.ratePerThousand) < 0 ||
			!service.platforms.includes(config.platform) ||
			!service.outcomes.includes(config.actionType) ||
			service.targetType !== targetType ||
			service.minQuantity === null ||
			service.maxQuantity === null
		) {
			throw new BoostMappingError('A selected supplier service is not safely compatible.');
		}
		if (offerInput.refillDays !== null) {
			const route = routeByServiceId.get(service.id);
			const supplierStatesRefill =
				service.refillAdvertised === true ||
				supplierTextAdvertisesRefill(
					`${service.name} ${service.category} ${service.description ?? ''}`
				);
			const ownerVerifiedRefill =
				route?.equivalenceApproved === true &&
				route.verifiedSignals.includes('refill_verified') &&
				route.verifiedRefillDays !== null &&
				route.verifiedRefillDays >= offerInput.refillDays;
			if (!supplierStatesRefill && !ownerVerifiedRefill) {
				throw new BoostMappingError(
					'The selected service needs supplier-listed or owner-tested refill protection.'
				);
			}
		}
	}
	const supportsStartingQuantity = (service: (typeof providerServices)[number]) =>
		service.minQuantity !== null &&
		service.maxQuantity !== null &&
		offerInput.minQuantity >= service.minQuantity &&
		offerInput.minQuantity <= service.maxQuantity;
	const primaryProviderServiceId =
		offerInput.routingPolicy === 'preferred'
			? offerInput.preferredProviderServiceId
			: offerInput.routingPolicy === 'locked'
				? offerInput.lockedProviderServiceId
				: null;
	const startingRoutes = primaryProviderServiceId
		? providerServices.filter((service) => service.id === primaryProviderServiceId)
		: providerServices;
	if (startingRoutes.length && !startingRoutes.some(supportsStartingQuantity)) {
		throw new BoostMappingError(
			'The customer starting quantity is outside the selected primary supplier range.'
		);
	}
	if (providerServices.some((service) => !supportsStartingQuantity(service))) {
		throw new BoostMappingError(
			'Every selected supplier service must support the customer starting quantity.'
		);
	}
	const maximumCustomerQuantity = providerServices.length
		? Math.max(...providerServices.map((service) => service.maxQuantity!))
		: null;
	offerInput.maxQuantity = maximumCustomerQuantity;
	if (providerServices.length) {
		const pricing = await getBoostingPricingConfig(database);
		const highestSupplierCost = Math.max(
			...providerServices.map(
				(service) =>
					(Number(service.ratePerThousand) * offerInput.minQuantity * pricing.usdNgnRate) / 1000
			)
		);
		const allowedSupplierCost = Math.max(
			1,
			Math.floor(minimumCustomerPrice / (1 + Math.max(0, offerInput.minimumMarginPercent) / 100))
		);
		if (!Number.isFinite(highestSupplierCost) || highestSupplierCost > allowedSupplierCost) {
			throw new BoostMappingError(
				'This customer price is too low for the chosen supplier cost and profit percentage. Increase the price or reduce the profit percentage.'
			);
		}
		// These safety values are derived from the live, reviewed supplier rows. Never trust a
		// browser-supplied ceiling that could silently weaken the margin guard.
		offerInput.normalCostTargetNgn = Math.max(1, Math.ceil(highestSupplierCost));
		offerInput.maximumSupplierCostNgn = allowedSupplierCost;
	}
	const offerQuantityConfig = {
		...config,
		minQuantity: offerInput.minQuantity,
		stepQuantity: offerInput.stepQuantity
	};
	const requiredVerifiedSignals = requiredSignalsForOffer(
		offerInput.qualityTier,
		offerInput.refillDays
	);
	for (const route of routeInputs) {
		if (!route.equivalenceApproved || route.state === 'paused') continue;
		const missingSignals = requiredVerifiedSignals.filter(
			(signal) => !route.verifiedSignals.includes(signal)
		);
		if (missingSignals.length) {
			const service = providerServices.find(
				(candidate) => candidate.id === route.providerServiceId
			);
			const providerLabel =
				service && service.provider in PROVIDER_LABELS
					? PROVIDER_LABELS[service.provider as keyof typeof PROVIDER_LABELS]
					: 'The selected supplier';
			const serviceLabel = service ? `${providerLabel} #${service.serviceId}` : providerLabel;
			throw new BoostMappingError(
				`${serviceLabel} is missing ${missingSignals.map(verifiedSignalLabel).join(' and ')} for this customer choice. Remove it or choose a compatible service.`
			);
		}
		if (
			offerInput.refillDays &&
			(route.verifiedRefillDays === null || route.verifiedRefillDays < offerInput.refillDays)
		) {
			throw new BoostMappingError('The verified supplier refill must cover the customer promise.');
		}
	}
	if (
		offerInput.status !== 'hidden' &&
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
		if (!policyRoute || policyRoute.state === 'paused' || !policyRoute.equivalenceApproved) {
			throw new BoostMappingError(
				'Your preferred or locked service must be active for shadow review and promise-checked.'
			);
		}
	} else if (offerInput.routingPolicy !== 'automatic') {
		throw new BoostMappingError('Choose the supplier service for this routing policy.');
	}

	await database.$transaction(async (tx) => {
		const offer = await tx.boostCustomerOffer.upsert({
			where: {
				categoryId_qualityTier_audienceTag: {
					categoryId,
					qualityTier: offerInput.qualityTier,
					audienceTag: 'general'
				}
			},
			create: {
				categoryId,
				audienceTag: 'general',
				platform: config.platform,
				outcome: config.actionType,
				targetType,
				qualityTier: offerInput.qualityTier,
				customerName: offerInput.customerName,
				shortPromise: offerInput.shortPromise,
				expectationChips: expectationChipsForOffer(offerInput.qualityTier, offerInput.refillDays),
				minQuantity: offerInput.minQuantity,
				maxQuantity: offerInput.maxQuantity,
				stepQuantity: offerInput.stepQuantity,
				quantityPresets: getQuantityChips(offerQuantityConfig, offerInput.maxQuantity),
				pricePerStepNgn: offerInput.pricePerStepNgn,
				priceLocked: offerInput.priceLocked,
				requiredVerifiedSignals,
				refillDays: offerInput.refillDays,
				minimumMarginPercent: offerInput.minimumMarginPercent,
				normalCostTargetNgn: offerInput.normalCostTargetNgn,
				maximumSupplierCostNgn: offerInput.maximumSupplierCostNgn,
				attemptCap: offerInput.attemptCap,
				recoveryModes:
					offerInput.attemptCap > 1
						? [
								'retry_definitive_failure',
								...(offerInput.fallbackMode === 'none'
									? []
									: [`fallback_${offerInput.fallbackMode}`])
							]
						: [],
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
				expectationChips: expectationChipsForOffer(offerInput.qualityTier, offerInput.refillDays),
				minQuantity: offerInput.minQuantity,
				maxQuantity: offerInput.maxQuantity,
				stepQuantity: offerInput.stepQuantity,
				quantityPresets: getQuantityChips(offerQuantityConfig, offerInput.maxQuantity),
				pricePerStepNgn: offerInput.pricePerStepNgn,
				priceLocked: offerInput.priceLocked,
				requiredVerifiedSignals,
				refillDays: offerInput.refillDays,
				minimumMarginPercent: offerInput.minimumMarginPercent,
				normalCostTargetNgn: offerInput.normalCostTargetNgn,
				maximumSupplierCostNgn: offerInput.maximumSupplierCostNgn,
				attemptCap: offerInput.attemptCap,
				recoveryModes:
					offerInput.attemptCap > 1
						? [
								'retry_definitive_failure',
								...(offerInput.fallbackMode === 'none'
									? []
									: [`fallback_${offerInput.fallbackMode}`])
							]
						: [],
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
					state:
						routeInput.state === 'paused'
							? 'paused'
							: offerInput.status === 'live'
								? 'enabled'
								: 'shadow',
					equivalenceApproved: routeInput.equivalenceApproved,
					equivalenceLabel: routeInput.equivalenceApproved
						? 'Owner reviewed in Boosting Setup'
						: null,
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
					state:
						routeInput.state === 'paused'
							? 'paused'
							: offerInput.status === 'live'
								? 'enabled'
								: 'shadow',
					equivalenceApproved: routeInput.equivalenceApproved,
					equivalenceLabel: routeInput.equivalenceApproved
						? 'Owner reviewed in Boosting Setup'
						: null,
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
		if (offerInput.status === 'live') {
			await tx.category.update({ where: { id: categoryId }, data: { isActive: true } });
			await tx.microcopy.upsert({
				where: { key: BOOSTING_MANAGED_STOREFRONT_KEY },
				create: {
					key: BOOSTING_MANAGED_STOREFRONT_KEY,
					value: 'true',
					description:
						'Persistent cutover marker for the reviewed Boosting customer-offer storefront.',
					category: 'boosting_config',
					isActive: true
				},
				update: { value: 'true', isActive: true }
			});
		}
	});
}
