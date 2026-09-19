import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { env } from '$env/dynamic/private';
import {
	BOOST_CATALOG_OUTCOMES,
	BOOST_CATALOG_PLATFORMS,
	BOOST_PROVIDER_IDS,
	type BoostCatalogOutcome,
	type BoostCatalogPlatform,
	type BoostProviderId,
	type BoostTargetType
} from './types';
import {
	simulateBoostRoute,
	type BoostApprovedRoute,
	type BoostCustomerOfferEnvelope,
	type BoostProviderRuntimeState,
	type BoostRouteProjection
} from './route-simulator';
import { validateLinkForAction } from '$lib/helpers/social-link-validator';
import { prisma } from '$lib/prisma';
import { isBoostFoundationMissing } from './mapping-workspace';

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 100;

const shadowCandidateInclude = Prisma.validator<Prisma.OrderItemInclude>()({
	order: {
		select: {
			id: true,
			paymentStatus: true,
			paidAt: true,
			subtotal: true,
			discountAmount: true
		}
	},
	category: {
		include: {
			boostCustomerOffers: {
				where: { status: 'reviewed' },
				orderBy: [{ displayOrder: 'asc' }, { qualityTier: 'asc' }],
				take: 1,
				include: {
					routes: {
						where: { state: { not: 'paused' } },
						include: { providerService: { include: { providerState: true } } }
					}
				}
			}
		}
	}
});

type ShadowCandidate = Prisma.OrderItemGetPayload<{ include: typeof shadowCandidateInclude }>;

export interface BoostShadowRoutingSummary {
	processed: number;
	selected: number;
	noSafeRoute: number;
	invalidTarget: number;
	targetReviewNeeded: number;
	failed: number;
	skipped?: 'foundation_not_migrated';
}

