import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { env } from '$env/dynamic/private';
import approved from './approved-pricing-seed.json';
import { applyPricingOwnerAdjustments } from './pricing-owner-adjustments';
import { getBoostingPricingConfig } from '$lib/services/boosting-pricing';
import { BOOSTING_MANAGED_STOREFRONT_KEY } from './storefront-rollout';
import { supportsBoostServiceInput } from '$lib/helpers/boosting-service-input';
import { getRequiredLinkType, type BoostingActionType } from '$lib/helpers/social-link-validator';
import { isThreadsService, serviceMatchesBoostOutcome } from './catalog-normalizer';
import { parseBoostServiceId } from './service-id';
import { getQuantityChips, getBoostingServiceConfig } from '$lib/helpers/boosting-service-config';
import {
	pricingEconomics,
	pricingStepPrice,
	pricingTarget,
	sanitizePricingSheet,
	type BoostPricingSheet,
	type BoostPricingView,
	type BoostPricingQuote
} from '$lib/helpers/boosting-pricing-sheet';

type Database = PrismaClient | Prisma.TransactionClient;
const RESOURCE = 'boosting_pricing_sheet';
const ACTIONS = [
	'boosting_pricing_draft_saved',
	'boosting_pricing_published',
	'boosting_pricing_restored',
	'boosting_pricing_reconciled'
];

export class BoostPricingError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
	}
}

async function latest(database: Database) {
	return database.adminAuditLog.findFirst({
		where: { resourceType: RESOURCE, action: { in: ACTIONS } },
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
	});
}
function snapshot(metadata: unknown): BoostPricingSheet | null {
	const value = metadata as { sheet?: BoostPricingSheet } | null;
	return value?.sheet ?? null;
}
async function state(database: Database) {
	const record = await latest(database);
	const sheet =
		structuredClone(snapshot(record?.metadata)) ??
		applyPricingOwnerAdjustments(approved.sheet as BoostPricingSheet);
	// New Advanced offers join the permanent sheet without replacing saved commercial decisions.
	const known = new Set(sheet.rows.map((r) => r.sourceOfferId));
	const offers = await database.boostCustomerOffer.findMany({
		where: { category: { categoryType: 'boosting_service' } },
		include: { category: true, routes: { include: { providerService: true } } },
		orderBy: [{ platform: 'asc' }, { outcome: 'asc' }, { displayOrder: 'asc' }, { id: 'asc' }]
	});
	for (const offer of offers) {
		if (known.has(offer.id)) continue;
		const placeholder = sheet.rows.find(
			(r) =>
				!r.sourceOfferId &&
				r.platform === offer.platform &&
				r.outcome === offer.outcome &&
				r.tier === offer.qualityTier &&
				offer.audienceTag === 'general'
		);
		if (placeholder) {
			// An owner completing Advanced setup resolves the existing proposed row, not a duplicate.
			placeholder.sourceOfferId = offer.id;
			placeholder.sourceUpdatedAt = offer.updatedAt.toISOString();
			known.add(offer.id);
			continue;
		}
		const route =
			offer.routes.find((r) => r.id === offer.lockedRouteId) ??
			offer.routes.find((r) => r.id === offer.preferredRouteId) ??
			offer.routes.find((r) => r.equivalenceApproved && r.state === 'enabled');
		const supplier = route?.providerService;
		sheet.rows.push({
			id: offer.id,
			sourceOfferId: offer.id,
			sourceUpdatedAt: offer.updatedAt.toISOString(),
			platform: offer.platform,
			outcome: offer.outcome,
			tier: offer.qualityTier,
			title: offer.category.name,
			option: offer.customerName === offer.category.name ? '' : offer.customerName,
			selected: offer.status === 'live',
			provider: supplier?.provider === 'smm_raja' ? 'smm_raja' : 'bulk_follows',
			serviceId: supplier?.serviceId ?? '',
			units: offer.stepQuantity,
			sale: Number(offer.pricePerStepNgn),
			targetMarkup: Number(offer.minimumMarginPercent),
			priceMode: 'manual',
			increment: offer.stepQuantity,
			startingQuantity: offer.minQuantity,
			recoveryMode: 'off',
			profitBudgetPercent: 20,
			attempts: 1,
			note: 'Added from Advanced setup. Review before publishing.'
		});
	}
	return { sheet, record };
}

