import { askDecision } from '$lib/stores/decision.svelte';
import type { TierDeliveryMode } from './tier-delivery-config';

// What the cart already holds, and what the buyer is adding, in words a buyer uses.
const IN_CART: Record<TierDeliveryMode, string> = {
	instant_auto: 'accounts',
	manual_handover: 'WhatsApp-delivered accounts',
	boosting_manual: 'engagement orders',
	auto_sms: 'a number'
};
const ADDING: Record<TierDeliveryMode, string> = {
	instant_auto: 'Instant accounts',
	manual_handover: 'WhatsApp-delivered accounts',
	boosting_manual: 'Engagement orders',
	auto_sms: 'Numbers'
};

export function separateCheckoutMessage(
	inCart: TierDeliveryMode | null,
	adding: TierDeliveryMode
): string {
	return `Your cart has ${IN_CART[inCart ?? 'instant_auto']}. ${ADDING[adding]} are paid on their own.`;
}

/** Ask before emptying the cart for an item that must be bought separately. Keeping the cart is the default. */
export function confirmSeparateCheckout(
	inCart: TierDeliveryMode | null,
	adding: TierDeliveryMode
): Promise<boolean> {
	return askDecision({
		title: 'Check out separately',
		message: separateCheckoutMessage(inCart, adding),
		confirmLabel: 'Empty cart and add',
		cancelLabel: 'Keep my cart',
		tone: 'danger'
	});
}
