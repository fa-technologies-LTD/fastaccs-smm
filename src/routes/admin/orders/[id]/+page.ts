import { getOrderById } from '$lib/services/orders';
import { error } from '@sveltejs/kit';

export const load = async ({ params, fetch }: { params: { id: string }; fetch: typeof globalThis.fetch }) => {
	const orderId = params.id;

	// Load order details
	const orderResult = await getOrderById(orderId, fetch);
	if (orderResult.error || !orderResult.data) {
		throw error(404, 'Order not found');
	}

	const rawOrder = orderResult.data;
	const orderItems = Array.isArray(rawOrder.orderItems) ? rawOrder.orderItems : [];
	const flattenedAccounts = orderItems.flatMap((item: any) => {
		const accounts = Array.isArray(item.accounts) ? item.accounts : [];
		const tierName = item.category?.name || item.productName || 'Unknown tier';
		const platformName = item.category?.parent?.name || item.productName || 'Unknown platform';

		return accounts.map((account: any) => ({
			id: account.id,
			account_username: account.username || '',
			account_email: account.email || '',
			account_password: account.password || '',
			platform_name: account.platform || platformName,
			tier_name: tierName
		}));
	});

	const orderTotal = Number(rawOrder.totalAmount || 0);
	const itemCount = orderItems.reduce(
		(sum: number, item: any) => sum + Number(item.quantity || 0),
		0
	);
	const customerName =
		rawOrder.user?.fullName ||
		rawOrder.guestEmail?.split('@')?.[0] ||
		rawOrder.deliveryContact ||
		null;

	const notes = Array.isArray(rawOrder.metadata?.notes) ? rawOrder.metadata.notes : [];
	const normalizedOrder = {
		...rawOrder,
		created_at: rawOrder.createdAt,
		total_amount: orderTotal,
		item_count: itemCount,
		payment_id: rawOrder.paymentReference || '',
		customer_name: customerName,
		customer_email: rawOrder.guestEmail || rawOrder.user?.email || '',
		metadata: {
			...(typeof rawOrder.metadata === 'object' && rawOrder.metadata ? rawOrder.metadata : {}),
			customer_phone: rawOrder.guestPhone || null,
			notes
		}
	};

	return {
		order: normalizedOrder,
		items: flattenedAccounts,
		error: null
	};
};
