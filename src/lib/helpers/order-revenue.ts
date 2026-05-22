export const REVENUE_ORDER_STATUSES = ['paid', 'completed'] as const;
const REVENUE_STATUS_SET = new Set<string>(REVENUE_ORDER_STATUSES);

function normalize(value: string | null | undefined): string {
	return String(value || '')
		.trim()
		.toLowerCase();
}

export function isRevenueOrder(input: {
	status?: string | null;
	paymentStatus?: string | null;
}): boolean {
	const status = normalize(input.status);
	const paymentStatus = normalize(input.paymentStatus);
	return REVENUE_STATUS_SET.has(status) || paymentStatus === 'paid';
}
