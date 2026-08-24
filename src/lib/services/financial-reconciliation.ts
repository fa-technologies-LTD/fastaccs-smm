import { prisma } from '$lib/prisma';
import { REFUNDED_MARKER } from '$lib/helpers/order-revenue';
import { SC_CREDIT_REFUND } from '$lib/services/store-credit';

export interface FinancialReconciliationIssue {
	key: string;
	orderId: string;
	orderNumber: string;
	message: string;
	expected?: number;
	actual?: number;
}

export interface FinancialReconciliation {
	checkedAt: string;
	ordersChecked: number;
	issues: FinancialReconciliationIssue[];
	issueCount: number;
	ok: boolean;
}

const ACTIVE_LEDGER_STATUSES = new Set([
	'available',
	'pending',
	'under_review',
	'requested',
	'paid'
]);

function metadataOrderId(value: unknown): string | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const id = (value as Record<string, unknown>).orderId;
	return typeof id === 'string' && id ? id : null;
}

/** Read-only cross-ledger audit. It reports contradictions and never repairs them silently. */
export async function getFinancialReconciliation(): Promise<FinancialReconciliation> {
	const [orders, refundCredits] = await Promise.all([
		prisma.order.findMany({
			select: {
				id: true,
				orderNumber: true,
				totalAmount: true,
				refundedAmount: true,
				status: true,
				paymentStatus: true,
				deliveryStatus: true,
				orderItems: {
					select: { refundedAmount: true, accounts: { select: { id: true } } }
				}
			}
		}),
		prisma.walletTransaction.findMany({
			where: { type: SC_CREDIT_REFUND },
			select: { amount: true, status: true, reference: true, metadata: true }
		})
	]);

	const orderIds = new Set(orders.map((order) => order.id));
	const orderIdByAccountId = new Map(
		orders.flatMap((order) =>
			order.orderItems.flatMap((item) =>
				item.accounts.map((account) => [account.id, order.id] as const)
			)
		)
	);
	const creditsByOrder = new Map<string, number>();
	for (const credit of refundCredits) {
		if (!ACTIVE_LEDGER_STATUSES.has(String(credit.status || '').toLowerCase())) continue;
		const metadataId = metadataOrderId(credit.metadata);
		const reference = String(credit.reference || '');
		const orderId =
			(metadataId && orderIds.has(metadataId) ? metadataId : null) ||
			(orderIds.has(reference) ? reference : null) ||
			orderIdByAccountId.get(reference) ||
			null;
		if (!orderId) continue;
		creditsByOrder.set(
			orderId,
			(creditsByOrder.get(orderId) || 0) + Math.max(0, Number(credit.amount || 0))
		);
	}

	const issues: FinancialReconciliationIssue[] = [];
	for (const order of orders) {
		const total = Math.max(0, Number(order.totalAmount || 0));
		const storedRefund = Math.max(0, Number(order.refundedAmount || 0));
		const ledgerRefund = Math.max(0, creditsByOrder.get(order.id) || 0);
		const itemRefund = order.orderItems.reduce(
			(sum, item) => sum + Math.max(0, Number(item.refundedAmount || 0)),
			0
		);
		const markers = [order.status, order.paymentStatus, order.deliveryStatus].filter(
			(value) => String(value || '').toLowerCase() === REFUNDED_MARKER
		).length;

		if (Math.abs(storedRefund - ledgerRefund) > 0.01) {
			issues.push({
				key: 'order_vs_refund_ledger',
				orderId: order.id,
				orderNumber: order.orderNumber,
				message: 'Stored refund amount does not match valid store-credit refund entries.',
				expected: ledgerRefund,
				actual: storedRefund
			});
		}
		if (Math.abs(storedRefund - itemRefund) > 0.01) {
			issues.push({
				key: 'order_vs_item_refunds',
				orderId: order.id,
				orderNumber: order.orderNumber,
				message: 'Order refund total does not reconcile to its item-attributed refunds.',
				expected: storedRefund,
				actual: itemRefund
			});
		}
		if (storedRefund > total + 0.01 || ledgerRefund > total + 0.01) {
			issues.push({
				key: 'refund_exceeds_order',
				orderId: order.id,
				orderNumber: order.orderNumber,
				message: 'Refunded value exceeds the original order value.',
				expected: total,
				actual: Math.max(storedRefund, ledgerRefund)
			});
		}
		const fullyRefunded = storedRefund >= total - 0.01 && total > 0;
		if (fullyRefunded && markers < 3) {
			issues.push({
				key: 'full_refund_markers',
				orderId: order.id,
				orderNumber: order.orderNumber,
				message: 'Fully refunded order does not have all terminal refund markers.'
			});
		}
		if (markers > 0 && ledgerRefund <= 0) {
			issues.push({
				key: 'refund_marker_without_credit',
				orderId: order.id,
				orderNumber: order.orderNumber,
				message: 'Order says refunded but no valid refund credit was found.'
			});
		}
	}

	return {
		checkedAt: new Date().toISOString(),
		ordersChecked: orders.length,
		issues: issues.slice(0, 100),
		issueCount: issues.length,
		ok: issues.length === 0
	};
}
