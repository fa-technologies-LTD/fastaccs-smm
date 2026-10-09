// Read-only planning rules. A candidate or an old budget approval is never permission to buy.
export const SUPPLIER_TEST_CAP_USD = 5;
const USD_UNITS = 1_000_000_000;

export function protectedOfferReasons(offer) {
	const reasons = [];
	if (offer.status !== 'hidden') reasons.push('already_reviewed_or_published');
	// A typed/approved retail price is NOT approval of an untested supplier. Preserve it
	// when changing settings, but keep hidden, unreviewed automatic routes testable.
	if (offer.routingPolicy !== 'automatic' || offer.lockedRouteId || offer.preferredRouteId)
		reasons.push('owner_selected_routing');
	if (
		(offer.routes ?? []).some(
			(route) => route.equivalenceApproved || route.reviewedAt || route.reviewedByUserId
		)
	)
		reasons.push('route_already_reviewed');
	return reasons;
}

export function protectedSupplierServices(offers) {
	return new Set(
		offers
			.filter((offer) => protectedOfferReasons(offer).length)
			.flatMap((offer) =>
				(offer.routes ?? []).map(
					(route) => `${route.providerService.provider}:${route.providerService.serviceId}`
				)
			)
	);
}

export function previouslyDispatchedServices(journals) {
	return new Set(
		journals.flatMap((journal) => {
			if (!Array.isArray(journal.orders)) throw new Error('Invalid supplier test journal.');
			return journal.orders
				.filter((order) => order.dispatchStartedAt || order.supplierOrderId)
				.map((order) => `${order.provider}:${order.serviceId}`);
		})
	);
}

function quoteUnits(value) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
		throw new Error('Missing or invalid supplier quote: stop and reconcile the budget.');
	const units = Math.ceil(value * USD_UNITS);
	if (!Number.isSafeInteger(units))
		throw new Error('Supplier quote exceeds safe budget precision.');
	return units;
}

export function supplierTestBudget(journals, proposedQuotes = []) {
	// Reserve every quote, even an unsubmitted, cancelled, or uncertain request. Do not free
	// budget automatically merely because a status says cancelled or a charge field is blank.
	let reserved = 0;
	for (const journal of journals) {
		if (!Array.isArray(journal.orders)) throw new Error('Invalid supplier test journal.');
		for (const order of journal.orders) reserved += quoteUnits(order.costUsd);
	}
	const proposed = proposedQuotes.reduce((sum, quote) => sum + quoteUnits(quote), 0);
	const combined = reserved + proposed;
	if (!Number.isSafeInteger(combined)) throw new Error('Invalid combined supplier test budget.');
	return {
		reservedUsd: reserved / USD_UNITS,
		proposedUsd: proposed / USD_UNITS,
		combinedUsd: combined / USD_UNITS,
		withinHardCap: combined < SUPPLIER_TEST_CAP_USD * USD_UNITS,
		approvalRequired: true
	};
}

export function assertHistoricalTestReadOnly(mode) {
	if (['--submit', '--continue-bulk'].includes(mode))
		throw new Error(
			'Historical paid-test runners are closed. A new, explicitly approved batch quote is required before any purchase.'
		);
}
