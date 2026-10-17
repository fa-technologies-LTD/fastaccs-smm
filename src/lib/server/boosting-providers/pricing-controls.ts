import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '$lib/prisma';
import { env } from '$env/dynamic/private';
import { getBoostingPricingConfig, BOOSTING_PRICING_KEYS } from '$lib/services/boosting-pricing';
import { stabilizePrice } from '$lib/services/phone-pricing';
import { BoostPricingError, loadBoostPricingView, lock, recordSheet, state } from './pricing-sheet';
import {
	sanitizePricingSheet,
	pricingEconomics,
	pricingStepPrice,
	pricingStart,
	pricingQuantityMaximum,
	type BoostPricingSheet,
	type BoostPricingQuote
} from '$lib/helpers/boosting-pricing-sheet';
import {
	boostAutoPrice,
	boostControlSignature,
	boostEffectiveRules,
	validateBoostRules,
	type BoostControlsView
} from '$lib/helpers/boosting-pricing-controls';
import { isThreadsService, serviceMatchesBoostOutcome } from './catalog-normalizer';
import { supportsBoostServiceInput } from '$lib/helpers/boosting-service-input';
import { getRequiredLinkType, type BoostingActionType } from '$lib/helpers/social-link-validator';
import { getBoostingServiceConfig, getQuantityChips } from '$lib/helpers/boosting-service-config';
import { inspectBoostSale } from '$lib/server/boosting-sale-readiness';
import { supplierChoice, supplierChoiceRevision } from './supplier-choice';

type Database = PrismaClient | Prisma.TransactionClient;
type Offer = Prisma.BoostCustomerOfferGetPayload<{
	include: {
		category: true;
		routes: { include: { providerService: { include: { providerState: true } } } };
	};
}>;
const includes = {
	category: true,
	routes: { include: { providerService: { include: { providerState: true } } } }
} as const;

function routesFor(offer: Offer) {
	if (offer.routingPolicy === 'locked')
		return offer.routes.filter((r) => r.id === offer.lockedRouteId);
	// Automatic quotes use the highest approved route cost, not a cheap route that cannot represent the shortlist.
	return offer.routes.filter((r) => r.equivalenceApproved && r.state === 'enabled');
}
function approvalRoutesFor(offer: Offer) {
	if (offer.routingPolicy === 'locked')
		return offer.routes.filter((r) => r.id === offer.lockedRouteId && r.state !== 'paused');
	const enabled = routesFor(offer);
	return enabled.length ? enabled : offer.routes.filter((r) => r.state === 'shadow');
}
function mappingRevision(offer: Offer) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				offer.routingPolicy,
				offer.lockedRouteId,
				offer.preferredRouteId,
				[...offer.routes]
					.sort((a, b) => a.id.localeCompare(b.id))
					.map((r) => [
						r.id,
						r.state,
						r.equivalenceApproved,
						r.minimumQuantity,
						r.maximumQuantity,
						r.quantityStep,
						r.verifiedSignals,
						r.verifiedRefillDays,
						r.audienceTags,
						supplierChoiceRevision(r.providerService)
					])
			])
		)
		.digest('hex');
}
function reviewedSupplierCost(rate: number, fx: number, quantity: number, title: string) {
	const cost = Math.ceil(((rate * fx * quantity) / 1000) * 100 - 1e-7) / 100;
	if (!Number.isFinite(cost) || cost < 0 || cost > 99999999.99)
		throw new BoostPricingError(
			`${title}: supplier cost is outside the supported budget. Choose another service or review the quantity.`
		);
	return cost;
}
function quoteFor(offer: Offer, route: Offer['routes'][number]): BoostPricingQuote {
	const service = route.providerService;
	const issues: string[] = [];
	if (service.unavailableAt || service.catalogueStatus === 'quarantined')
		issues.push('Supplier unavailable.');
	if (
		!service.platforms.includes(offer.platform) ||
		(offer.platform !== 'threads' && isThreadsService(service))
	)
		issues.push('Different platform.');
	if (
		!service.outcomes.includes(offer.outcome) ||
		!serviceMatchesBoostOutcome(service, offer.outcome)
	)
		issues.push('Different result.');
	if (
		!supportsBoostServiceInput(service.providerType, offer.outcome) ||
		service.targetType !== getRequiredLinkType(offer.outcome as BoostingActionType)
	)
		issues.push('Unsupported service inputs.');
	if (service.minQuantity === null || service.maxQuantity === null)
		issues.push('Supplier limits missing.');
	return {
		providerServiceId: service.id,
		name: service.name,
		rateUsd: service.ratePerThousand == null ? null : Number(service.ratePerThousand),
		min: Math.max(service.minQuantity ?? 0, route.minimumQuantity ?? 0),
		max: Math.min(service.maxQuantity ?? 0, route.maximumQuantity ?? Number.MAX_SAFE_INTEGER),
		checkedAt: service.lastSeenAt.toISOString(),
		issues
	};
}

