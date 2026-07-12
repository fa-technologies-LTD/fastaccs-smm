export function canViewRevenue(locals: App.Locals): boolean {
	return Boolean(locals.adminContext?.canViewRevenue);
}

// Per-ORDER money amounts (what a buyer paid) — visible to anyone who manages
// orders, so the assistant can process refunds. Distinct from canViewRevenue.
export function canViewOrderAmounts(locals: App.Locals): boolean {
	return Boolean(locals.adminContext?.canViewOrderAmounts);
}

// Cost basis / supplier are company-sensitive — hide from non-revenue admins.
export function redactBatchCost<T extends object>(batch: T): T {
	const next = { ...batch } as Record<string, unknown>;
	if ('supplier' in next) next.supplier = null;
	if ('costPerUnit' in next) next.costPerUnit = null;
	return next as T;
}

function redactOrderItemFinancials<T extends object>(item: T): T {
	const next = { ...item } as Record<string, unknown>;
	if ('unitPrice' in next) next.unitPrice = 0;
	if ('totalPrice' in next) next.totalPrice = 0;
	return next as T;
}

export function redactOrderFinancials<T extends object>(order: T): T {
	const next = { ...order } as Record<string, unknown>;

	if ('subtotal' in next) next.subtotal = 0;
	if ('taxAmount' in next) next.taxAmount = 0;
	if ('discountAmount' in next) next.discountAmount = 0;
	if ('totalAmount' in next) next.totalAmount = 0;
	if ('promotionCode' in next) next.promotionCode = null;
	if ('promotionId' in next) next.promotionId = null;

	if (Array.isArray(next.orderItems)) {
		next.orderItems = next.orderItems.map((item) =>
			typeof item === 'object' && item
				? redactOrderItemFinancials(item as Record<string, unknown>)
				: item
		);
	}

	return next as T;
}

export function redactOrderStatsRevenue<T extends object>(stats: T): T {
	const next = { ...stats } as Record<string, unknown>;
	if ('total_revenue' in next) next.total_revenue = 0;
	if ('todays_revenue' in next) next.todays_revenue = 0;
	if ('this_month_revenue' in next) next.this_month_revenue = 0;
	if ('totalRevenue' in next) next.totalRevenue = 0;
	if ('revenueChange' in next) next.revenueChange = 0;
	if ('affiliateSales' in next) next.affiliateSales = 0;
	if ('totalStoreCreditEarned' in next) next.totalStoreCreditEarned = 0;
	return next as T;
}
