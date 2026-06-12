import { env } from '$env/dynamic/private';

export const CHECKOUT_DISABLED_CODE = 'CHECKOUT_TEMPORARILY_DISABLED';
export const CHECKOUT_DISABLED_MESSAGE =
	'Checkout is temporarily unavailable. Your cart is safe. Please try again shortly or contact support.';

export function isNewCheckoutInitializationDisabled(): boolean {
	return String(env.CHECKOUT_DISABLED || process.env.CHECKOUT_DISABLED || '')
		.trim()
		.toLowerCase() === 'true';
}
