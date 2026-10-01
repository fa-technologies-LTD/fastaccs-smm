import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { getBoostingPricingConfig } from '$lib/services/boosting-pricing';
import { notifyBoostingOrderCompleted } from '$lib/services/boosting-fulfillment-notifications';
import { BoostProviderSubmissionError, createPanelOrderClient } from './panel-order-client';
import {
	simulateBoostRoute,
	type BoostApprovedRoute,
	type BoostCustomerOfferEnvelope,
	type BoostProviderRuntimeState,
	type BoostRouteProjection
} from './route-simulator';
import type {
	BoostCatalogOutcome,
	BoostCatalogPlatform,
	BoostProviderId,
	BoostProviderOrderClient,
	BoostProviderOrderState,
	BoostTargetType
} from './types';

export type BoostAutomationMode = 'shadow' | 'pilot' | 'live';

const dueFulfillmentInclude = Prisma.validator<Prisma.BoostFulfillmentInclude>()({
	orderItem: {
		select: {
			id: true,
			orderId: true,
			boostFulfillmentStatus: true,
			order: { select: { status: true, paymentStatus: true } }
		}
	},
	offer: {
		include: {
			routes: {
				include: { providerService: { include: { providerState: true } } }
			}
		}
	},
	attempts: { orderBy: { createdAt: 'asc' } }
});

type DueFulfillment = Prisma.BoostFulfillmentGetPayload<{ include: typeof dueFulfillmentInclude }>;
type OrderClients = Record<BoostProviderId, BoostProviderOrderClient>;

export interface BoostFulfillmentWorkerSummary {
	processed: number;
	shadowed: number;
	submitted: number;
	polled: number;
	completed: number;
	manualReview: number;
	definitiveRejections: number;
	failed: number;
	mode: BoostAutomationMode;
}

function finite(value: unknown, fallback: number, minimum = 0): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

export function getBoostAutomationMode(value = env.BOOSTING_AUTOMATION_MODE): BoostAutomationMode {
	return value === 'pilot' || value === 'live' ? value : 'shadow';
}

export function canRetryBoostSubmission(
	error: unknown,
	attemptCount: number,
	attemptCap: number
): boolean {
	return (
		error instanceof BoostProviderSubmissionError &&
		error.certainty === 'not_submitted' &&
		attemptCount < attemptCap
	);
}

export function customerStatusForProviderState(state: BoostProviderOrderState): string {
	if (state === 'completed') return 'completed';
	if (state === 'in_progress' || state === 'partial') return 'in_progress';
	return 'processing';
}

function isProvider(value: string | null): value is BoostProviderId {
	return value === 'smm_raja' || value === 'bulk_follows';
}

function isPlatform(value: string): value is BoostCatalogPlatform {
	return ['instagram', 'tiktok', 'youtube', 'facebook', 'x', 'spotify', 'telegram'].includes(value);
}

function isOutcome(value: string): value is BoostCatalogOutcome {
	return [
		'followers',
		'subscribers',
		'members',
		'views',
		'streams',
		'monthly_listeners',
		'likes',
		'reactions',
		'shares',
		'reposts',
		'comments',
		'saves',
		'watch_time'
	].includes(value);
}

function isTargetType(value: string): value is Exclude<BoostTargetType, 'unknown'> {
	return value === 'profile' || value === 'content' || value === 'channel';
}

export function createBoostOrderClients(): OrderClients {
	return {
		smm_raja: createPanelOrderClient({
			id: 'smm_raja',
			getApiKey: () => env.SMMRAJA_API_KEY,
			fetchImpl: fetch
		}),
		bulk_follows: createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => env.BULKFOLLOWS_API_KEY,
			fetchImpl: fetch
		})
	};
}

