import 'dotenv/config';

const TIER_ORDER = ['value', 'stable', 'premium'];
const AUTO_LABEL = 'Automatically suggested; owner review required';
const MAX_TIER_PRICE_RATIO = 4;

function target(name, value) {
	if (!value?.trim()) throw new Error(`${name} is not configured.`);
	const url = new URL(value.trim());
	if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
		throw new Error(`${name} must be a PostgreSQL URL.`);
	}
	return {
		url: value.trim(),
		hostname: url.hostname.toLowerCase(),
		branchHost: url.hostname.toLowerCase().replace('-pooler.', '.')
	};
}

try {
	const production = target('DIRECT_URL', process.env.DIRECT_URL);
	const staging = target('STAGING_DIRECT_URL', process.env.STAGING_DIRECT_URL);
	if (production.branchHost === staging.branchHost) {
		throw new Error('Staging resolves to production. Refusing to continue.');
	}
	process.env.DATABASE_URL = staging.url;
	process.env.DIRECT_URL = staging.url;

	const { PrismaClient } = await import('@prisma/client');
	const database = new PrismaClient();
	try {
		const audits = await database.adminAuditLog.findMany({
			where: {
				resourceType: 'boost_customer_offer',
				action: { in: ['boosting_draft_suggestions_created', 'boosting_mapping_saved'] }
			},
			select: { resourceId: true, action: true }
		});
		const generatedIds = new Set(
			audits
				.filter((audit) => audit.action === 'boosting_draft_suggestions_created')
				.map((audit) => audit.resourceId)
		);
		const reviewedIds = new Set(
			audits
				.filter((audit) => audit.action === 'boosting_mapping_saved')
				.map((audit) => audit.resourceId)
		);
		const ids = [...generatedIds].filter((id) => !reviewedIds.has(id));
		const offers = await database.boostCustomerOffer.findMany({
			where: { id: { in: ids } },
			select: {
				id: true,
				categoryId: true,
				qualityTier: true,
				displayOrder: true,
				status: true,
				priceLocked: true,
				pricePerStepNgn: true,
				minimumMarginPercent: true,
				maximumSupplierCostNgn: true,
				minQuantity: true,
				stepQuantity: true,
				preferredRouteId: true,
				lockedRouteId: true,
				category: { select: { name: true } },
				routes: {
					select: {
						state: true,
						equivalenceApproved: true,
						equivalenceLabel: true,
						reviewedAt: true,
						providerServiceId: true,
						providerService: {
							select: { provider: true, serviceId: true, name: true }
						}
					}
				}
			}
		});

		const errors = [];
		const byCategory = new Map();
		for (const offer of offers) {
			const price = Number(offer.pricePerStepNgn);
			const maximumCost = Number(offer.maximumSupplierCostNgn);
			const minimumMargin = Number(offer.minimumMarginPercent) / 100;
			const costSafeFloor =
				(maximumCost / Math.max(0.01, 1 - minimumMargin)) *
				(offer.stepQuantity / Math.max(1, offer.minQuantity));
			if (offer.status !== 'hidden')
				errors.push(`${offer.category.name}/${offer.qualityTier}: public`);
			if (offer.priceLocked)
				errors.push(`${offer.category.name}/${offer.qualityTier}: price locked`);
			if (offer.preferredRouteId || offer.lockedRouteId) {
				errors.push(`${offer.category.name}/${offer.qualityTier}: route selected`);
			}
			if (!Number.isFinite(price) || price <= 0) {
				errors.push(`${offer.category.name}/${offer.qualityTier}: invalid price`);
			}
			if (price + 0.01 < costSafeFloor) {
				errors.push(`${offer.category.name}/${offer.qualityTier}: below cost-safe floor`);
			}
			if (offer.routes.length !== 1) {
				errors.push(`${offer.category.name}/${offer.qualityTier}: ${offer.routes.length} routes`);
			}
			for (const route of offer.routes) {
				if (
					route.state !== 'shadow' ||
					route.equivalenceApproved ||
					route.equivalenceLabel !== AUTO_LABEL ||
					route.reviewedAt !== null
				) {
					errors.push(
						`${offer.category.name}/${offer.qualityTier}: route is not unapproved shadow`
					);
				}
			}
			const categoryOffers = byCategory.get(offer.categoryId) ?? [];
			categoryOffers.push(offer);
			byCategory.set(offer.categoryId, categoryOffers);
		}

		const rows = [];
		for (const categoryOffers of byCategory.values()) {
			categoryOffers.sort(
				(left, right) =>
					TIER_ORDER.indexOf(left.qualityTier) - TIER_ORDER.indexOf(right.qualityTier)
			);
			const usedServiceIds = new Set();
			let previous = null;
			for (const offer of categoryOffers) {
				const price = Number(offer.pricePerStepNgn);
				if (previous) {
					const previousPrice = Number(previous.pricePerStepNgn);
					if (price <= previousPrice) {
						errors.push(
							`${offer.category.name}: ${offer.qualityTier} is not above ${previous.qualityTier}`
						);
					}
					if (price > previousPrice * MAX_TIER_PRICE_RATIO) {
						errors.push(
							`${offer.category.name}: ${offer.qualityTier} exceeds 4x ${previous.qualityTier}`
						);
					}
				}
				for (const route of offer.routes) {
					if (usedServiceIds.has(route.providerServiceId)) {
						errors.push(`${offer.category.name}: supplier service reused across tiers`);
					}
					usedServiceIds.add(route.providerServiceId);
				}
				previous = offer;
			}
			rows.push({
				category: categoryOffers[0].category.name,
				tiers: categoryOffers.map((offer) => ({
					tier: offer.qualityTier,
					price: Number(offer.pricePerStepNgn),
					service: offer.routes[0]
						? `${offer.routes[0].providerService.provider} #${offer.routes[0].providerService.serviceId}`
						: null
				}))
			});
		}
		rows.sort((left, right) => left.category.localeCompare(right.category));

		console.log(
			JSON.stringify(
				{
					target: staging.hostname,
					offers: offers.length,
					categories: rows.length,
					errors,
					rows
				},
				null,
				2
			)
		);
		if (errors.length > 0) process.exitCode = 1;
	} finally {
		await database.$disconnect();
	}
} catch (error) {
	console.error(`[boosting-draft-audit] ${error instanceof Error ? error.message : 'Failed.'}`);
	process.exitCode = 1;
}
