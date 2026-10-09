import { prisma } from '$lib/prisma';

/** Missing certainty is conservative: never release money/stock for an ambiguous gateway call. */
export function isDefinitiveInitializationFailure(result: {
	errorCode?: string;
	failureCertainty?: string;
}): boolean {
	return (
		result.failureCertainty === 'rejected' ||
		['invalid_amount', 'unsupported_currency'].includes(result.errorCode || '')
	);
}

export async function holdUncertainInitialization(
	orderId: string,
	paymentReference: string
): Promise<void> {
	await prisma.order.updateMany({
		where: {
			id: orderId,
			paymentReference,
			status: { in: ['pending', 'pending_payment'] },
			paymentStatus: { in: ['pending', 'processing'] }
		},
		data: {
			status: 'pending_payment',
			paymentStatus: 'processing',
			cancellationReason: 'initialization_unknown'
		}
	});
}
