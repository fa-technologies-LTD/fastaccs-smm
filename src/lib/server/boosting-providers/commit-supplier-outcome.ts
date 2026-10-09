import { Prisma, type PrismaClient } from '@prisma/client';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';

/** Serialize external supplier results with refunds; never hold the lock across network calls. */
export async function commitBoostSupplierOutcome(
	database: PrismaClient,
	input: {
		orderId: string;
		fulfillmentId: string;
		orderItemId: string;
		fulfillmentData: Prisma.BoostFulfillmentUpdateInput;
		itemData: Prisma.OrderItemUpdateInput;
	}
): Promise<boolean> {
	const committed = await database.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM orders WHERE id = ${input.orderId}::uuid FOR UPDATE`;
		const order = await tx.order.findUnique({
			where: { id: input.orderId },
			select: {
				status: true,
				paymentStatus: true,
				deliveryStatus: true
			}
		});
		const fulfillment = await tx.boostFulfillment.findUnique({
			where: { id: input.fulfillmentId },
			select: { status: true }
		});
		if (!order || !fulfillment) throw new Error('BOOST_RESULT_TARGET_MISSING');
		const active =
			order.paymentStatus === 'paid' &&
			['paid', 'processing'].includes(order.status) &&
			order.deliveryStatus !== 'refunded' &&
			['queued', 'submitted', 'in_progress'].includes(fulfillment.status);
		if (active) {
			await tx.boostFulfillment.update({
				where: { id: input.fulfillmentId },
				data: input.fulfillmentData
			});
			await tx.orderItem.update({ where: { id: input.orderItemId }, data: input.itemData });
			return true;
		}
		// Keep evidence, but do not re-open a cancelled/refunded/reviewed/completed delivery.
		const data: Prisma.BoostFulfillmentUpdateInput = { nextActionAt: null };
		for (const key of [
			'supplierOrderId',
			'rawProviderStatus',
			'startCount',
			'remains',
			'finalSupplierCostUsd',
			'lastCheckedAt'
		] as const) {
			if (input.fulfillmentData[key] !== undefined)
				Object.assign(data, { [key]: input.fulfillmentData[key] });
		}
		if (fulfillment.status !== 'completed') {
			data.status = 'manual_review';
			data.lastSafeErrorCategory = 'supplier_result_after_order_hold';
			if (
				['refunded', 'cancelled', 'failed'].includes(order.status) ||
				order.deliveryStatus === 'refunded'
			)
				data.customerStatus = 'cancelled';
		}
		await tx.boostFulfillment.update({ where: { id: input.fulfillmentId }, data });
		if (input.itemData.boostProviderReference !== undefined) {
			await tx.orderItem.update({
				where: { id: input.orderItemId },
				data: { boostProviderReference: input.itemData.boostProviderReference }
			});
		}
		return false;
	});
	if (!committed)
		await sendCriticalAdminAlert({
			title: 'Boosting supplier response needs review',
			message: `Order ${input.orderId}: a supplier response arrived after an order hold or terminal transition. Delivery was not reopened. Review fulfillment ${input.fulfillmentId}.`,
			source: 'boosting.supplier-result',
			dedupeKey: `boost-result-hold:${input.fulfillmentId}`
		}).catch(() => {});
	return committed;
}
