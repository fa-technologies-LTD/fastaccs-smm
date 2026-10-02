import 'dotenv/config';

const TIER_ORDER = ['value', 'stable', 'premium'];
const AUTO_LABEL = 'Automatically suggested; owner review required';
const TIER_PRICE_BANDS = {
	stable: { minimum: 2.5, maximum: 3 },
	premium: { minimum: 5, maximum: 6 }
};
const AUDIENCE_OUTCOMES = new Set(['followers', 'subscribers', 'members']);
const OUTCOME_MAXIMUM_RATIOS = {
	likes: 0.75,
	reactions: 0.75,
	reposts: 0.75,
	shares: 0.75,
	saves: 0.75,
	views: 0.35,
	streams: 0.35
};

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
				platform: true,
				outcome: true,
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
			const affordable = categoryOffers.find((offer) => offer.qualityTier === 'value');
			if (!affordable) errors.push(`${categoryOffers[0].category.name}: no Affordable tier`);
			for (const offer of categoryOffers) {
				const price = Number(offer.pricePerStepNgn);
				const band = TIER_PRICE_BANDS[offer.qualityTier];
				if (affordable && band) {
					const affordablePrice = Number(affordable.pricePerStepNgn);
					if (price < affordablePrice * band.minimum) {
						errors.push(`${offer.category.name}: ${offer.qualityTier} is below its price band`);
					}
					if (price > affordablePrice * band.maximum) {
						errors.push(`${offer.category.name}: ${offer.qualityTier} exceeds its price band`);
					}
				}
				for (const route of offer.routes) {
					if (usedServiceIds.has(route.providerServiceId)) {
						errors.push(`${offer.category.name}: supplier service reused across tiers`);
					}
					usedServiceIds.add(route.providerServiceId);
				}
			}
			rows.push({
				category: categoryOffers[0].category.name,
				platform: categoryOffers[0].platform,
				outcome: categoryOffers[0].outcome,
				stepQuantity: categoryOffers[0].stepQuantity,
				tiers: categoryOffers.map((offer) => ({
					tier: offer.qualityTier,
					price: Number(offer.pricePerStepNgn),
					service: offer.routes[0]
						? `${offer.routes[0].providerService.provider} #${offer.routes[0].providerService.serviceId}`
						: null
				}))
			});
		}
		const audiencePricePerThousandByPlatform = new Map();
		for (const row of rows) {
			if (!AUDIENCE_OUTCOMES.has(row.outcome)) continue;
			const affordable = row.tiers.find((tier) => tier.tier === 'value');
			if (affordable) {
				audiencePricePerThousandByPlatform.set(
					row.platform,
					Math.max(
						audiencePricePerThousandByPlatform.get(row.platform) ?? 0,
						(affordable.price * 1000) / row.stepQuantity
					)
				);
			}
		}
		for (const row of rows) {
			const maximumRatio = OUTCOME_MAXIMUM_RATIOS[row.outcome];
			const audiencePrice = audiencePricePerThousandByPlatform.get(row.platform);
			const affordable = row.tiers.find((tier) => tier.tier === 'value');
			if (!maximumRatio || !audiencePrice || !affordable) continue;
			const roundedCeiling = Math.max(
				50,
				Math.floor((audiencePrice * maximumRatio * row.stepQuantity) / 1000 / 50) * 50
			);
			if (affordable.price > roundedCeiling) {
				errors.push(`${row.category}: Affordable exceeds its audience-relative price band`);
			}
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
