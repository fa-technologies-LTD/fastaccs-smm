import { normalizeAccountStatus } from './account-status';
import { getTierDeliveryConfig } from './tier-delivery-config';

const BUYER_VISIBLE_ACCOUNT_STATUSES = new Set(['allocated', 'delivered']);
const CONFIRMED_ORDER_STATUSES = new Set(['paid', 'processing', 'completed']);
export const CONFIRMED_PAYMENT_STATUSES = ['paid', 'success', 'overpaid'] as const;
const CONFIRMED_PAYMENT_STATUS_SET = new Set<string>(CONFIRMED_PAYMENT_STATUSES);

interface PaymentState {
	status: unknown;
	paymentStatus: unknown;
}

interface BuyerOrderAccount {
	status: unknown;
}

interface BuyerOrderItem {
	category?: {
		metadata?: unknown;
	} | null;
	accounts: BuyerOrderAccount[];
}

interface BuyerOrder extends PaymentState {
	orderItems: BuyerOrderItem[];
}

function normalize(value: unknown): string {
	return String(value || '')
		.trim()
		.toLowerCase();
}

export function isOrderPaymentConfirmed(order: PaymentState): boolean {
	return (
		CONFIRMED_PAYMENT_STATUS_SET.has(normalize(order.paymentStatus)) &&
		CONFIRMED_ORDER_STATUSES.has(normalize(order.status))
	);
}

export function getBuyerVisibleAccounts<T extends BuyerOrderAccount>(
	order: PaymentState,
	item: { category?: { metadata?: unknown } | null; accounts: T[] }
): T[] {
	if (!isOrderPaymentConfirmed(order)) return [];
	if (getTierDeliveryConfig(item.category?.metadata).mode === 'manual_handover') return [];

	return item.accounts.filter((account) =>
		BUYER_VISIBLE_ACCOUNT_STATUSES.has(normalizeAccountStatus(account.status))
	);
}

export function sanitizeBuyerOrderAccounts<T extends BuyerOrder>(order: T): T {
	return {
		...order,
		orderItems: order.orderItems.map((item) => ({
			...item,
			accounts: getBuyerVisibleAccounts(order, item)
		}))
	} as T;
}