function projectionSummary(projection: BoostRouteProjection) {
	return {
		routeId: projection.routeId,
		provider: projection.provider,
		providerServiceId: projection.providerServiceId,
		selected: projection.selected,
		eligible: projection.eligible,
		reasons: projection.reasons,
		projectedSupplierCostNgn: Number.isFinite(projection.projectedSupplierCostNgn)
			? Math.round(projection.projectedSupplierCostNgn * 100) / 100
			: null,
		projectedMarginNgn: Number.isFinite(projection.projectedMarginNgn)
			? Math.round(projection.projectedMarginNgn * 100) / 100
			: null
	};
}

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, Prisma.JsonValue>)
		: null;
}

function jsonStringArray(value: Prisma.JsonValue | undefined): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function simulationInput(
	fulfillment: DueFulfillment,
	now: Date,
	pricing: Awaited<ReturnType<typeof getBoostingPricingConfig>>,
	mode: BoostAutomationMode
) {
	const offer = fulfillment.offer;
	const snapshot = jsonObject(fulfillment.offerSnapshot);
	if (
		!offer ||
		!snapshot ||
		!isPlatform(String(snapshot.platform)) ||
		!isOutcome(String(snapshot.outcome)) ||
		!isTargetType(String(snapshot.targetType)) ||
		!Array.isArray(snapshot.routes) ||
		!Array.isArray(snapshot.requiredVerifiedSignals)
	)
		return null;
	const snapshotPlatform = String(snapshot.platform) as BoostCatalogPlatform;
	const snapshotOutcome = String(snapshot.outcome) as BoostCatalogOutcome;
	const snapshotTargetType = String(snapshot.targetType) as Exclude<BoostTargetType, 'unknown'>;
	const frozenMinimumMarginPercent = Number(snapshot.minimumMarginPercent);
	const frozenRefillDays = snapshot.refillDays === null ? null : Number(snapshot.refillDays);
	if (
		!Number.isFinite(frozenMinimumMarginPercent) ||
		frozenMinimumMarginPercent < 0 ||
		(frozenRefillDays !== null && (!Number.isInteger(frozenRefillDays) || frozenRefillDays < 1)) ||
		snapshotPlatform !== fulfillment.platform ||
		snapshotOutcome !== fulfillment.outcome ||
		snapshotTargetType !== fulfillment.targetType
	)
		return null;
	const routeSnapshots = new Map(
		snapshot.routes
			.map(jsonObject)
			.filter((route): route is Record<string, Prisma.JsonValue> => Boolean(route))
			.map((route) => [String(route.id), route])
	);
	if (!routeSnapshots.size) return null;

	const rejectedRouteIds = new Set(
		fulfillment.attempts
			.filter((attempt) => attempt.type === 'submission' && attempt.outcome === 'provider_rejected')
			.map((attempt) => attempt.routeId)
			.filter((id): id is string => Boolean(id))
	);
	const providerMap = new Map<BoostProviderId, BoostProviderRuntimeState>();
	const catalogMaxAgeMs = finite(env.BOOSTING_CATALOG_MAX_AGE_MINUTES, 390, 5) * 60_000;
	const balanceMaxAgeMs = finite(env.BOOSTING_BALANCE_MAX_AGE_MINUTES, 390, 5) * 60_000;
	const routes: BoostApprovedRoute[] = offer.routes.flatMap((route) => {
		const service = route.providerService;
		const state = service.providerState;
		const routeSnapshot = routeSnapshots.get(route.id);
		const serviceSnapshot = routeSnapshot ? jsonObject(routeSnapshot.service) : null;
		if (
			!routeSnapshot ||
			!serviceSnapshot ||
			!isProvider(service.provider) ||
			rejectedRouteIds.has(route.id) ||
			String(serviceSnapshot.provider) !== service.provider ||
			String(serviceSnapshot.serviceId) !== service.serviceId
		)
			return [];
		const provider = service.provider;
		const frozenRate =
			typeof serviceSnapshot.ratePerThousand === 'number'
				? serviceSnapshot.ratePerThousand
				: Number.NaN;
		const frozenMinimum = Number(serviceSnapshot.minQuantity);
		const frozenMaximum = Number(serviceSnapshot.maxQuantity);
		const currentRate =
			service.ratePerThousand === null ? Number.NaN : Number(service.ratePerThousand);
		const currentMinimum = service.minQuantity === null ? Number.NaN : service.minQuantity;
		const currentMaximum = service.maxQuantity === null ? Number.NaN : service.maxQuantity;
		const frozenVerifiedRefillDays =
			routeSnapshot.verifiedRefillDays === null ? null : Number(routeSnapshot.verifiedRefillDays);
		const frozenMaximumPilotQuantity =
			routeSnapshot.maximumPilotQuantity === null
				? null
				: Number(routeSnapshot.maximumPilotQuantity);
		const frozenRecoveryCostPercent = Number(routeSnapshot.expectedRecoveryCostPercent);
		if (
			!Number.isFinite(frozenRate) ||
			frozenRate < 0 ||
			!Number.isInteger(frozenMinimum) ||
			frozenMinimum < 1 ||
			!Number.isInteger(frozenMaximum) ||
			frozenMaximum < frozenMinimum ||
			(frozenVerifiedRefillDays !== null &&
				(!Number.isInteger(frozenVerifiedRefillDays) || frozenVerifiedRefillDays < 1)) ||
			(frozenMaximumPilotQuantity !== null &&
				(!Number.isInteger(frozenMaximumPilotQuantity) || frozenMaximumPilotQuantity < 1)) ||
			!Number.isFinite(frozenRecoveryCostPercent) ||
			frozenRecoveryCostPercent < 0 ||
			!Number.isFinite(currentRate) ||
			currentRate < 0 ||
			!Number.isInteger(currentMinimum) ||
			currentMinimum < 1 ||
			!Number.isInteger(currentMaximum) ||
			currentMaximum < currentMinimum ||
			!route.equivalenceApproved
		)
			return [];
		providerMap.set(provider, {
			provider,
			enabled:
				state.enabled &&
				state.currency?.toUpperCase() === 'USD' &&
				!service.unavailableAt &&
				service.catalogueStatus !== 'quarantined',
			circuitOpen: state.circuitOpen,
			catalogFresh:
				Boolean(state.lastCatalogueSuccessAt) &&
				now.getTime() - (state.lastCatalogueSuccessAt?.getTime() ?? 0) <= catalogMaxAgeMs &&
				now.getTime() - service.lastSeenAt.getTime() <= catalogMaxAgeMs,
			balanceFresh:
				Boolean(state.lastBalanceSuccessAt) &&
				now.getTime() - (state.lastBalanceSuccessAt?.getTime() ?? 0) <= balanceMaxAgeMs,
			projectedBalanceUsd: finite(state.projectedBalance ?? state.balance, 0),
			balanceSafetyUsd: finite(env.BOOSTING_BALANCE_SAFETY_USD, 5)
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
					ratePerThousand: currentRate,
					minQuantity: currentMinimum,
					maxQuantity: currentMaximum,
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
					fingerprint: String(serviceSnapshot.fingerprint || '')
				},
				state:
					route.state === 'paused'
						? 'paused'
						: routeSnapshot.state === 'enabled' || routeSnapshot.state === 'shadow'
							? routeSnapshot.state
							: 'paused',
				equivalenceApproved: routeSnapshot.equivalenceApproved === true,
				verifiedSignals: route.verifiedSignals,
				audienceTags: route.audienceTags,
				verifiedRefillDays: route.verifiedRefillDays,
				reliabilityScore: Number(route.reliabilityScore),
				reliabilityObservations: route.reliabilityObservations,
				minimumReliabilityObservations: 3,
				maximumPilotQuantity:
					route.maximumPilotQuantity === null
						? frozenMaximumPilotQuantity
						: frozenMaximumPilotQuantity === null
							? route.maximumPilotQuantity
							: Math.min(route.maximumPilotQuantity, frozenMaximumPilotQuantity),
				expectedRecoveryCostPercent: Math.max(
					Number(route.expectedRecoveryCostPercent),
					frozenRecoveryCostPercent
				)
			} satisfies BoostApprovedRoute
		];
	});

	const offerEnvelope: BoostCustomerOfferEnvelope = {
		id: offer.id,
		platform: snapshotPlatform,
		outcome: snapshotOutcome,
		targetType: snapshotTargetType,
		quantity: fulfillment.quantity,
		customerPriceNgn: Number(fulfillment.customerPriceNgn),
		minimumMarginPercent: frozenMinimumMarginPercent,
		maximumSupplierCostNgn: Number(fulfillment.maximumSupplierCostNgn),
		requiredVerifiedSignals: jsonStringArray(snapshot.requiredVerifiedSignals),
		audienceTag:
			snapshot.audienceTag === 'general' ? null : String(snapshot.audienceTag || '') || null,
		refillDays: frozenRefillDays,
		routingPolicy:
			snapshot.routingPolicy === 'preferred' || snapshot.routingPolicy === 'locked'
				? snapshot.routingPolicy
				: 'automatic',
		preferredRouteId:
			typeof snapshot.preferredRouteId === 'string' ? snapshot.preferredRouteId : null,
		lockedRouteId: typeof snapshot.lockedRouteId === 'string' ? snapshot.lockedRouteId : null
	};
	return {
		offerEnvelope,
		routes,
		providers: [...providerMap.values()],
		simulation: simulateBoostRoute({
			offer: offerEnvelope,
			routes,
			providers: [...providerMap.values()],
			usdToNgn: pricing.usdNgnRate,
			currencyBufferPercent: pricing.currencyBufferPercent,
			reliabilityFloor: finite(env.BOOSTING_RELIABILITY_FLOOR, 0.8),
			executionMode: mode
		})
	};
}

