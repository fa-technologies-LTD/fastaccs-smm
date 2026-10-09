import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'vite';
import { createVerifiedProductionBridge } from './verified-staging-bridge.mjs';

// Read-only release proposal. Never approves a draft, publishes a row, or buys a test.
if (process.argv.length > 2) throw new Error('Read-only planner accepts no arguments.');
let bridge, db, vite;
try {
	bridge = await createVerifiedProductionBridge();
	db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
	vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
	const [
		{ normalizeBoostProviderService },
		{ simulateBoostRoute },
		{ boostingStartingQuantity },
		{ roundUpCatalogPriceNgn }
	] = await Promise.all([
		vite.ssrLoadModule('/src/lib/server/boosting-providers/catalog-normalizer.ts'),
		vite.ssrLoadModule('/src/lib/server/boosting-providers/route-simulator.ts'),
		vite.ssrLoadModule('/src/lib/helpers/boosting-checkout.ts'),
		vite.ssrLoadModule('/src/lib/helpers/catalog-pricing.ts')
	]);
	const offers = await db.boostCustomerOffer.findMany({
		where: {
			OR: [
				{ status: 'reviewed' },
				{
					platform: 'tiktok',
					outcome: 'custom_comments',
					routes: {
						some: {
							equivalenceApproved: true,
							providerService: { provider: 'bulk_follows', serviceId: '14260' }
						}
					}
				}
			]
		},
		include: { routes: { include: { providerService: { include: { providerState: true } } } } }
	});
	const fx = await db.microcopy.findUnique({ where: { key: 'config.boosting.usd_ngn_rate' } });
	if (!fx?.isActive || !(Number(fx.value) > 0)) throw new Error('Saved FX setting missing.');
	const catalogues = {},
		providers = [];
	for (const [provider, endpoint, key] of [
		['smm_raja', 'https://www.smmraja.com/api/v2', process.env.SMMRAJA_API_KEY],
		['bulk_follows', 'https://bulkfollows.com/api/v2', process.env.BULKFOLLOWS_API_KEY]
	]) {
		if (!key) throw new Error('Supplier credentials missing.');
		const read = async (action) => {
			const response = await fetch(endpoint, {
				method: 'POST',
				body: new URLSearchParams({ key, action }),
				signal: AbortSignal.timeout(20000)
			});
			const data = await response.json();
			if (!response.ok || data.error) throw new Error('Supplier read failed.');
			return data;
		};
		const [raw, balance] = await Promise.all([read('services'), read('balance')]);
		if (
			!Array.isArray(raw) ||
			balance.currency !== 'USD' ||
			!Number.isFinite(Number(balance.balance))
		)
			throw new Error('Supplier read contract invalid.');
		catalogues[provider] = new Map(
			raw.map((row) => {
				const s = normalizeBoostProviderService(provider, row);
				return [s.serviceId, s];
			})
		);
		const state = offers
			.flatMap((o) => o.routes)
			.find((r) => r.providerService.provider === provider)?.providerService.providerState;
		providers.push({
			provider,
			enabled: state?.enabled === true,
			circuitOpen: state?.circuitOpen !== false,
			catalogFresh: true,
			balanceFresh: true,
			projectedBalanceUsd: Number(balance.balance),
			balanceSafetyUsd: 5
		});
	}
	const candidates = offers.map((offer) => {
		const quantity = boostingStartingQuantity({
			...offer,
			pricePerStepNgn: Number(offer.pricePerStepNgn)
		});
		const routes = offer.routes.filter(
			(r) =>
				r.equivalenceApproved &&
				(r.state !== 'paused' ||
					(offer.outcome === 'custom_comments' &&
						r.providerService.provider === 'bulk_follows' &&
						r.providerService.serviceId === '14260'))
		);
		const result = simulateBoostRoute({
			offer: {
				id: offer.id,
				platform: offer.platform,
				outcome: offer.outcome,
				targetType: offer.targetType,
				quantity,
				customerPriceNgn: roundUpCatalogPriceNgn(
					(quantity / offer.stepQuantity) * Number(offer.pricePerStepNgn)
				),
				minimumMarginPercent: Number(offer.minimumMarginPercent),
				maximumSupplierCostNgn:
					(Number(offer.maximumSupplierCostNgn) * quantity) / offer.minQuantity,
				requiredVerifiedSignals: offer.requiredVerifiedSignals,
				audienceTag: offer.audienceTag,
				refillDays: offer.refillDays,
				routingPolicy: offer.routingPolicy,
				preferredRouteId: offer.preferredRouteId,
				lockedRouteId: offer.lockedRouteId
			},
			routes: routes.flatMap((route) => {
				const service = catalogues[route.providerService.provider].get(
					route.providerService.serviceId
				);
				return service
					? [
							{
								...route,
								service,
								state: 'enabled',
								reliabilityScore: Number(route.reliabilityScore),
								minimumReliabilityObservations: 3,
								expectedRecoveryCostPercent: Number(route.expectedRecoveryCostPercent)
							}
						]
					: [];
			}),
			providers,
			usdToNgn: Number(fx.value),
			currencyBufferPercent: 0,
			reliabilityFloor: 0.8,
			executionMode: 'live'
		});
		return {
			id: offer.id,
			updatedAt: offer.updatedAt,
			routeRevisions: offer.routes.map((r) => ({
				id: r.id,
				updatedAt: r.updatedAt,
				serviceUpdatedAt: r.providerService.updatedAt,
				serviceId: r.providerServiceId
			})),
			categoryId: offer.categoryId,
			platform: offer.platform,
			outcome: offer.outcome,
			tier: offer.qualityTier,
			pricePerThousand: (Number(offer.pricePerStepNgn) * 1000) / offer.stepQuantity,
			startingQuantity: quantity,
			startingTotal: roundUpCatalogPriceNgn(
				(quantity / offer.stepQuantity) * Number(offer.pricePerStepNgn)
			),
			selectedRouteId: result.selectedRouteId,
			safeRouteIds: result.projections.filter((p) => p.eligible).map((p) => p.routeId),
			projections: result.projections,
			refillDays: offer.refillDays,
			duplicateServiceTier: false
		};
	});
	const rank = { value: 0, stable: 1, premium: 2 };
	const selectedServices = new Map();
	for (const row of candidates.sort((a, b) => rank[a.tier] - rank[b.tier])) {
		if (!row.selectedRouteId) continue;
		const key = `${row.categoryId}:${row.platform}:${row.outcome}`;
		const routes = row.projections
			.filter((p) => p.eligible)
			.map((p) => `${p.provider}:${p.providerServiceId}`)
			.sort()
			.join(',');
		if (selectedServices.get(key)?.has(routes)) row.duplicateServiceTier = true;
		else {
			if (!selectedServices.has(key)) selectedServices.set(key, new Set());
			selectedServices.get(key).add(routes);
		}
	}
	const lastWorker = await db.automationJobRun.findFirst({
		where: { jobName: 'boosting-fulfillment' },
		orderBy: { startedAt: 'desc' },
		select: { startedAt: true, status: true, result: true }
	});
	console.log(
		JSON.stringify(
			{
				mode: 'read-only-proposal',
				checkedAt: new Date().toISOString(),
				publishesOffers: false,
				supplierSpend: 0,
				lastWorker,
				readyCandidates: candidates.filter(
					(row) => row.selectedRouteId && !row.duplicateServiceTier
				),
				heldCandidates: candidates.filter(
					(row) => !row.selectedRouteId || row.duplicateServiceTier
				),
				warning:
					'Fresh supplier reads and a simulation are not a paid end-to-end proof. Publication additionally needs the new deployed revision and a successful live-mode worker record.'
			},
			null,
			2
		)
	);
} catch (error) {
	console.error(
		JSON.stringify({
			error: 'Read-only release plan failed',
			code: error.code ?? null,
			reason: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')
		})
	);
	process.exitCode = 1;
} finally {
	await db?.$disconnect();
	await bridge?.close();
	await vite?.close();
}
