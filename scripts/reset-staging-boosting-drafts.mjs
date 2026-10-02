import 'dotenv/config';

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
		const totalOffers = await database.boostCustomerOffer.count();
		const offers = await database.boostCustomerOffer.findMany({
			where: {
				status: 'hidden',
				priceLocked: false,
				preferredRouteId: null,
				lockedRouteId: null,
				fulfillments: { none: {} }
			},
			select: {
				id: true,
				qualityTier: true,
				pricePerStepNgn: true,
				category: { select: { name: true } },
				routes: {
					select: {
						state: true,
						equivalenceApproved: true,
						equivalenceLabel: true,
						reviewedAt: true
					}
				}
			}
		});
		const offerIds = offers.map((offer) => offer.id);
		const audits = offerIds.length
			? await database.adminAuditLog.findMany({
					where: {
						resourceType: 'boost_customer_offer',
						resourceId: { in: offerIds },
						action: { in: ['boosting_draft_suggestions_created', 'boosting_mapping_saved'] }
					},
					select: { resourceId: true, action: true }
				})
			: [];
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
		const removable = offers.filter(
			(offer) =>
				generatedIds.has(offer.id) &&
				!reviewedIds.has(offer.id) &&
				offer.routes.every(
					(route) =>
						route.state === 'shadow' &&
						!route.equivalenceApproved &&
						route.equivalenceLabel === 'Automatically suggested; owner review required' &&
						route.reviewedAt === null
				)
		);
		const removableIds = removable.map((offer) => offer.id);
		const preview = removable.map((offer) => ({
			category: offer.category.name,
			tier: offer.qualityTier,
			price: Number(offer.pricePerStepNgn),
			routes: offer.routes.length
		}));

		if (!process.argv.includes('--confirm')) {
			console.log(
				JSON.stringify(
					{
						target: staging.hostname,
						mode: 'dry-run',
						totalOffers,
						matched: removableIds.length,
						preserved: totalOffers - removableIds.length,
						offers: preview
					},
					null,
					2
				)
			);
		} else {
			const removed = await database.boostCustomerOffer.deleteMany({
				where: { id: { in: removableIds } }
			});
			console.log(
				JSON.stringify({
					target: staging.hostname,
					mode: 'apply',
					totalOffers,
					matched: removableIds.length,
					removed: removed.count,
					preserved: totalOffers - removableIds.length,
					paidOrdersAffected: 0
				})
			);
		}
	} finally {
		await database.$disconnect();
	}
} catch (error) {
	console.error(`[boosting-draft-reset] ${error instanceof Error ? error.message : 'Failed.'}`);
	process.exitCode = 1;
}