async function updateRouteReliability(
	database: PrismaClient,
	routeId: string | null,
	succeeded: boolean
): Promise<void> {
	if (!routeId) return;
	const route = await database.boostServiceRoute.findUnique({
		where: { id: routeId },
		select: { reliabilityScore: true, reliabilityObservations: true, consecutiveFailures: true }
	});
	if (!route) return;
	const observations = route.reliabilityObservations + 1;
	const score =
		(Number(route.reliabilityScore) * route.reliabilityObservations + (succeeded ? 1 : 0)) /
		observations;
	await database.boostServiceRoute.update({
		where: { id: routeId },
		data: {
			reliabilityScore: score,
			reliabilityObservations: observations,
			consecutiveFailures: succeeded ? 0 : route.consecutiveFailures + 1
		}
	});
}

async function completeOrderIfReady(database: PrismaClient, orderId: string): Promise<boolean> {
	const items = await database.orderItem.findMany({
		where: { orderId, boostTargetUrl: { not: null } },
		select: { boostFulfillmentStatus: true }
	});
	if (items.length && items.every((item) => item.boostFulfillmentStatus === 'completed')) {
		const completed = await database.order.updateMany({
			where: { id: orderId, paymentStatus: 'paid', status: { not: 'completed' } },
			data: { status: 'completed', deliveryStatus: 'delivered', deliveredAt: new Date() }
		});
		return completed.count > 0;
	}
	return false;
}