/** Live offers are authoritative; historical sheet snapshots remain archived, never silently published. */
export async function loadBoostControls(database: Database = prisma): Promise<BoostControlsView> {
	const view = await loadBoostPricingView(database);
	const config = await getBoostingPricingConfig(database as PrismaClient);
	const offers = await database.boostCustomerOffer.findMany({
		where: { category: { categoryType: 'boosting_service' } },
		include: includes
	});
	const setup: BoostControlsView['setup'] = {};
	const availability: NonNullable<BoostControlsView['availability']> = {};
	const missingRows = view.sheet.rows.filter((r) => !offers.some((o) => o.id === r.sourceOfferId));
	const categories = missingRows.length
		? await database.category.findMany({
				where: { categoryType: 'boosting_service' },
				select: { id: true, metadata: true }
			})
		: [];
	let archivedDraft = false;
	view.sheet.settings.fx = config.usdNgnRate;
	view.sheet.settings.defaultMarkup = config.defaultMarginPercent;
	view.sheet.settings.profitTargetNgn ??= 0;
	view.sheet.settings.hardProfitNgn ??= 0;
	view.sheet.settings.maxPriceMultiple ??= 0;
	view.sheet.rulesRevision = createHash('sha256')
		.update(JSON.stringify(view.sheet.settings))
		.digest('hex');
	for (const row of view.sheet.rows) {
		delete row.supplierChoiceId;
		delete row.supplierChoiceRevision;
		const offer = offers.find((o) => o.id === row.sourceOfferId);
		row.supplierRevision = offer ? mappingRevision(offer) : 'unconfigured';
		if (!offer) {
			row.selected = false;
			row.sourceOfferId = null;
			row.sourceUpdatedAt = null;
			const category = categories.find((c) => {
				const m = c.metadata as Record<string, unknown> | null;
				return m?.boosting_platform === row.platform && m?.boosting_action_type === row.outcome;
			});
			if (category)
				setup[row.id] = {
					categoryId: category.id,
					routingPolicy: 'unconfigured',
					maximumCostNgn: 0,
					reviewed: false
				};
			else view.quotes[row.id] = null;
			continue;
		}
		const liveSale = (Number(offer.pricePerStepNgn) * row.units) / offer.stepQuantity;
		if (Math.abs(row.sale - liveSale) > 0.005 || row.selected !== (offer.status === 'live'))
			archivedDraft = true;
		// A legacy comparison pack can be smaller than the billable increment. Keep its
		// fractional-kobo rate exact; the actual billable step remains whole kobo.
		row.sale = liveSale;
		row.selected = offer.status === 'live' && offer.category.isActive;
		if (offer.status === 'live' && !offer.category.isActive)
			view.liveStatuses[row.id] = 'category_hidden';
		row.priceMode = offer.priceLocked ? 'manual' : 'target';
		row.increment = offer.stepQuantity;
		row.startingQuantity = offer.minQuantity;
		row.maximumQuantity = offer.maxQuantity ?? null;
		row.shortPromise = offer.shortPromise ?? '';
		row.option = offer.customerName === offer.category.name ? '' : offer.customerName;
		row.sourceUpdatedAt = offer.updatedAt.toISOString();
		const saleReadiness = inspectBoostSale(offer, config.usdNgnRate, undefined, {
			requirePublished: false
		});
		availability[row.id] = { reasons: saleReadiness.reasons, checkedAt: saleReadiness.checkedAt };
		const candidates = routesFor(offer);
		// Display the current saved configuration, including its review-only records, rather
		// than falling back to an arbitrary retired service. This is a cost projection only:
		// publish readiness and fulfillment continue to require approved, enabled mappings.
		const referenceRoutes = candidates.length
			? candidates
			: offer.routingPolicy !== 'locked'
				? offer.routes.filter((route) => route.state === 'shadow')
				: [];
		const route = referenceRoutes.reduce<Offer['routes'][number] | undefined>(
			(highest, r) =>
				!highest ||
				Number(r.providerService.ratePerThousand) > Number(highest.providerService.ratePerThousand)
					? r
					: highest,
			undefined
		);
		if (route) {
			row.provider = route.providerService.provider === 'smm_raja' ? 'smm_raja' : 'bulk_follows';
			row.serviceId = route.providerService.serviceId;
			const quotes = referenceRoutes.map((r) => quoteFor(offer, r));
			const quote = quoteFor(offer, route);
			quote.min = Math.max(...quotes.map((q) => q.min ?? 0));
			quote.max = Math.min(...quotes.map((q) => q.max ?? 0));
			quote.checkedAt = quotes.map((q) => q.checkedAt).sort()[0];
			quote.issues = [...new Set(quotes.flatMap((q) => q.issues))];
			view.quotes[row.id] = quote;
		} else {
			view.quotes[row.id] = null;
			row.serviceId = '';
		}
		setup[row.id] = {
			categoryId: offer.categoryId,
			routingPolicy: offer.routingPolicy,
			maximumCostNgn: Number(offer.maximumSupplierCostNgn),
			approvalServices: approvalRoutesFor(offer).map((r) => ({
				id: r.providerService.id,
				provider: r.providerService.provider,
				serviceId: r.providerService.serviceId,
				name: r.providerService.name
			})),
			reviewed:
				candidates.length > 0 &&
				candidates.every((r) => r.equivalenceApproved && r.state === 'enabled')
		};
	}
	view.changedRows = [];
	return {
		...view,
		setup,
		availability,
		archivedDraft,
		catalogMaxAgeMinutes: Math.max(5, Number(env.BOOSTING_CATALOG_MAX_AGE_MINUTES) || 390)
	};
}

