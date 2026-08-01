export type OrderServiceType = 'numbers' | 'boosting' | 'account';

/**
 * Classify an order for the admin service icons (📞 numbers / ⚡ boosting / accounts).
 * Prefers the explicit orderType, falling back to item shape (boost link / "Numbers …" name).
 */
export function getOrderServiceType(order: {
	orderType?: string | null;
	orderItems?: Array<{ productName?: string | null; boostTargetUrl?: string | null } | null> | null;
}): OrderServiceType {
	if (order.orderType === 'phone') return 'numbers';
	if (order.orderType === 'boosting') return 'boosting';
	const items = order.orderItems ?? [];
	if (items.some((i) => i?.boostTargetUrl)) return 'boosting';
	if (items.some((i) => (i?.productName ?? '').startsWith('Numbers'))) return 'numbers';
	return 'account';
}