async function processStatus(
	fulfillment: DueFulfillment,
	database: PrismaClient,
	orderClients: OrderClients,
	now: Date
): Promise<'completed' | 'polled' | 'manual_review'> {
	if (!fulfillment.supplierOrderId || !isProvider(fulfillment.provider)) {
		await database.boostFulfillment.update({
			where: { id: fulfillment.id },
			data: { status: 'manual_review', lastSafeErrorCategory: 'missing_supplier_reference' }
		});
		return 'manual_review';
	}
	let status;
	try {
		[status] = await orderClients[fulfillment.provider].getStatuses([fulfillment.supplierOrderId]);
	} catch (error) {
		await database.$transaction([
			database.boostAttempt.create({
				data: {
					fulfillmentId: fulfillment.id,
					routeId: fulfillment.selectedRouteId,
					type: 'status_poll',
					outcome: 'status_check_failed',
					supplierOrderId: fulfillment.supplierOrderId,
					safeSummary: {
						message: error instanceof Error ? error.message.slice(0, 180) : 'Unknown error'
					}
				}
			}),
			database.boostFulfillment.update({
				where: { id: fulfillment.id },
				data: {
					lastCheckedAt: now,
					lastSafeErrorCategory: 'status_check_failed',
					nextActionAt: new Date(now.getTime() + 10 * 60_000)
				}
			})
		]);
		return 'polled';
	}
	await database.boostAttempt.create({
		data: {
			fulfillmentId: fulfillment.id,
			routeId: fulfillment.selectedRouteId,
			type: 'status_poll',
			outcome: status.state,
			supplierOrderId: fulfillment.supplierOrderId,
			supplierCostUsd: status.charge,
			safeSummary: {
				rawStatus: status.rawStatus,
				remains: status.remains,
				startCount: status.startCount,
				error: status.error
			}
		}
	});
	const common = {
		rawProviderStatus: status.rawStatus,
		startCount: status.startCount,
		remains: status.remains,
		finalSupplierCostUsd: status.charge,
		finalMarginNgn:
			status.charge === null || fulfillment.fxNgnPerUsd === null
				? undefined
				: Number(fulfillment.customerPriceNgn) - status.charge * Number(fulfillment.fxNgnPerUsd),
		lastCheckedAt: now
	};
	if (status.state === 'completed') {
		await database.$transaction([
			database.boostFulfillment.update({
				where: { id: fulfillment.id },
				data: {
					...common,
					status: 'completed',
					customerStatus: 'completed',
					completedAt: now,
					nextActionAt: null
				}
			}),
			database.orderItem.update({
				where: { id: fulfillment.orderItemId },
				data: { boostFulfillmentStatus: 'completed', boostCompletedAt: now }
			})
		]);
		await updateRouteReliability(database, fulfillment.selectedRouteId, true);
		if (await completeOrderIfReady(database, fulfillment.orderItem.orderId)) {
			await notifyBoostingOrderCompleted(fulfillment.orderItem.orderId, database);
		}
		return 'completed';
	}
	if (['partial', 'cancelled', 'refunded', 'failed'].includes(status.state)) {
		await database.$transaction([
			database.boostFulfillment.update({
				where: { id: fulfillment.id },
				data: {
					...common,
					status: 'manual_review',
					customerStatus: customerStatusForProviderState(status.state),
					lastSafeErrorCategory: `provider_${status.state}`,
					nextActionAt: null
				}
			}),
			database.orderItem.update({
				where: { id: fulfillment.orderItemId },
				data: { boostFulfillmentStatus: 'in_progress' }
			})
		]);
		await updateRouteReliability(database, fulfillment.selectedRouteId, false);
		return 'manual_review';
	}
	await database.$transaction([
		database.boostFulfillment.update({
			where: { id: fulfillment.id },
			data: {
				...common,
				status: status.state === 'in_progress' ? 'in_progress' : 'submitted',
				customerStatus: customerStatusForProviderState(status.state),
				startedAt:
					status.state === 'in_progress' ? fulfillment.startedAt || now : fulfillment.startedAt,
				nextActionAt: new Date(now.getTime() + 10 * 60_000)
			}
		}),
		database.orderItem.update({
			where: { id: fulfillment.orderItemId },
			data: { boostFulfillmentStatus: status.state === 'in_progress' ? 'in_progress' : 'pending' }
		})
	]);
	return 'polled';
}