export async function loadBoostPricingView(database: Database = prisma): Promise<BoostPricingView> {
	const { sheet } = await state(database);
	const [offers, services, history] = await Promise.all([
		database.boostCustomerOffer.findMany({
			where: { id: { in: sheet.rows.flatMap((r) => (r.sourceOfferId ? [r.sourceOfferId] : [])) } },
			include: { routes: true, category: { select: { id: true, metadata: true } } }
		}),
		database.boostProviderService.findMany({
			where: { OR: sheet.rows.map((r) => ({ provider: r.provider, serviceId: r.serviceId })) }
		}),
		database.adminAuditLog.findMany({
			where: { resourceType: RESOURCE, action: { in: ACTIONS } },
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: 12
		})
	]);
	const quotes: Record<string, BoostPricingQuote | null> = {};
	const liveStatuses: Record<string, string> = {};
	const changedRows: string[] = [];
	for (const row of sheet.rows) {
		const service = services.find(
			(s) => s.provider === row.provider && s.serviceId === row.serviceId
		);
		const offer = offers.find((o) => o.id === row.sourceOfferId);
		liveStatuses[row.id] = offer?.status ?? 'not_configured';
		if (offer && row.sourceUpdatedAt !== offer.updatedAt.toISOString()) changedRows.push(row.id);
		if (!service) {
			quotes[row.id] = null;
			continue;
		}
		const issues: string[] = [];
		if (service.unavailableAt || service.catalogueStatus === 'quarantined')
			issues.push('Supplier service is unavailable.');
		if (
			!service.platforms.includes(row.platform) ||
			(row.platform !== 'threads' && isThreadsService(service))
		)
			issues.push('Different platform.');
		if (
			!service.outcomes.includes(row.outcome) ||
			!serviceMatchesBoostOutcome(service, row.outcome)
		)
			issues.push('Different result.');
		if (
			!supportsBoostServiceInput(service.providerType, row.outcome) ||
			service.targetType !== getRequiredLinkType(row.outcome as BoostingActionType)
		)
			issues.push('Unsupported service inputs.');
		if (service.minQuantity === null || service.maxQuantity === null)
			issues.push('Supplier quantity limits are missing.');
		if (offer && (offer.platform !== row.platform || offer.outcome !== row.outcome))
			issues.push('Result configuration has changed.');
		quotes[row.id] = {
			providerServiceId: service.id,
			name: service.name,
			rateUsd: service.ratePerThousand === null ? null : Number(service.ratePerThousand),
			min: service.minQuantity,
			max: service.maxQuantity,
			checkedAt: service.lastSeenAt.toISOString(),
			issues
		};
	}
	return {
		sheet,
		quotes,
		liveStatuses,
		changedRows,
		approval: approved.approval,
		history: history.map((h) => ({
			id: h.id,
			action: h.action,
			createdAt: h.createdAt.toISOString(),
			version: snapshot(h.metadata)?.version ?? 0
		}))
	};
}

async function recordSheet(
	database: Database,
	sheet: BoostPricingSheet,
	actor: string,
	action: string,
	previous: Awaited<ReturnType<typeof latest>>
) {
	// Existing immutable audit storage provides durable snapshots without another schema migration.
	// Monotonic timestamps under the advisory lock prevent same-millisecond ordering ambiguity.
	return database.adminAuditLog.create({
		data: {
			actorUserId: actor,
			action,
			resourceType: RESOURCE,
			description: `Boosting Pricing v${sheet.version}`,
			createdAt: new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1)),
			metadata: {
				sheet: sheet as unknown as Prisma.InputJsonValue,
				approvalId: approved.approval.id
			}
		}
	});
}

async function lock(database: Database) {
	await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fastaccs:boosting-pricing-sheet'))`;
}
function checkVersion(requested: unknown, actual: number) {
	if (requested !== actual)
		throw new BoostPricingError('A newer version was saved. Reload before continuing.', 409);
}