function clean(input: unknown, current: BoostControlsView): BoostPricingSheet {
	try {
		const next = sanitizePricingSheet(input, current.sheet);
		validateBoostRules(next.settings);
		const submitted = input as BoostPricingSheet;
		if (submitted.rulesRevision !== current.sheet.rulesRevision)
			throw new BoostPricingError('Pricing rules changed. Reload before saving.', 409);
		for (const row of next.rows) {
			const original = current.sheet.rows.find((r) => r.id === row.id)!;
			const raw = submitted.rows.find((r) => r.id === row.id)!;
			if (raw.sourceUpdatedAt !== original.sourceUpdatedAt)
				throw new BoostPricingError(`${row.title}: settings changed. Reload before saving.`, 409);
			if (
				(row.selected || raw.supplierChoiceId) &&
				raw.supplierRevision !== original.supplierRevision
			)
				throw new BoostPricingError(
					`${row.title}: supplier setup or cost changed. Reload saved settings before confirming. Your draft is kept.`,
					409
				);
			if (
				raw.supplierChoiceId !== undefined &&
				(typeof raw.supplierChoiceId !== 'string' ||
					!/^[a-f0-9-]{36}$/i.test(raw.supplierChoiceId) ||
					typeof raw.supplierChoiceRevision !== 'string' ||
					!/^[a-f0-9]{64}$/.test(raw.supplierChoiceRevision))
			)
				throw new BoostPricingError(
					`${row.title}: choose a supplier from the picker before saving.`
				);
			for (const field of [
				'provider',
				'serviceId',
				'units',
				'recoveryMode',
				'attempts',
				'profitBudgetPercent'
			] as const)
				if (raw[field] !== original[field])
					throw new Error('Use supplier setup to change service details.');
			if (row.option.length > 80)
				throw new Error('Keep the customer option name within 80 characters.');
			if (raw.useDefaultMarkup !== undefined && typeof raw.useDefaultMarkup !== 'boolean')
				throw new Error('Check profit override.');
			row.useDefaultMarkup = raw.useDefaultMarkup ?? false;
			for (const field of ['profitTargetNgn', 'hardProfitNgn'] as const) {
				if (
					raw[field] !== undefined &&
					(!Number.isFinite(raw[field]) || raw[field]! < 0 || raw[field]! > 1e7)
				)
					throw new Error('Check profit override.');
				row[field] = raw[field];
			}
		}
		return next;
	} catch (error) {
		if (error instanceof BoostPricingError) throw error;
		throw new BoostPricingError(
			error instanceof Error ? error.message : 'Invalid pricing controls.'
		);
	}
}

