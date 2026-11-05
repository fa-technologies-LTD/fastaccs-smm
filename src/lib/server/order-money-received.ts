import { prisma } from '$lib/prisma';
import { verifyPayment } from '$lib/services/payment';
import { SC_REDEEM_EARNED, SC_REDEEM_PROMO, SC_REDEEM_REFUND } from '$lib/services/store-credit';
import { isSuccessPaymentStatus, normalizePaymentStatus } from '$lib/helpers/payment-status';
import { isVerifiedPaymentBoundToOrder } from '$lib/helpers/payment-binding';
import { MONEY_IN_PAYMENT_STATUSES } from '$lib/helpers/order-refund-lock';
import { moneyNgn } from '$lib/helpers/money';

export type MoneyReceived =
	| { status: 'confirmed'; transfer: number; storeCredit: number }
	| { status: 'short'; transfer: number; storeCredit: number; total: number }
	| { status: 'unavailable' }
	| { status: 'not_paid' };

/**
 * What the customer really paid for an order, read from the records that hold the money rather than the
 * order's own labels: Monnify's record of the transfer (in naira, for this exact order) plus the store credit
 * taken from their balance for it. Labels can be edited; these records cannot. An order's total is exactly
 * those two parts, so anything less means a refund would pay out money that never arrived.
 * Ask this before opening a refund transaction, so no network call happens while the order row is locked.
 */
export async function confirmMoneyReceived(orderId: string): Promise<MoneyReceived> {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: { id: true, paymentStatus: true, paymentReference: true, totalAmount: true }
	});
	if (!order || !MONEY_IN_PAYMENT_STATUSES.has(String(order.paymentStatus || '').toLowerCase()))
		return { status: 'not_paid' };

	const spent = await prisma.walletTransaction.aggregate({
		where: {
			type: { in: [SC_REDEEM_EARNED, SC_REDEEM_REFUND, SC_REDEEM_PROMO] },
			status: { notIn: ['failed', 'reversed', 'cancelled'] },
			metadata: { path: ['orderId'], equals: order.id }
		},
		_sum: { amount: true }
	});
	const storeCredit = moneyNgn(spent._sum.amount);

	let transfer = 0;
	if (order.paymentReference) {
		const verified = await verifyPayment(order.paymentReference).catch(() => null);
		if (!verified || verified.status === 'error') return { status: 'unavailable' };
		const paid =
			verified.success || isSuccessPaymentStatus(normalizePaymentStatus(verified.status));
		const metadataOrderId =
			typeof verified.metaData?.orderId === 'string' ? verified.metaData.orderId : null;
		const bound = isVerifiedPaymentBoundToOrder({
			orderId: order.id,
			metadataOrderId,
			storedPaymentReference: order.paymentReference,
			verifiedPaymentReference: verified.paymentReference || null
		});
		if (paid && bound && String(verified.currency || '').toUpperCase() === 'NGN')
			transfer = moneyNgn(verified.amountPaid);
	}

	const total = moneyNgn(order.totalAmount);
	return moneyNgn(transfer + storeCredit) >= total
		? { status: 'confirmed', transfer, storeCredit }
		: { status: 'short', transfer, storeCredit, total };
}

/** Why a refund was refused when the money behind it could not be confirmed, for the admin who asked. */
export function unconfirmedMoneyError(received: MoneyReceived): {
	status: 409 | 503;
	error: string;
} {
	if (received.status === 'unavailable')
		return {
			status: 503,
			error:
				'Monnify could not be reached to confirm this payment, so nothing was refunded. Try again in a minute.'
		};
	const naira = (value: number) => `₦${value.toLocaleString('en-NG')}`;
	const confirmed =
		received.status === 'short'
			? `Only ${naira(received.transfer + received.storeCredit)} of ${naira(received.total)} could be confirmed (Monnify ${naira(received.transfer)}, store credit ${naira(received.storeCredit)})`
			: 'This payment could not be confirmed';
	return {
		status: 409,
		error: `${confirmed}, so nothing was refunded. Check this payment in Monnify.`
	};
}