function cleanSheet(input: unknown, current: BoostPricingSheet) {
	try {
		return sanitizePricingSheet(input, current);
	} catch (cause) {
		throw new BoostPricingError(cause instanceof Error ? cause.message : 'Invalid sheet.');
	}
}
function stepPrice(row: BoostPricingSheet['rows'][number]) {
	try {
		return pricingStepPrice(row);
	} catch {
		throw new BoostPricingError(
			`${row.title}: pack price and increment must divide into whole kobo.`
		);
	}
}

/** Explicitly acknowledge external setup edits as a new draft, never publish them. */
export async function reconcileBoostPricingDraft(
	version: number,
	actor: string,
	database: PrismaClient = prisma
) {
	return database.$transaction(
		async (tx) => {
			await lock(tx);
			await tx.$queryRaw`SELECT id FROM boost_customer_offers ORDER BY id FOR UPDATE`;
			const current = await state(tx);
			checkVersion(version, current.sheet.version);
			const next = structuredClone(current.sheet);
			const offers = await tx.boostCustomerOffer.findMany({
				where: { id: { in: next.rows.flatMap((r) => (r.sourceOfferId ? [r.sourceOfferId] : [])) } }
			});
			for (const row of next.rows) {
				const offer = offers.find((o) => o.id === row.sourceOfferId);
				if (!offer) continue;
				if (offer.platform !== row.platform || offer.outcome !== row.outcome)
					throw new BoostPricingError(
						`${row.title}: its result changed. Review Advanced setup first.`,
						409
					);
				row.sourceUpdatedAt = offer.updatedAt.toISOString();
			}
			next.version++;
			await recordSheet(tx, next, actor, ACTIONS[3], current.record);
			return next;
		},
		{ timeout: 60000 }
	);
}

export async function saveBoostPricingDraft(
	input: unknown,
	actor: string,
	database: PrismaClient = prisma
) {
	return database.$transaction(
		async (tx) => {
			await lock(tx);
			const current = await state(tx);
			const next = cleanSheet(input, current.sheet);
			checkVersion(next.version, current.sheet.version);
			for (const row of next.rows)
				row.serviceId = parseBoostServiceId(row.provider, row.serviceId) ?? row.serviceId;
			const view = await loadBoostPricingView(tx);
			for (const row of next.rows)
				if (row.priceMode === 'target') {
					// Look up the NEW supplier/code, never trust quotes supplied by the client or old row.
					const service = await tx.boostProviderService.findUnique({
						where: { provider_serviceId: { provider: row.provider, serviceId: row.serviceId } }
					});
					const quote = service
						? ({
								...view.quotes[row.id],
								rateUsd: service.ratePerThousand === null ? null : Number(service.ratePerThousand)
							} as BoostPricingQuote)
						: null;
					const target = pricingTarget(row, next, quote);
					if (target !== null) row.sale = target;
				}
			next.version++;
			await recordSheet(tx, next, actor, ACTIONS[0], current.record);
			return next;
		},
		{ timeout: 60000 }
	);
}

export async function restoreBoostPricingDraft(
	historyId: string,
	version: number,
	actor: string,
	database: PrismaClient = prisma
) {
	return database.$transaction(
		async (tx) => {
			await lock(tx);
			const current = await state(tx);
			checkVersion(version, current.sheet.version);
			const old = await tx.adminAuditLog.findFirst({
				where: { id: historyId, resourceType: RESOURCE, action: { in: ACTIONS } }
			});
			const saved = snapshot(old?.metadata);
			if (!saved) throw new BoostPricingError('Saved version not found.', 404);
			const savedById = new Map(saved.rows.map((r) => [r.id, r]));
			const next = cleanSheet(
				{ ...saved, version, rows: current.sheet.rows.map((r) => savedById.get(r.id) ?? r) },
				current.sheet
			);
			next.version++;
			await recordSheet(tx, next, actor, ACTIONS[2], current.record);
			return next;
		},
		{ timeout: 60000 }
	);
}

