/** Completion records delivery, never a way to clear failed or unpaid orders. */
export function canCompleteOrder(order: {
	status: string;
	paymentStatus?: string;
	deliveryStatus?: string;
}): boolean {
	return (
		['paid', 'processing'].includes(order.status) &&
		['paid', 'success', 'overpaid'].includes(order.paymentStatus || '') &&
		order.deliveryStatus !== 'refunded'
	);
}