async function processQueued(
	fulfillment: DueFulfillment,
	database: PrismaClient,
	orderClients: OrderClients,
	now: Date,
	configuredMode: BoostAutomationMode
): Promise<'shadowed' | 'submitted' | 'manual_review' | 'definitive_rejection'> {
	const pricing = await getBoostingPricingConfig(database);
	const effectiveMode: BoostAutomationMode =
		configuredMode === 'shadow' || fulfillment.fulfillmentMode === 'shadow'
			? 'shadow'
			: fulfillment.fulfillmentMode === 'live' && configuredMode === 'live'
				? 'live'
				: 'pilot';
	const input = simulationInput(fulfillment, now, pricing, effectiveMode);
	if (!input) {
		await database.boostFulfillment.update({
			where: { id: fulfillment.id },
			data: { status: 'manual_review', lastSafeErrorCategory: 'invalid_offer_snapshot' }
		});
		return 'manual_review';
	}
	const selected = input.simulation.projections.find((projection) => projection.selected) || null;
	const route = selected
		? input.routes.find((candidate) => candidate.id === selected.routeId)
		: null;
	await database.boostAttempt.create({
		data: {
			fulfillmentId: fulfillment.id,
			routeId: route?.id || null,
			type: 'route_decision',
			outcome: selected ? 'selected' : 'no_safe_route',
			supplierCostUsd: selected?.rawSupplierCostUsd || null,
			safeSummary: {
				mode: effectiveMode,
				selectionReason: input.simulation.selectionReason,
				projections: input.simulation.projections.map(projectionSummary)
			}
		}
	});
	if (!selected || !route) {
		await database.boostFulfillment.update({
			where: { id: fulfillment.id },
			data: {
				status: 'manual_review',
				lastSafeErrorCategory: 'no_safe_route',
				lastCheckedAt: now,
				nextActionAt: null
			}
		});
		return 'manual_review';
	}
	const service = fulfillment.offer!.routes.find(
		(candidate) => candidate.id === route.id
	)!.providerService;
	const routeData = {
		selectedRouteId: route.id,
		provider: route.service.provider,
		providerServiceSnapshot: {
			provider: route.service.provider,
			serviceId: route.service.serviceId,
			name: route.service.name,
			ratePerThousand: route.service.ratePerThousand,
			minimumQuantity: route.service.minQuantity,
			maximumQuantity: route.service.maxQuantity,
			fingerprint: route.service.fingerprint
		},
		quotedSupplierCostUsd: selected.rawSupplierCostUsd,
		fxNgnPerUsd: pricing.usdNgnRate,
		projectedMarginNgn: selected.projectedMarginNgn,
		lastCheckedAt: now
	};
	if (effectiveMode === 'shadow') {
		await database.boostFulfillment.update({
			where: { id: fulfillment.id },
			data: {
				...routeData,
				status: 'manual_review',
				fulfillmentMode: 'shadow',
				lastSafeErrorCategory: 'shadow_selected',
				nextActionAt: null
			}
		});
		return 'shadowed';
	}

	const lastAttempt = fulfillment.attempts.at(-1);
	if (lastAttempt?.type === 'submission' && lastAttempt.outcome === 'started') {
		await database.boostFulfillment.update({
			where: { id: fulfillment.id },
			data: { status: 'manual_review', lastSafeErrorCategory: 'submission_unknown' }
		});
		return 'manual_review';
	}
	const requestFingerprint = createHash('sha256')
		.update(`${fulfillment.id}:${route.id}:${fulfillment.attemptCount + 1}`)
		.digest('hex');
	const reservationStarted = await database.$transaction(async (tx) => {
		const reserved = await tx.boostProviderState.updateMany({
			where: {
				provider: route.service.provider,
				projectedBalance: {
					gte: selected.rawSupplierCostUsd + finite(env.BOOSTING_BALANCE_SAFETY_USD, 5)
				}
			},
			data: { projectedBalance: { decrement: selected.rawSupplierCostUsd } }
		});
		if (!reserved.count) return false;
		await tx.boostAttempt.create({
			data: {
				fulfillmentId: fulfillment.id,
				routeId: route.id,
				type: 'submission',
				outcome: 'started',
				requestFingerprint,
				supplierCostUsd: selected.rawSupplierCostUsd,
				safeSummary: { provider: route.service.provider, serviceId: route.service.serviceId }
			}
		});
		return true;
	});
	if (!reservationStarted) {
		await database.boostFulfillment.update({
			where: { id: fulfillment.id },
			data: {
				status: 'manual_review',
				lastSafeErrorCategory: 'balance_reservation_failed',
				nextActionAt: null
			}
		});
		return 'manual_review';
	}
	try {
		const result = await orderClients[route.service.provider].submitOrder({
			serviceId: service.serviceId,
			targetUrl: fulfillment.targetUrl,
			quantity: fulfillment.quantity
		});
		await database.$transaction([
			database.boostAttempt.create({
				data: {
					fulfillmentId: fulfillment.id,
					routeId: route.id,
					type: 'submission',
					outcome: 'accepted',
					requestFingerprint,
					supplierOrderId: result.providerOrderId,
					supplierCostUsd: selected.rawSupplierCostUsd,
					safeSummary: { provider: result.provider }
				}
			}),
			database.boostFulfillment.update({
				where: { id: fulfillment.id },
				data: {
					...routeData,
					status: 'submitted',
					fulfillmentMode: effectiveMode,
					supplierOrderId: result.providerOrderId,
					attemptCount: { increment: 1 },
					submittedAt: now,
					nextActionAt: new Date(now.getTime() + 5 * 60_000),
					lastSafeErrorCategory: null
				}
			}),
			database.orderItem.update({
				where: { id: fulfillment.orderItemId },
				data: {
					boostFulfillmentStatus: 'in_progress',
					boostProviderReference: `${result.provider}:${result.providerOrderId}`
				}
			})
		]);
		return 'submitted';
	} catch (error) {
		const certainty =
			error instanceof BoostProviderSubmissionError ? error.certainty : 'submission_unknown';
		const nextAttemptCount = fulfillment.attemptCount + 1;
		const retry = canRetryBoostSubmission(error, nextAttemptCount, fulfillment.attemptCap);
		const writes: Prisma.PrismaPromise<unknown>[] = [
			database.boostAttempt.create({
				data: {
					fulfillmentId: fulfillment.id,
					routeId: route.id,
					type: 'submission',
					outcome: certainty === 'not_submitted' ? 'provider_rejected' : 'submission_unknown',
					requestFingerprint,
					supplierCostUsd: selected.rawSupplierCostUsd,
					safeSummary: {
						message: error instanceof Error ? error.message.slice(0, 180) : 'Unknown error'
					}
				}
			}),
			database.boostFulfillment.update({
				where: { id: fulfillment.id },
				data: {
					...routeData,
					status: retry ? 'queued' : 'manual_review',
					attemptCount: nextAttemptCount,
					lastSafeErrorCategory:
						certainty === 'not_submitted' ? 'provider_rejected' : 'submission_unknown',
					nextActionAt: retry ? now : null
				}
			})
		];
		if (certainty === 'not_submitted') {
			writes.push(
				database.boostProviderState.update({
					where: { provider: route.service.provider },
					data: { projectedBalance: { increment: selected.rawSupplierCostUsd } }
				})
			);
		}
		await database.$transaction(writes);
		await updateRouteReliability(database, route.id, false);
		return certainty === 'not_submitted' ? 'definitive_rejection' : 'manual_review';
	}
}

