import { prisma } from '$lib/prisma';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';
import { getAdminSettingsSnapshot } from '$lib/services/admin-settings';
import { buildWhatsAppSupportLink } from '$lib/helpers/whatsapp';

// Fire the "order paid" admin alert only ONCE per order. Manual/boosting orders
// stay in status 'paid' (never 'completed'), so re-settlement would otherwise
// re-trigger the alert every time the old 24h cooldown lapsed. A ~10-year window
// makes the persisted dedupe record effectively permanent per order.
const NOTIFY_ONCE_PER_ORDER_MS = 3650 * 24 * 60 * 60 * 1000;

function fallbackOrderLabel(orderNumber: string | null, orderId: string): string {
	const normalizedOrderNumber = String(orderNumber || '').trim();
	if (normalizedOrderNumber) return normalizedOrderNumber;
	return `ORD-${orderId.slice(0, 8).toUpperCase()}`;
}

export async function notifyManualHandoverOrderPaid(
	orderId: string,
	source: string
): Promise<void> {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			orderNumber: true,
			totalAmount: true,
			paymentReference: true,
			guestEmail: true,
			guestPhone: true,
			deliveryContact: true,
			user: { select: { email: true, fullName: true } }
		}
	});

	if (!order) return;

	const settings = await getAdminSettingsSnapshot();
	const supportWhatsApp = settings.business.whatsappNumber;
	const customerEmail = order.guestEmail || order.user?.email || 'unknown';
	const orderLabel = fallbackOrderLabel(order.orderNumber, order.id);
	const buyerName = String(order.user?.fullName || '').trim() || 'Unknown buyer';
	const handoverMessage = `Hi, I just paid for a manual handover order.\nOrder: ${orderLabel}\nPayment ref: ${order.paymentReference || 'N/A'}`;
	const handoverLink = buildWhatsAppSupportLink(supportWhatsApp, handoverMessage);

	const bodyLines = [
		`Order: ${orderLabel}`,
		`Amount: ₦${Number(order.totalAmount || 0).toLocaleString()}`,
		`Customer: ${buyerName}`,
		`Contact: ${order.deliveryContact || order.guestPhone || customerEmail}`,
		handoverLink ? `[Open WhatsApp handover](${handoverLink})` : ''
	];

	await sendCriticalAdminAlert({
		title: 'New manual-handover order',
		message: bodyLines.join('\n'),
		source,
		preheader: `${orderLabel} · ₦${Number(order.totalAmount || 0).toLocaleString()} · ${buyerName}`,
		ctaText: 'Open order',
		ctaUrl: `https://smm.fastaccs.com/admin/orders/${order.id}`,
		dedupeKey: `manual-handover-paid:${order.id}`,
		cooldownMs: NOTIFY_ONCE_PER_ORDER_MS
	});
}

export async function notifyBoostingOrderPaid(orderId: string, source: string): Promise<void> {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			orderNumber: true,
			totalAmount: true,
			user: { select: { fullName: true } },
			orderItems: {
				where: { boostTargetUrl: { not: null } },
				select: {
					productName: true,
					boostTargetUrl: true,
					boostQuantity: true
				}
			}
		}
	});

	if (!order || order.orderItems.length === 0) return;

	const orderLabel = fallbackOrderLabel(order.orderNumber, order.id);
	const buyerName = String(order.user?.fullName || '').trim() || 'Unknown buyer';

	const bodyLines = [
		`Order: ${orderLabel}`,
		`Amount: ₦${Number(order.totalAmount || 0).toLocaleString()}`,
		`Customer: ${buyerName}`,
		'',
		'**Services**',
		...order.orderItems.map(
			(item) =>
				`- ${item.productName} · ${item.boostQuantity?.toLocaleString() ?? '?'} · [Open target](${item.boostTargetUrl})`
		)
	];

	await sendCriticalAdminAlert({
		title: 'New boosting order',
		message: bodyLines.join('\n'),
		source,
		preheader: `${orderLabel} · ₦${Number(order.totalAmount || 0).toLocaleString()} · ${order.orderItems.length} service${order.orderItems.length > 1 ? 's' : ''}`,
		ctaText: 'Open boosting orders',
		ctaUrl: 'https://smm.fastaccs.com/admin/boosting-orders',
		dedupeKey: `boosting-paid:${order.id}`,
		cooldownMs: NOTIFY_ONCE_PER_ORDER_MS
	});
}
