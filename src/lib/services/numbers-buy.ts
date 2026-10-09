import { goto } from '$app/navigation';
import { cart } from '$lib/stores/cart.svelte';
import { trackSnapEvent } from '$lib/services/snap-pixel';
import { recordAnalyticsEvent } from '$lib/services/analytics-events';
import { showWarning } from '$lib/stores/toasts';

/**
 * Buy one verification number: shared by /numbers and the per-app/country pages so both check
 * out identically. One number per order, by construction.
 */
export async function buyNumber(input: {
	tierId: string;
	serviceId: number;
	serviceName: string;
	countryName: string;
	priceNgn: number;
}): Promise<void> {
	const compat = await cart.ensureDeliveryModeCompatibility(input.tierId, 'auto_sms');
	if (!compat.compatible) {
		showWarning(
			'Numbers check out on their own',
			'Your cart has other item types. Finish that order (or empty your cart) first, then grab your number.'
		);
		return;
	}
	// Reset the cart to exactly this number (clears any leftover), then go straight to checkout.
	cart.clear();
	cart.addTier(input.tierId, 1);
	trackSnapEvent('ADD_CART', {
		item_ids: [input.tierId],
		item_category: 'Verification numbers',
		description: `${input.serviceName} — ${input.countryName}`,
		price: input.priceNgn,
		currency: 'NGN',
		number_items: 1
	});
	recordAnalyticsEvent('add_cart', `/numbers/service/${input.serviceId}`);
	goto('/checkout');
}