export async function queuePaidBoostFulfillments(
	orderId: string,
	options: { database?: PrismaClient; mode?: BoostAutomationMode; now?: Date } = {}
): Promise<number> {
	const database = options.database ?? prisma;
	const mode = options.mode ?? getBoostAutomationMode();
	const now = options.now ?? new Date();
	const awaiting = await database.boostFulfillment.findMany({
		where: { orderItem: { orderId }, status: 'awaiting_payment' },
		select: { id: true, targetKey: true, outcome: true }
	});
	let queued = 0;
	for (const fulfillment of awaiting) {
		if (mode !== 'shadow') {
			const conflict = await database.boostFulfillment.findFirst({
				where: {
					id: { not: fulfillment.id },
					targetKey: fulfillment.targetKey,
					outcome: fulfillment.outcome,
					fulfillmentMode: { not: 'shadow' },
					status: { in: ['queued', 'submitted', 'in_progress', 'manual_review'] }
				},
				select: { id: true }
			});
			if (conflict) {
				await database.boostFulfillment.update({
					where: { id: fulfillment.id },
					data: {
						status: 'manual_review',
						fulfillmentMode: mode,
						lastSafeErrorCategory: 'target_already_active',
						nextActionAt: null
					}
				});
				continue;
			}
		}
		try {
			const result = await database.boostFulfillment.updateMany({
				where: { id: fulfillment.id, status: 'awaiting_payment' },
				data: { status: 'queued', fulfillmentMode: mode, nextActionAt: now }
			});
			queued += result.count;
		} catch (error) {
			if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
				throw error;
			await database.boostFulfillment.update({
				where: { id: fulfillment.id },
				data: {
					status: 'manual_review',
					fulfillmentMode: mode,
					lastSafeErrorCategory: 'target_already_active',
					nextActionAt: null
				}
			});
		}
	}
	return queued;
}