/** Atomic menu publication. Never writes orders, payments, fulfilments or supplier APIs. */
export async function publishBoostPricingSheet(
	version: number,
	actor: string,
	database: PrismaClient = prisma
) {
	return database.$transaction(
		async (tx) => {
			await lock(tx);
			// Serialize with other offer editors before checking source revisions.
			await tx.$queryRaw`SELECT id FROM boost_customer_offers ORDER BY id FOR UPDATE`;
			const current = await state(tx);
			checkVersion(version, current.sheet.version);
			if (!current.record) throw new BoostPricingError('Save your draft before publishing.');
			if (env.BOOSTING_AUTOMATION_MODE !== 'live')
				throw new BoostPricingError('Live Boosting dispatch must be enabled before publishing.');
			const view = await loadBoostPricingView(tx);
			const pricing = await getBoostingPricingConfig(tx as PrismaClient);
			if (view.sheet.settings.fx !== pricing.usdNgnRate)
				throw new BoostPricingError(
					'The draft exchange rate differs from Boosting settings. Update settings or the draft before publishing.'
				);
			const selected = view.sheet.rows.filter((r) => r.selected);
			if (!selected.length) throw new BoostPricingError('Select at least one offer for the menu.');
			const offerIds = view.sheet.rows.flatMap((r) => (r.sourceOfferId ? [r.sourceOfferId] : []));
			const offers = await tx.boostCustomerOffer.findMany({
				where: { id: { in: offerIds } },
				include: { routes: true, category: true }
			});
			const maxAge = Math.max(5, Number(env.BOOSTING_CATALOG_MAX_AGE_MINUTES) || 390) * 60000;
			for (const row of selected) {
				const quote = view.quotes[row.id];
				const offer = offers.find((o) => o.id === row.sourceOfferId);
				if (!offer || !quote)
					throw new BoostPricingError(`${row.title}: result or supplier code needs setup.`);
				if (row.sourceUpdatedAt !== offer.updatedAt.toISOString())
					throw new BoostPricingError(
						`${row.title}: Advanced setup changed. Review and accept setup changes before publishing.`,
						409
					);
				if (quote.issues.length)
					throw new BoostPricingError(`${row.title}: ${quote.issues.join(' ')}`);
				if (
					quote.rateUsd === null ||
					!Number.isFinite(quote.rateUsd) ||
					quote.rateUsd <= 0 ||
					Date.now() - Date.parse(quote.checkedAt) > maxAge
				)
					throw new BoostPricingError(`${row.title}: refresh supplier costs first.`);
				if (
					quote.min === null ||
					quote.max === null ||
					row.startingQuantity < quote.min ||
					row.startingQuantity > quote.max
				)
					throw new BoostPricingError(
						`${row.title}: check the starting quantity against supplier limits.`
					);
				if (row.recoveryMode === 'fallback')
					throw new BoostPricingError(
						`${row.title}: fallback routes need Advanced setup. Choose confirmed-failure retry or Off here.`
					);
				const { profit } = pricingEconomics(row, view.sheet, quote);
				if (profit === null || profit <= 0)
					throw new BoostPricingError(
						`${row.title}: selling price does not cover cost and configured fees.`
					);
				stepPrice(row);
			}
			const next = structuredClone(view.sheet);
			for (const row of next.rows) {
				const offer = offers.find((o) => o.id === row.sourceOfferId);
				if (!offer) continue;
				if (!row.selected) {
					if (offer.status !== 'hidden') {
						const hidden = await tx.boostCustomerOffer.update({
							where: { id: offer.id },
							data: { status: 'hidden' }
						});
						row.sourceUpdatedAt = hidden.updatedAt.toISOString();
					}
					continue;
				}
				const quote = view.quotes[row.id]!;
				const sameRoute = offer.routes.find((r) => r.providerServiceId === quote.providerServiceId);
				const unchangedPrimary =
					offer.lockedRouteId === sameRoute?.id || offer.preferredRouteId === sameRoute?.id;
				const e = pricingEconomics(row, next, quote);
				// Target profit is a pricing goal; a deliberate manual price may be below that goal.
				// A conservative runtime floor must still fit the actual customer quote and fee allowance.
				const marginFloor = Math.max(
					0,
					Math.min(500, row.targetMarkup, Math.floor((e.markup ?? 0) * 100) / 100)
				);
				const saleAtStart = (row.sale * row.startingQuantity) / row.units;
				const costAtStart = (quote.rateUsd! * next.settings.fx * row.startingQuantity) / 1000;
				// Allocate the sheet's per-pack fee estimate consistently across the quantity grid.
				// Checkout may combine cheap rows; do not charge a full fixed fee to every tiny step.
				const feeAtStart = (e.fees * row.startingQuantity) / row.units;
				const maximumCost =
					Math.floor(
						Math.min(costAtStart * 1.2, (saleAtStart - feeAtStart) / (1 + marginFloor / 100)) *
							100 +
							1e-7
					) / 100;
				if (Math.ceil((costAtStart - 1e-9) * 100) > Math.floor((maximumCost + 1e-9) * 100))
					throw new BoostPricingError(
						`${row.title}: insufficient cost headroom at the starting quantity.`
					);
				const siblings = selected.filter(
					(r) => r.platform === row.platform && r.outcome === row.outcome
				);
				if (siblings.length > 1 && !row.option)
					throw new BoostPricingError(
						`${row.title}: name each option when there is more than one.`
					);
				// Do not carry an old supplier's quality/refill promises onto a newly selected service.
				const preservePromise = Boolean(unchangedPrimary && sameRoute?.equivalenceApproved);
				// Keep older approved routes available for existing frozen order snapshots. The new
				// offer is locked to its selected route, so old routes cannot receive new purchases.
				const routeData = {
					state: 'enabled',
					equivalenceApproved: true,
					equivalenceLabel: 'Owner selected in Boosting Pricing',
					targetType: offer.targetType,
					verifiedSignals: sameRoute?.equivalenceApproved ? sameRoute.verifiedSignals : [],
					audienceTags: sameRoute?.equivalenceApproved ? sameRoute.audienceTags : ['general'],
					verifiedRefillDays: sameRoute?.equivalenceApproved ? sameRoute.verifiedRefillDays : null,
					minimumQuantity: quote.min!,
					maximumQuantity: quote.max!,
					reviewedByUserId: actor,
					reviewedAt: new Date()
				};
				const route = await tx.boostServiceRoute.upsert({
					where: {
						offerId_providerServiceId: {
							offerId: offer.id,
							providerServiceId: quote.providerServiceId
						}
					},
					create: { ...routeData, offerId: offer.id, providerServiceId: quote.providerServiceId },
					update: routeData
				});
				const saved = await tx.boostCustomerOffer.update({
					where: { id: offer.id },
					data: {
						customerName: siblings.length === 1 ? row.title : row.option,
						shortPromise: preservePromise ? offer.shortPromise : '',
						expectationChips: preservePromise ? offer.expectationChips : [],
						refillDays: preservePromise ? offer.refillDays : null,
						requiredVerifiedSignals: preservePromise ? offer.requiredVerifiedSignals : [],
						minQuantity: row.startingQuantity,
						maxQuantity: quote.max,
						stepQuantity: row.increment,
						quantityPresets: getQuantityChips(
							{
								...getBoostingServiceConfig(offer.category.metadata),
								minQuantity: row.startingQuantity,
								stepQuantity: row.increment
							},
							quote.max
						),
						pricePerStepNgn: stepPrice(row),
						priceLocked: row.priceMode === 'manual',
						minimumMarginPercent: marginFloor,
						normalCostTargetNgn: Math.ceil((costAtStart - 1e-9) * 100) / 100,
						maximumSupplierCostNgn: maximumCost,
						// Existing worker retries only confirmed uncharged submission failures. Never silently
						// enable paid replacements from the draft's estimated profit budget.
						attemptCap: row.recoveryMode === 'definitive' ? row.attempts : 1,
						recoveryModes: row.recoveryMode === 'definitive' ? ['retry_definitive_failure'] : [],
						status: 'live',
						routingPolicy: 'locked',
						lockedRouteId: route.id,
						preferredRouteId: null
					}
				});
				await tx.category.update({ where: { id: offer.categoryId }, data: { isActive: true } });
				row.sourceUpdatedAt = saved.updatedAt.toISOString();
			}
			await tx.microcopy.upsert({
				where: { key: BOOSTING_MANAGED_STOREFRONT_KEY },
				create: {
					key: BOOSTING_MANAGED_STOREFRONT_KEY,
					value: 'true',
					category: 'boosting_config',
					isActive: true
				},
				update: { value: 'true', isActive: true }
			});
			next.version++;
			await recordSheet(tx, next, actor, ACTIONS[1], current.record);
			return next;
		},
		{ timeout: 60000 }
	);
}
