export const ORDER_STATUS_GROUPS = {
	pending: ['pending', 'pending_payment'],
	processing: ['processing', 'paid'],
	completed: ['completed'],
	failed: ['failed', 'cancelled'],
	revenue: ['paid', 'completed']
} as const;

export type OrderStatusGroup = keyof typeof ORDER_STATUS_GROUPS;

const ORDER_STATUS_LOOKUP: Record<OrderStatusGroup, Set<string>> = {
	pending: new Set(ORDER_STATUS_GROUPS.pending),
	processing: new Set(ORDER_STATUS_GROUPS.processing),
	completed: new Set(ORDER_STATUS_GROUPS.completed),
	failed: new Set(ORDER_STATUS_GROUPS.failed),
	revenue: new Set(ORDER_STATUS_GROUPS.revenue)
};

export function isOrderStatusInGroup(
	status: string | null | undefined,
	group: OrderStatusGroup
): boolean {
	if (!status) return false;
	return ORDER_STATUS_LOOKUP[group].has(String(status).toLowerCase());
}

export function getOrderStatusLabel(status: string | null | undefined): string {
	return String(status || '')
		.replace(/_/g, ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}
