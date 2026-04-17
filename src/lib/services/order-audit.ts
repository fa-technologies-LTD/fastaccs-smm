type StatusTransitionSource = 'verify' | 'webhook' | 'reconcile' | 'manual';

interface StatusTransitionLogInput {
	orderId: string;
	source: StatusTransitionSource;
	fromStatus: string | null | undefined;
	toStatus: string | null | undefined;
	fromPaymentStatus?: string | null | undefined;
	toPaymentStatus?: string | null | undefined;
}

export function logOrderStatusTransition(input: StatusTransitionLogInput): void {
	const fromStatus = input.fromStatus || null;
	const toStatus = input.toStatus || null;
	const fromPaymentStatus = input.fromPaymentStatus || null;
	const toPaymentStatus = input.toPaymentStatus || null;

	if (fromStatus === toStatus && fromPaymentStatus === toPaymentStatus) {
		return;
	}

	console.info('[orders.status_transition]', {
		orderId: input.orderId,
		source: input.source,
		fromStatus,
		toStatus,
		fromPaymentStatus,
		toPaymentStatus,
		at: new Date().toISOString()
	});
}