/** Only the owner's confirmed Save may approve an explicit choice or the displayed preload. */
async function prepareSupplierReview(
	tx: Prisma.TransactionClient,
	current: BoostControlsView,
	next: BoostPricingSheet,
	actor: string
) {
	const offers = await tx.boostCustomerOffer.findMany({
		where: { category: { categoryType: 'boosting_service' } },
		include: includes
	});
	for (const row of next.rows) {
		const original = current.sheet.rows.find((r) => r.id === row.id)!;
		let offer = offers.find((o) => o.id === row.sourceOfferId);
		const approvePreload = row.selected && !original.selected && !current.setup[row.id]?.reviewed;
		if (!row.supplierChoiceId && !approvePreload) continue;
		if (row.supplierChoiceId) {
			const service = await tx.boostProviderService.findUnique({
				where: { id: row.supplierChoiceId },
				include: { providerState: true }
			});
			if (!service)
				throw new BoostPricingError(
					`${row.title}: the selected supplier service no longer exists.`
				);
			const choice = supplierChoice(service, row);
			if (choice.revision !== row.supplierChoiceRevision)
				throw new BoostPricingError(
					`${row.title}: the selected supplier details changed. Reopen Choose supplier and review it again.`,
					409
				);
			if (choice.issues.length) throw new BoostPricingError(`${row.title}: ${choice.issues[0]}`);
			const reviewedCost = reviewedSupplierCost(
				Number(service.ratePerThousand),
				next.settings.fx,
				original.startingQuantity,
				row.title
			);
			if (!offer) {
				const categoryId = current.setup[row.id]?.categoryId;
				if (!categoryId)
					throw new BoostPricingError(`${row.title}: the customer result has not been configured.`);
				offer = await tx.boostCustomerOffer.create({
					data: {
						categoryId,
						platform: row.platform,
						outcome: row.outcome,
						qualityTier: row.tier,
						targetType: getRequiredLinkType(row.outcome as BoostingActionType),
						audienceTag: 'general',
						customerName: row.option || row.title,
						shortPromise: row.shortPromise || '',
						expectationChips: [],
						minQuantity: original.startingQuantity,
						maxQuantity: row.maximumQuantity ?? null,
						stepQuantity: row.increment,
						quantityPresets: [],
						pricePerStepNgn: pricingStepPrice(row),
						priceLocked: row.priceMode === 'manual',
						requiredVerifiedSignals: [],
						refillDays: null,
						minimumMarginPercent: 0,
						normalCostTargetNgn: 0,
						maximumSupplierCostNgn: 0,
						attemptCap: 1,
						recoveryModes: [],
						status: 'hidden'
					},
					include: includes
				});
				row.sourceOfferId = offer.id;
			}
			const existing = offer.routes.find((r) => r.providerService.id === service.id);
			// Reuse recorded evidence/history, but never turn supplier advertising into verified evidence.
			const route = await tx.boostServiceRoute.upsert({
				where: { offerId_providerServiceId: { offerId: offer.id, providerServiceId: service.id } },
				create: {
					offerId: offer.id,
					providerServiceId: service.id,
					state: 'enabled',
					equivalenceApproved: true,
					targetType: service.targetType!,
					minimumQuantity: service.minQuantity!,
					maximumQuantity: service.maxQuantity!,
					verifiedSignals: [],
					audienceTags: [],
					maximumPilotQuantity: service.minQuantity!,
					reviewedByUserId: actor,
					reviewedAt: new Date()
				},
				update: {
					state: 'enabled',
					equivalenceApproved: true,
					reviewedByUserId: actor,
					reviewedAt: new Date(),
					// Existing reviewed limits, reliability and refill evidence remain intact.
					...(existing
						? {}
						: { minimumQuantity: service.minQuantity!, maximumQuantity: service.maxQuantity! })
				}
			});
			await tx.boostCustomerOffer.update({
				where: { id: offer.id },
				data: {
					routingPolicy: 'locked',
					lockedRouteId: route.id,
					preferredRouteId: null,
					maximumSupplierCostNgn: reviewedCost
				}
			});
		} else if (offer) {
			const routes = approvalRoutesFor(offer);
			if (!routes.length)
				throw new BoostPricingError(
					`${row.title}: ${current.quotes[row.id]?.issues[0] ?? 'choose a supplier before publishing.'}`
				);
			await tx.boostServiceRoute.updateMany({
				where: { id: { in: routes.map((r) => r.id) } },
				data: {
					state: 'enabled',
					equivalenceApproved: true,
					reviewedByUserId: actor,
					reviewedAt: new Date()
				}
			});
			const rate = Math.max(...routes.map((r) => Number(r.providerService.ratePerThousand)));
			await tx.boostCustomerOffer.update({
				where: { id: offer.id },
				data: {
					maximumSupplierCostNgn: reviewedSupplierCost(
						rate,
						next.settings.fx,
						original.startingQuantity,
						row.title
					)
				}
			});
		}
	}
}

