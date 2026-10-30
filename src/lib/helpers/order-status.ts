export const ORDER_STATUS_GROUPS = {
	pending: ['pending', 'pending_payment'],
	processing: ['processing', 'paid'],
	completed: ['completed'],
	failed: ['failed', 'cancelled'],
	revenue: ['paid', 'completed']
} as const;

export type OrderStatusGroup = keyof typeof ORDER_STATUS_GROUPS;

export function getOrderStatusLabel(status: string | null | undefined): string {
	return String(status || '')
		.replace(/_/g, ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}
