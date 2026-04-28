import { prisma } from '$lib/prisma';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';
import { getAdminSettingsSnapshot } from '$lib/services/admin-settings';
import { buildWhatsAppSupportLink } from '$lib/helpers/whatsapp';

function fallbackOrderLabel(orderNumber: string | null, orderId: string): string {
	const normalizedOrderNumber = String(orderNumber || '').trim();
	if (normalizedOrderNumber) return normalizedOrderNumber;
	return `ORD-${orderId.slice(0, 8).toUpperCase()}`;
}

export async function notifyManualHandoverOrderPaid(orderId: string, source: string): Promise<void> {
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
			user: {
				select: {
					email: true,
					fullName: true
				}
			}
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
		'Manual handover payment confirmed.',
		`Order: ${orderLabel}`,
		`Order ID: ${order.id}`,
		`Amount: ₦${Number(order.totalAmount || 0).toLocaleString()}`,
		`Payment reference: ${order.paymentReference || 'N/A'}`,
		`Buyer: ${buyerName}`,
		`Buyer email: ${customerEmail}`,
		`Buyer phone: ${order.guestPhone || 'N/A'}`,
		`Delivery contact: ${order.deliveryContact || 'N/A'}`,
		handoverLink ? `Open WhatsApp handover: ${handoverLink}` : 'Support WhatsApp link unavailable'
	];

	await sendCriticalAdminAlert({
		title: 'Manual handover order paid',
		message: bodyLines.join('\n'),
		source,
		dedupeKey: `manual-handover-paid:${order.id}`,
		cooldownMs: 24 * 60 * 60 * 1000
	});
}