/** One atomic Save: rules, changed offer prices/visibility and audit. No supplier purchases. */
export async function saveBoostControls(
	input: unknown,
	actor: string,
	database: PrismaClient = prisma,
	automatic = false,
	publicationConfirmed = false,
	preserveVisibility = false
) {
	return database.$transaction(
		async (tx) => {
			await lock(tx);
			await tx.$queryRaw`SELECT id FROM boost_customer_offers ORDER BY id FOR UPDATE`;
			await tx.$queryRaw`SELECT id FROM boost_service_routes ORDER BY id FOR UPDATE`;
			await tx.$queryRaw`SELECT key FROM microcopy WHERE key IN (${BOOSTING_PRICING_KEYS.usdNgnRate}, ${BOOSTING_PRICING_KEYS.currencyBufferPercent}, ${BOOSTING_PRICING_KEYS.defaultMarginPercent}) ORDER BY CASE key WHEN ${BOOSTING_PRICING_KEYS.usdNgnRate} THEN 0 WHEN ${BOOSTING_PRICING_KEYS.currencyBufferPercent} THEN 1 ELSE 2 END FOR UPDATE`;
			const current = await loadBoostControls(tx);
			const next = clean(input, current);
			if (preserveVisibility) {
				for (const row of next.rows)
					row.selected = current.sheet.rows.find((r) => r.id === row.id)!.selected;
			}
			if (
				next.rows.some(
					(r) => r.selected && !current.sheet.rows.find((old) => old.id === r.id)?.selected
				) &&
				!publicationConfirmed
			)
				throw new BoostPricingError('Confirm the selected offers before publishing them.');
			if (next.version !== current.sheet.version)
				throw new BoostPricingError('Newer settings were saved. Reload before saving.', 409);
			if ((automatic || preserveVisibility) && next.rows.some((r) => r.supplierChoiceId))
				throw new BoostPricingError('Supplier changes require the confirmed owner Save.');
			const needsSupplierReview =
				!automatic &&
				!preserveVisibility &&
				next.rows.some(
					(r) =>
						r.supplierChoiceId ||
						(r.selected &&
							!current.sheet.rows.find((old) => old.id === r.id)?.selected &&
							!current.setup[r.id]?.reviewed)
				);
			if (needsSupplierReview && !publicationConfirmed)
				throw new BoostPricingError('Review and confirm supplier choices before saving.');
			if (needsSupplierReview) await prepareSupplierReview(tx, current, next, actor);
			const prepared = needsSupplierReview ? await loadBoostControls(tx) : current;
			for (const row of next.rows) {
				if (!row.supplierChoiceId) continue;
				const canonical = prepared.sheet.rows.find((r) => r.id === row.id)!;
				// Record the actual server-resolved supplier in the audit, never the old
				// display-only code or browser-supplied metadata.
				row.provider = canonical.provider;
				row.serviceId = canonical.serviceId;
			}
			const offers = await tx.boostCustomerOffer.findMany({
				where: { category: { categoryType: 'boosting_service' } },
				include: includes
			});
			const maxAge = Math.max(5, Number(env.BOOSTING_CATALOG_MAX_AGE_MINUTES) || 390) * 60000;
			let applied = 0;
			for (const row of next.rows) {
				const original = current.sheet.rows.find((r) => r.id === row.id)!;
				const edited = boostControlSignature(row) !== boostControlSignature(original);
				const ruleChanges =
					boostEffectiveRules(row, next) !== boostEffectiveRules(original, current.sheet);
				if (!edited && !ruleChanges && !automatic) continue;
				const offer = offers.find((o) => o.id === row.sourceOfferId);
				if (!offer) {
					if (row.selected) throw new BoostPricingError(`${row.title}: set up this offer first.`);
					// Proposal prices may be saved to the audit draft, never to a sellable SKU.
					continue;
				}
				const quote = prepared.quotes[row.id];
				const offerEdits: Prisma.BoostCustomerOfferUpdateInput = {};
				const quantitiesChanged =
					row.startingQuantity !== original.startingQuantity ||
					row.increment !== original.increment ||
					(row.maximumQuantity ?? null) !== (original.maximumQuantity ?? null);
				if (row.option !== original.option)
					offerEdits.customerName = row.option || offer.category.name;
				if ((row.shortPromise ?? '') !== (original.shortPromise ?? ''))
					offerEdits.shortPromise = row.shortPromise ?? '';
				if (quantitiesChanged) {
					offerEdits.minQuantity = row.startingQuantity;
					offerEdits.maxQuantity = row.maximumQuantity ?? null;
					offerEdits.stepQuantity = row.increment;
					offerEdits.quantityPresets = getQuantityChips(
						{
							...getBoostingServiceConfig(offer.category.metadata),
							minQuantity: row.startingQuantity,
							stepQuantity: row.increment
						},
						row.maximumQuantity ?? null
					);
				}
				// Budgets are stored per customer minimum. Changing that quantity preserves
				// the existing per-item ceiling; it does not approve a more expensive supplier.
				const budgetScale = row.startingQuantity / original.startingQuantity;
				const approvingNow =
					needsSupplierReview &&
					Boolean(
						row.supplierChoiceId ||
							(row.selected && !original.selected && !current.setup[row.id]?.reviewed)
					);
				// An explicit new supplier approval reviews cost at the NEW minimum directly.
				// Scaling a rounded old minimum can otherwise lose a kobo and reject a valid choice.
				const reviewedCeiling =
					approvingNow && quote?.rateUsd != null
						? reviewedSupplierCost(quote.rateUsd, next.settings.fx, row.startingQuantity, row.title)
						: Math.floor(Number(offer.maximumSupplierCostNgn) * budgetScale * 100 + 1e-7) / 100;
				if (row.startingQuantity !== original.startingQuantity) {
					offerEdits.maximumSupplierCostNgn = reviewedCeiling;
					offerEdits.normalCostTargetNgn =
						Math.floor(Number(offer.normalCostTargetNgn ?? 0) * budgetScale * 100 + 1e-7) / 100;
				}
				if (!row.selected && !edited) continue;
				if (automatic && (row.priceMode !== 'target' || !row.selected)) continue;
				// Going offline must work during supplier outages. Save the owner's confirmed
				// price/lock edits at the same time, without recalculating a supplier quote.
				if (!row.selected && original.selected && !automatic) {
					let stepPrice: number;
					try {
						stepPrice = pricingStepPrice(row);
					} catch {
						throw new BoostPricingError(
							`${row.title}: price must divide into whole kobo at this increment.`
						);
					}
					const saved = await tx.boostCustomerOffer.update({
						where: { id: offer.id },
						data: {
							...offerEdits,
							status: 'hidden',
							pricePerStepNgn: stepPrice,
							priceLocked: row.priceMode === 'manual'
						}
					});
					row.sourceUpdatedAt = saved.updatedAt.toISOString();
					applied++;
					continue;
				}
				// Hidden prices are drafts, not executable spending approval. Let the owner save
				// them during supplier outages without publishing or changing reviewed budgets.
				// An inactive category with a still-live offer is deliberately not exempt.
				if (!row.selected && offer.status !== 'live' && !automatic) {
					let stepPrice: number;
					try {
						stepPrice = pricingStepPrice(row);
					} catch {
						throw new BoostPricingError(
							`${row.title}: price must divide into whole kobo at this increment.`
						);
					}
					const saved = await tx.boostCustomerOffer.update({
						where: { id: offer.id },
						data: {
							...offerEdits,
							pricePerStepNgn: stepPrice,
							priceLocked: row.priceMode === 'manual'
						}
					});
					row.sourceUpdatedAt = saved.updatedAt.toISOString();
					applied++;
					continue;
				}
				const validQuote =
					quote &&
					!quote.issues.length &&
					quote.rateUsd !== null &&
					quote.rateUsd > 0 &&
					Date.now() - Date.parse(quote.checkedAt) <= maxAge &&
					quote.min !== null &&
					quote.max !== null &&
					row.startingQuantity >= quote.min &&
					row.startingQuantity <= quote.max;
				if (!validQuote) {
					if (automatic) continue;
					const reason = !quote
						? 'review supplier setup; no supplier cost is available.'
						: quote.issues.length
							? `review supplier setup. ${quote.issues.join(' ')}`
							: quote.min != null && row.startingQuantity < quote.min
								? `starting quantity is below the supplier minimum (${quote.min}).`
								: quote.max != null && row.startingQuantity > quote.max
									? `starting quantity exceeds the supplier maximum (${quote.max}).`
									: quote.rateUsd == null || quote.rateUsd <= 0
										? 'refresh costs; the supplier price is missing.'
										: 'click Refresh costs, then Save. Your edits will be kept.';
					throw new BoostPricingError(`${row.title}: ${reason}`);
				}
				if (row.selected && !prepared.setup[row.id]?.reviewed)
					throw new BoostPricingError(`${row.title}: review supplier routes before going live.`);
				if (row.maximumQuantity != null && row.maximumQuantity > quote!.max!)
					throw new BoostPricingError(
						`${row.title}: maximum quantity exceeds the supplier limit (${quote!.max}).`
					);
				if (row.selected && !original.selected && env.BOOSTING_AUTOMATION_MODE !== 'live')
					throw new BoostPricingError('Live Boosting dispatch must be enabled.');
				if (row.priceMode === 'target') {
					const computed = boostAutoPrice(row, next, quote)!;
					if (!automatic && Math.abs(computed - row.sale) >= 0.005)
						throw new BoostPricingError(
							`${row.title}: the suggested price changed. Refresh costs and review the changes again before saving.`,
							409
						);
					row.sale = automatic
						? stabilizePrice(original.sale, computed, offer.updatedAt, new Date()).price
						: computed;
					// Profit safety wins over price smoothing when a supplier cost increase consumes the floor.
					const held = pricingEconomics(row, next, quote);
					if (
						automatic &&
						(held.profit ?? 0) < Math.max(next.settings.hardProfitNgn ?? 0, row.hardProfitNgn ?? 0)
					)
						row.sale = computed;
				}
				const economics = pricingEconomics(row, next, quote);
				const customerMaximum = pricingQuantityMaximum(row, quote!.max);
				const customerStart = pricingStart(row, quote!.max);
				if (
					customerMaximum != null &&
					(customerStart > customerMaximum || (customerStart / row.units) * row.sale <= 450)
				)
					throw new BoostPricingError(
						`${row.title}: maximum quantity is too low to reach the ₦500 checkout minimum.`
					);
				const hardFloor = Math.max(next.settings.hardProfitNgn ?? 0, row.hardProfitNgn ?? 0);
				if (
					economics.profit === null ||
					economics.profit <= 0 ||
					economics.profit + 1e-8 < hardFloor
				)
					throw new BoostPricingError(
						`${row.title}: price does not cover cost, fees and minimum retained profit.`
					);
				let stepPrice: number;
				try {
					stepPrice = pricingStepPrice(row);
				} catch {
					throw new BoostPricingError(
						`${row.title}: price must divide into whole kobo at this increment.`
					);
				}
				const scale = row.startingQuantity / row.units;
				const remaining = (row.sale - economics.fees - hardFloor) * scale;
				const existingMargin = Number(offer.minimumMarginPercent);
				const marginFloor = Math.min(existingMargin, Math.max(0, economics.markup ?? 0));
				const safeBudget =
					Math.floor(
						Math.min(remaining, ((row.sale - economics.fees) * scale) / (1 + marginFloor / 100)) *
							100 +
							1e-7
					) / 100;
				const normalCost = Math.ceil(economics.cost! * scale * 100 - 1e-7) / 100;
				// Keep reviewed cost ceilings. A pricing edit never grants a route a larger spending limit.
				const maximumCost = Math.min(reviewedCeiling, safeBudget);
				if (maximumCost + 1e-8 < normalCost) {
					if (automatic) continue;
					throw new BoostPricingError(
						`${row.title}: supplier cost exceeds the reviewed cost limit. Review supplier setup.`
					);
				}
				if (automatic && Math.abs(row.sale - original.sale) < 0.005) continue;
				if (row.selected && !automatic) {
					const availability = inspectBoostSale(
						{
							...offer,
							minQuantity: row.startingQuantity,
							maxQuantity: row.maximumQuantity ?? null,
							stepQuantity: row.increment,
							pricePerStepNgn: new Prisma.Decimal(stepPrice),
							maximumSupplierCostNgn: new Prisma.Decimal(maximumCost)
						},
						next.settings.fx,
						undefined,
						{ requirePublished: false }
					);
					if (!availability.available)
						throw new BoostPricingError(
							`${row.title}: ${availability.reasons[0] ?? 'This offer is unavailable.'} Your edits have not been saved.`
						);
				}
				const saved = await tx.boostCustomerOffer.update({
					where: { id: offer.id },
					data: {
						...offerEdits,
						pricePerStepNgn: stepPrice,
						priceLocked: row.priceMode === 'manual',
						minimumMarginPercent: marginFloor,
						normalCostTargetNgn: normalCost,
						maximumSupplierCostNgn: maximumCost,
						status: row.selected ? 'live' : offer.status
					}
				});
				if (row.selected && !offer.category.isActive)
					await tx.category.update({ where: { id: offer.categoryId }, data: { isActive: true } });
				row.sourceUpdatedAt = saved.updatedAt.toISOString();
				applied++;
			}
			if (automatic && applied === 0) return { applied: 0 };
			for (const [key, value] of [
				[BOOSTING_PRICING_KEYS.usdNgnRate, next.settings.fx],
				[
					BOOSTING_PRICING_KEYS.defaultMarginPercent,
					Math.min(500, next.settings.defaultMarkup ?? 40)
				]
			] as const)
				await tx.microcopy.upsert({
					where: { key },
					create: { key, value: String(value), category: 'settings', isActive: true },
					update: { value: String(value), isActive: true }
				});
			const previous = await state(tx);
			next.version++;
			await recordSheet(tx, next, actor, 'boosting_controls_saved', previous.record);
			return { applied };
		},
		{ timeout: 60000 }
	);
}

/** Used after successful catalogue sync; opt-in only once the owner has saved the new controls. */
export async function refreshBoostAutoPrices(database: PrismaClient = prisma) {
	const previous = await state(database);
	if (!previous.sheet.settings.defaultMarkup && previous.sheet.settings.defaultMarkup !== 0)
		return { applied: 0 };
	const view = await loadBoostControls(database);
	const actor = previous.record?.actorUserId;
	if (!actor || previous.record?.action !== 'boosting_controls_saved') return { applied: 0 };
	return saveBoostControls(view.sheet, actor, database, true);
}