export async function runBoostFulfillmentWorker(
	options: {
		limit?: number;
		database?: PrismaClient;
		mode?: BoostAutomationMode;
		clients?: OrderClients;
		now?: Date;
	} = {}
): Promise<BoostFulfillmentWorkerSummary> {
	const database = options.database ?? prisma;
	const mode = options.mode ?? getBoostAutomationMode();
	const orderClients = options.clients ?? createBoostOrderClients();
	const now = options.now ?? new Date();
	const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 20)));
	const summary: BoostFulfillmentWorkerSummary = {
		processed: 0,
		shadowed: 0,
		submitted: 0,
		polled: 0,
		completed: 0,
		manualReview: 0,
		definitiveRejections: 0,
		failed: 0,
		mode
	};
	const due = await database.boostFulfillment.findMany({
		where: {
			status: { in: ['queued', 'submitted', 'in_progress'] },
			orderItem: { order: { paymentStatus: 'paid', status: { notIn: ['cancelled', 'refunded'] } } },
			AND: [
				{ OR: [{ nextActionAt: null }, { nextActionAt: { lte: now } }] },
				{ OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] }
			]
		},
		include: dueFulfillmentInclude,
		orderBy: [{ nextActionAt: 'asc' }, { queuedAt: 'asc' }],
		take: limit
	});

	for (const candidate of due) {
		const leaseToken = randomUUID();
		try {
			const claimed = await database.boostFulfillment.updateMany({
				where: {
					id: candidate.id,
					status: candidate.status,
					orderItem: {
						order: { paymentStatus: 'paid', status: { notIn: ['cancelled', 'refunded'] } }
					},
					OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }]
				},
				data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + 2 * 60_000) }
			});
			if (!claimed.count) continue;
			let outcome: string;
			if (candidate.status === 'queued') {
				outcome = await processQueued(candidate, database, orderClients, now, mode);
			} else {
				outcome = await processStatus(candidate, database, orderClients, now);
			}
			summary.processed += 1;
			if (outcome === 'shadowed') summary.shadowed += 1;
			else if (outcome === 'submitted') summary.submitted += 1;
			else if (outcome === 'completed') summary.completed += 1;
			else if (outcome === 'polled') summary.polled += 1;
			else if (outcome === 'definitive_rejection') summary.definitiveRejections += 1;
			else summary.manualReview += 1;
		} catch (error) {
			summary.failed += 1;
			console.error('[boosting.fulfillment] worker item failed', {
				fulfillmentId: candidate.id,
				error: error instanceof Error ? error.message : 'unknown error'
			});
		} finally {
			await database.boostFulfillment
				.updateMany({
					where: { id: candidate.id, leaseToken },
					data: { leaseToken: null, leaseExpiresAt: null }
				})
				.catch(() => undefined);
		}
	}
	return summary;
}