function configuredNumber(name: string, fallback: number, minimum: number): number {
	const parsed = Number(env[name]);
	return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function asFiniteNumber(value: Prisma.Decimal | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function itemRevenueAfterOrderDiscount(candidate: ShadowCandidate): number {
	const itemGross = Math.max(0, Number(candidate.totalPrice));
	const subtotal = Math.max(0, Number(candidate.order.subtotal));
	const discount = Math.max(0, Number(candidate.order.discountAmount));
	if (!subtotal) return itemGross;
	// Store credit is tender, not a discount. Only allocate the actual order discount to the item.
	const netMerchandise = Math.max(0, subtotal - discount);
	return Math.round(((itemGross / subtotal) * netMerchandise + Number.EPSILON) * 100) / 100;
}

function isProviderId(value: string): value is BoostProviderId {
	return BOOST_PROVIDER_IDS.includes(value as BoostProviderId);
}

function isPlatform(value: string): value is BoostCatalogPlatform {
	return BOOST_CATALOG_PLATFORMS.includes(value as BoostCatalogPlatform);
}

function isOutcome(value: string): value is BoostCatalogOutcome {
	return BOOST_CATALOG_OUTCOMES.includes(value as BoostCatalogOutcome);
}

function isTargetType(value: string): value is Exclude<BoostTargetType, 'unknown'> {
	return value === 'profile' || value === 'content' || value === 'channel';
}

function canonicalTargetKey(
	platform: BoostCatalogPlatform,
	outcome: BoostCatalogOutcome,
	targetUrl: string
): { key: string; normalizedUrl: string; valid: boolean; needsManualReview: boolean } {
	const validation = validateLinkForAction(platform, outcome, targetUrl);
	let normalizedUrl = validation.normalizedUrl || targetUrl.trim();
	if (validation.normalizedUrl && !validation.needsManualReview) {
		const parsed = new URL(validation.normalizedUrl);
		parsed.hash = '';
		const canonicalHost: Partial<Record<BoostCatalogPlatform, string>> = {
			instagram: 'instagram.com',
			tiktok: 'tiktok.com',
			facebook: 'facebook.com',
			x: 'x.com',
			spotify: 'open.spotify.com',
			telegram: 't.me'
		};
		if (canonicalHost[platform]) parsed.hostname = canonicalHost[platform]!;
		const retained = new URLSearchParams();
		const path = parsed.pathname.toLowerCase();
		const keep =
			platform === 'youtube' && path === '/watch'
				? ['v']
				: platform === 'facebook' && path.endsWith('/profile.php')
					? ['id']
					: platform === 'facebook' &&
						  (path.endsWith('/permalink.php') ||
								path.endsWith('/story.php') ||
								path.endsWith('/photo.php'))
						? ['fbid', 'story_fbid', 'id']
						: [];
		for (const key of keep.sort()) {
			const value = parsed.searchParams.get(key);
			if (value) retained.set(key, value);
		}
		parsed.search = retained.toString();
		if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
		normalizedUrl = parsed.toString();
	}
	const digest = createHash('sha256')
		.update(`${platform}:${outcome}:${normalizedUrl}`)
		.digest('hex');
	return {
		key: `${platform}:${digest}`,
		normalizedUrl,
		valid: validation.valid,
		needsManualReview: Boolean(validation.needsManualReview)
	};
}

function toRouteProjectionSummary(projection: BoostRouteProjection) {
	return {
		routeId: projection.routeId,
		provider: projection.provider,
		providerServiceId: projection.providerServiceId,
		eligible: projection.eligible,
		selected: projection.selected,
		reasons: projection.reasons,
		projectedSupplierCostNgn: Number.isFinite(projection.projectedSupplierCostNgn)
			? Math.round(projection.projectedSupplierCostNgn * 100) / 100
			: null,
		projectedMarginNgn: Number.isFinite(projection.projectedMarginNgn)
			? Math.round(projection.projectedMarginNgn * 100) / 100
			: null
	};
}

function buildSimulationInput(candidate: ShadowCandidate, now: Date) {
	// Legacy manually-created orders do not yet snapshot an offer id, so shadow mode uses the
	// category's first reviewed choice until the replacement checkout writes the exact offer.
	const offer = candidate.category.boostCustomerOffers[0];
	if (
		!offer ||
		!isPlatform(offer.platform) ||
		!isOutcome(offer.outcome) ||
		!isTargetType(offer.targetType)
	) {
		throw new Error('Reviewed Boosting offer has an unsupported promise envelope.');
	}

	const quantity = Number(candidate.boostQuantity || 0);
	const customerPriceNgn = itemRevenueAfterOrderDiscount(candidate);
	const baseQuantity = Math.max(1, Number(offer.minQuantity));
	// The mapping workspace defines cost ceilings at the offer's minimum quantity. Scale the
	// ceiling with the customer's quantity; the separate margin gate still protects discounted sales.
	const maximumSupplierCostNgn =
		Math.round((Number(offer.maximumSupplierCostNgn) * quantity * 100) / baseQuantity) / 100;
	const offerEnvelope: BoostCustomerOfferEnvelope = {
		id: offer.id,
		platform: offer.platform,
		outcome: offer.outcome,
		targetType: offer.targetType,
		quantity,
		customerPriceNgn,
		minimumMarginPercent: Number(offer.minimumMarginPercent),
		maximumSupplierCostNgn,
		requiredVerifiedSignals: offer.requiredVerifiedSignals,
		audienceTag: offer.audienceTag === 'general' ? null : offer.audienceTag,
		refillDays: offer.refillDays,
		routingPolicy:
			offer.routingPolicy === 'preferred' || offer.routingPolicy === 'locked'
				? offer.routingPolicy
				: 'automatic',
		preferredRouteId: offer.preferredRouteId,
		lockedRouteId: offer.lockedRouteId
	};

	const catalogMaxAgeMs = configuredNumber('BOOSTING_CATALOG_MAX_AGE_MINUTES', 90, 5) * 60 * 1000;
	const balanceMaxAgeMs = configuredNumber('BOOSTING_BALANCE_MAX_AGE_MINUTES', 45, 5) * 60 * 1000;
	const providerMap = new Map<BoostProviderId, BoostProviderRuntimeState>();
	const routes: BoostApprovedRoute[] = offer.routes.flatMap((route) => {
		const service = route.providerService;
		const providerState = service.providerState;
		if (!isProviderId(service.provider)) return [];
		const provider = service.provider;
		const lastCatalogueSuccessAt = providerState.lastCatalogueSuccessAt?.getTime() ?? 0;
		const lastBalanceSuccessAt = providerState.lastBalanceSuccessAt?.getTime() ?? 0;
		const lastSeenAt = service.lastSeenAt.getTime();
		providerMap.set(provider, {
			provider,
			// Current conversion and cost guards are explicitly USD-based. Fail closed if a supplier
			// changes the account currency instead of silently treating another currency as dollars.
			enabled: providerState.enabled && providerState.currency?.toUpperCase() === 'USD',
			circuitOpen: providerState.circuitOpen,
			catalogFresh:
				lastCatalogueSuccessAt > 0 &&
				now.getTime() - lastCatalogueSuccessAt <= catalogMaxAgeMs &&
				now.getTime() - lastSeenAt <= catalogMaxAgeMs,
			balanceFresh:
				lastBalanceSuccessAt > 0 && now.getTime() - lastBalanceSuccessAt <= balanceMaxAgeMs,
			projectedBalanceUsd:
				asFiniteNumber(providerState.projectedBalance) ??
				asFiniteNumber(providerState.balance) ??
				0,
			balanceSafetyUsd: configuredNumber('BOOSTING_BALANCE_SAFETY_USD', 5, 0)
		});

		return [
			{
				id: route.id,
				service: {
					provider,
					serviceId: service.serviceId,
					name: service.name,
					category: service.category,
					description: service.description,
					providerType: service.providerType,
					ratePerThousand: asFiniteNumber(service.ratePerThousand),
					minQuantity: service.minQuantity,
					maxQuantity: service.maxQuantity,
					refillAdvertised: service.refillAdvertised,
					cancelAdvertised: service.cancelAdvertised,
					dripfeedAdvertised: service.dripfeedAdvertised,
					platforms: service.platforms.filter(isPlatform),
					outcomes: service.outcomes.filter(isOutcome),
					targetType: isTargetType(service.targetType) ? service.targetType : 'unknown',
					qualitySignals: service.qualitySignals,
					anomalies: [],
					status:
						service.catalogueStatus === 'ready_for_review' ||
						service.catalogueStatus === 'needs_classification'
							? service.catalogueStatus
							: 'quarantined',
					fingerprint: service.fingerprint
				},
				state: route.state === 'enabled' || route.state === 'shadow' ? route.state : 'paused',
				equivalenceApproved: route.equivalenceApproved,
				verifiedSignals: route.verifiedSignals,
				audienceTags: route.audienceTags,
				verifiedRefillDays: route.verifiedRefillDays,
				reliabilityScore: Number(route.reliabilityScore),
				reliabilityObservations: route.reliabilityObservations,
				minimumReliabilityObservations: 10,
				maximumPilotQuantity: route.maximumPilotQuantity,
				expectedRecoveryCostPercent: Number(route.expectedRecoveryCostPercent)
			} satisfies BoostApprovedRoute
		];
	});

	return {
		offer,
		offerEnvelope,
		routes,
		providers: [...providerMap.values()]
	};
}

async function recordShadowDecision(
	database: PrismaClient,
	candidate: ShadowCandidate,
	now: Date
): Promise<'selected' | 'no_safe_route' | 'invalid_target' | 'target_review_needed'> {
	const targetUrl = candidate.boostTargetUrl || '';
	const { offer, offerEnvelope, routes, providers } = buildSimulationInput(candidate, now);
	const target = canonicalTargetKey(offerEnvelope.platform, offerEnvelope.outcome, targetUrl);
	const simulation = simulateBoostRoute({
		offer: offerEnvelope,
		routes,
		providers,
		usdToNgn: configuredNumber('BOOSTING_USD_NGN_RATE', 1700, 1),
		currencyBufferPercent: configuredNumber('BOOSTING_CURRENCY_BUFFER_PERCENT', 5, 0),
		reliabilityFloor: configuredNumber('BOOSTING_RELIABILITY_FLOOR', 0.8, 0),
		executionMode: 'shadow'
	});
	const selected = simulation.projections.find((projection) => projection.selected) || null;
	const targetIsExact = target.valid && !target.needsManualReview;
	const outcome = !target.valid
		? 'invalid_target'
		: target.needsManualReview
			? 'target_review_needed'
			: selected
				? 'selected'
				: 'no_safe_route';
	const selectedRoute = selected
		? routes.find((route) => route.id === selected.routeId) || null
		: null;

	await database.boostFulfillment.create({
		data: {
			orderItemId: candidate.id,
			offerId: offer.id,
			selectedRouteId: targetIsExact ? selected?.routeId || null : null,
			offerSnapshot: {
				platform: offer.platform,
				outcome: offer.outcome,
				targetType: offer.targetType,
				qualityTier: offer.qualityTier,
				customerName: offer.customerName,
				shortPromise: offer.shortPromise,
				expectationChips: offer.expectationChips,
				requiredVerifiedSignals: offer.requiredVerifiedSignals,
				refillDays: offer.refillDays,
				minimumMarginPercent: Number(offer.minimumMarginPercent),
				maximumSupplierCostNgn: Number(offer.maximumSupplierCostNgn),
				attemptCap: offer.attemptCap,
				routingPolicy: offer.routingPolicy
			},
			targetUrl: target.normalizedUrl,
			targetKey: target.key,
			platform: offer.platform,
			outcome: offer.outcome,
			targetType: offer.targetType,
			quantity: offerEnvelope.quantity,
			customerPriceNgn: offerEnvelope.customerPriceNgn,
			status: 'manual_review',
			customerStatus: 'processing',
			fulfillmentMode: 'shadow',
			provider: targetIsExact ? selected?.provider || null : null,
			providerServiceSnapshot:
				targetIsExact && selectedRoute
					? {
							provider: selectedRoute.service.provider,
							serviceId: selectedRoute.service.serviceId,
							name: selectedRoute.service.name,
							ratePerThousand: selectedRoute.service.ratePerThousand,
							minimumQuantity: selectedRoute.service.minQuantity,
							maximumQuantity: selectedRoute.service.maxQuantity,
							fingerprint: selectedRoute.service.fingerprint
						}
					: undefined,
			quotedSupplierCostUsd: targetIsExact ? selected?.rawSupplierCostUsd || null : null,
			fxNgnPerUsd: configuredNumber('BOOSTING_USD_NGN_RATE', 1700, 1),
			maximumSupplierCostNgn: offerEnvelope.maximumSupplierCostNgn,
			projectedMarginNgn: targetIsExact ? selected?.projectedMarginNgn || null : null,
			attemptCap: offer.attemptCap,
			lastSafeErrorCategory: outcome === 'selected' ? null : outcome,
			lastCheckedAt: now,
			attempts: {
				create: {
					routeId: targetIsExact ? selected?.routeId || null : null,
					type: 'shadow_route_decision',
					outcome,
					requestFingerprint: createHash('sha256')
						.update(`${candidate.id}:${target.key}:${offerEnvelope.quantity}`)
						.digest('hex'),
					supplierCostUsd: targetIsExact ? selected?.rawSupplierCostUsd || null : null,
					safeSummary: {
						selectionReason: targetIsExact ? simulation.selectionReason : outcome,
						projections: simulation.projections.map(toRouteProjectionSummary)
					}
				}
			}
		}
	});

	return outcome;
}

export async function runBoostingShadowRouter(
	options: {
		limit?: number;
		database?: PrismaClient;
		now?: Date;
	} = {}
): Promise<BoostShadowRoutingSummary> {
	const database = options.database ?? prisma;
	const limit = Math.min(
		MAX_BATCH_LIMIT,
		Math.max(1, Math.floor(Number(options.limit || DEFAULT_BATCH_LIMIT)))
	);
	const now = options.now ?? new Date();
	const summary: BoostShadowRoutingSummary = {
		processed: 0,
		selected: 0,
		noSafeRoute: 0,
		invalidTarget: 0,
		targetReviewNeeded: 0,
		failed: 0
	};

	let candidates: ShadowCandidate[];
	try {
		candidates = await database.orderItem.findMany({
			where: {
				boostTargetUrl: { not: null },
				boostFulfillment: null,
				order: { paymentStatus: 'paid' },
				category: {
					categoryType: 'boosting_service',
					boostCustomerOffers: { some: { status: 'reviewed' } }
				}
			},
			include: shadowCandidateInclude,
			orderBy: [{ order: { paidAt: 'asc' } }, { createdAt: 'asc' }],
			take: limit
		});
	} catch (error) {
		if (isBoostFoundationMissing(error)) return { ...summary, skipped: 'foundation_not_migrated' };
		throw error;
	}

	for (const candidate of candidates) {
		try {
			const outcome = await recordShadowDecision(database, candidate, now);
			summary.processed += 1;
			if (outcome === 'selected') summary.selected += 1;
			else if (outcome === 'invalid_target') summary.invalidTarget += 1;
			else if (outcome === 'target_review_needed') summary.targetReviewNeeded += 1;
			else summary.noSafeRoute += 1;
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				continue;
			}
			summary.failed += 1;
			console.error('[boosting.shadow] unable to record route decision', {
				orderItemId: candidate.id,
				error: error instanceof Error ? error.message : 'unknown error'
			});
		}
	}

	return summary;
}
