import { page } from '@vitest/browser/context';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '../../app.css';
import Checkout from './+page.svelte';
import NumbersOtpCard from '$lib/components/NumbersOtpCard.svelte';
import MiniCart from '$lib/components/MiniCart.svelte';
import CookieConsentBar from '$lib/components/CookieConsentBar.svelte';
import { cart } from '$lib/stores/cart.svelte';
const mocks = vi.hoisted(() => ({ goto: vi.fn(), createOrder: vi.fn(), warning: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto, invalidateAll: vi.fn() }));
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/checkout'), data: { user: null } }
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/services/orders', () => ({ createOrder: mocks.createOrder }));
vi.mock('$lib/stores/toasts', () => ({
	showWarning: mocks.warning,
	showError: vi.fn(),
	showSuccess: vi.fn(),
	addToast: vi.fn()
}));
const phone = {
	orderItemId: 'fixture-old',
	serviceName: 'WhatsApp',
	countryName: 'Brazil',
	phoneNumber: '+5511999991111',
	status: 'received',
	otp: '111111',
	smsMessage: null
};
const user = {
	id: 'fixture-buyer',
	email: 'buyer@example.invalid',
	emailVerified: true,
	fullName: 'Fixture buyer'
};
let price = 500;
function line() {
	return {
		...cart.items[0],
		tier: {
			id: 'fixture-category',
			name: 'Instagram Likes',
			price,
			slug: 'instagram-likes',
			platformName: 'Instagram',
			platformSlug: 'instagram',
			isActive: true,
			deliveryMode: 'boosting_manual',
			boostingConfig: {
				minQuantity: 200,
				stepQuantity: 200,
				pricePerStep: price,
				platform: 'instagram',
				actionType: 'likes'
			}
		}
	};
}
function seed() {
	cart.addBoostingService(
		'fixture-category',
		'https://instagram.com/p/fixture/',
		200,
		'fixture-offer'
	);
}
beforeEach(async () => {
	await page.viewport(390, 844);
	cart.clear();
	cart.close();
	localStorage.clear();
	price = 500;
	mocks.goto.mockReset();
	mocks.warning.mockReset();
	mocks.createOrder.mockReset();
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input) =>
			String(input).includes('/api/cart/refresh')
				? Response.json({
						success: true,
						data: { items: cart.items.length ? [line()] : [], messages: [] }
					})
				: Response.json({ success: true, data: [] })
		)
	);
});
afterEach(() => {
	cart.clear();
	cart.close();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
it('does not redirect a removed Boosting offer to Numbers or clear other cart items', async () => {
	seed();
	mocks.createOrder.mockResolvedValue({
		success: false,
		code: 'ITEM_UNAVAILABLE',
		error: 'HTTP 409: Instagram Likes: this customer option is no longer available.'
	});
	render(Checkout, {
		data: { user, storeCredit: { totalAvailable: 0 }, affiliateRef: null }
	} as never);
	await page.getByRole('button', { name: 'Pay Now', exact: true }).click();
	await expect.poll(() => mocks.warning.mock.calls.length).toBeGreaterThan(0);
	expect(mocks.goto.mock.calls.some((call) => call[0] === '/numbers')).toBe(false);
	expect(cart.itemCount).toBe(1);
});
it('expires successful quotes and supports an explicit fresh quote', async () => {
	seed();
	await cart.getItemsWithTiers();
	const now = Date.now();
	vi.spyOn(Date, 'now').mockReturnValue(now + 3 * 60 * 60 * 1000);
	price = 1000;
	const refreshed = await cart.getItemsWithTiers();
	expect(refreshed[0].tier.price).toBe(1000);
	expect(fetch).toHaveBeenCalledTimes(2);
	await cart.getItemsWithTiers({ force: true });
	expect(fetch).toHaveBeenCalledTimes(3);
});
it('does not discard an uncertain payment attempt based on generic unavailable wording', async () => {
	seed();
	mocks.createOrder.mockResolvedValue({
		success: false,
		error: 'HTTP 503: Payment service temporarily unavailable'
	});
	render(Checkout, {
		data: { user, storeCredit: { totalAvailable: 0 }, affiliateRef: null }
	} as never);
	await page.getByRole('button', { name: 'Pay Now', exact: true }).click();
	await expect.poll(() => mocks.createOrder.mock.calls.length).toBe(1);
	expect(JSON.parse(localStorage.getItem('fastaccs_checkout_session')!).request).toMatchObject({
		userId: user.id
	});
	expect(cart.itemCount).toBe(1);
	expect(mocks.goto).not.toHaveBeenCalled();
});
it('resumes the original accepted request after a lost response even if current prices have changed', async () => {
	seed();
	price = 1000;
	const request = {
		userId: user.id,
		email: user.email,
		phone: '',
		items: [{ categoryId: 'fixture-category', quantity: 1 }],
		currency: 'NGN',
		paymentMethod: 'monnify',
		totalAmount: 500,
		checkoutKey: 'fixture-existing-checkout',
		analytics: { ga4ClientId: '123456.654321', consentGranted: true },
		acceptedQuote: {
			subtotal: 500,
			discount: 0,
			total: 500,
			creditApplied: 0,
			payable: 500,
			linePrices: [500]
		}
	};
	localStorage.setItem(
		'fastaccs_checkout_session',
		JSON.stringify({ key: request.checkoutKey, request })
	);
	mocks.createOrder.mockResolvedValue({
		success: false,
		error: 'HTTP 503: Fixture payment setup still pending'
	});
	render(Checkout, {
		data: { user, storeCredit: { totalAvailable: 0 }, affiliateRef: null }
	} as never);
	await page.getByRole('button', { name: 'Continue saved checkout', exact: true }).click();
	const { analytics: _previousConsent, ...financialIntent } = request;
	expect(mocks.createOrder.mock.calls[0][0]).toMatchObject(financialIntent);
	expect(mocks.createOrder.mock.calls[0][0].analytics).toMatchObject({
		consentGranted: false,
		ga4ClientId: null
	});
	expect(
		JSON.parse(localStorage.getItem('fastaccs_checkout_session')!).request.analytics
	).toBeUndefined();
	expect(mocks.goto).not.toHaveBeenCalled();
});
it('clears the current cart when another tab removes the storage key', () => {
	seed();
	localStorage.removeItem('fastaccs_cart');
	window.dispatchEvent(
		new StorageEvent('storage', { key: 'fastaccs_cart', newValue: null, storageArea: localStorage })
	);
	expect(cart.itemCount).toBe(0);
});
it('requires another click after refreshing a changed price, before creating any order', async () => {
	seed();
	render(Checkout, {
		data: { user, storeCredit: { totalAvailable: 0 }, affiliateRef: null }
	} as never);
	await expect.element(page.getByRole('button', { name: 'Pay Now', exact: true })).toBeEnabled();
	price = 1000;
	await page.getByRole('button', { name: 'Pay Now', exact: true }).click();
	await expect
		.element(page.getByRole('button', { name: 'Confirm updated total & continue', exact: true }))
		.toBeEnabled();
	expect(mocks.createOrder).not.toHaveBeenCalled();
	mocks.createOrder.mockResolvedValue({
		success: false,
		error: 'Fixture stops before order creation'
	});
	await page.getByRole('button', { name: 'Confirm updated total & continue', exact: true }).click();
	expect(mocks.createOrder.mock.calls[0][0]).toMatchObject({
		totalAmount: 1000,
		acceptedQuote: { total: 1000, payable: 1000 }
	});
});
it('uses the server quote for a changed credit balance and asks for confirmation', async () => {
	seed();
	mocks.createOrder.mockResolvedValue({
		success: false,
		code: 'CHECKOUT_PRICE_CHANGED',
		quote: {
			subtotal: 500,
			discount: 0,
			total: 500,
			payable: 300,
			creditApplied: 200,
			linePrices: [500]
		}
	});
	render(Checkout, {
		data: {
			user,
			storeCredit: { totalAvailable: 500, refundAvailable: 500, earnedAvailable: 0 },
			affiliateRef: null
		}
	} as never);
	await page.getByRole('checkbox', { name: /Use store credit/ }).click();
	await page.getByRole('button', { name: 'Complete Order', exact: true }).click();
	await expect
		.element(page.getByRole('button', { name: 'Confirm updated total & continue', exact: true }))
		.toBeEnabled();
	expect(mocks.createOrder).toHaveBeenCalledTimes(1);
	await page.getByRole('button', { name: 'Confirm updated total & continue', exact: true }).click();
	expect(mocks.createOrder.mock.calls[1][0].acceptedQuote).toMatchObject({
		creditApplied: 200,
		payable: 300
	});
});
it('resets the code and number when an order changes', async () => {
	const view = render(NumbersOtpCard, { phone });
	await expect.element(page.getByRole('button', { name: '111111', exact: true })).toBeVisible();
	await view.rerender({
		phone: {
			...phone,
			orderItemId: 'fixture-new',
			countryName: 'Canada',
			phoneNumber: '+14165552222',
			otp: '222222'
		}
	});
	await expect.element(page.getByRole('button', { name: '222222', exact: true })).toBeVisible();
	expect(page.getByRole('button', { name: '111111', exact: true }).query()).toBeNull();
});
it('ignores a late response for the previous number order', async () => {
	let resolve!: (response: Response) => void;
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise<Response>((r) => {
					resolve = r;
				})
		)
	);
	const view = render(NumbersOtpCard, { phone: { ...phone, status: 'awaiting_sms', otp: null } });
	await expect.poll(() => fetch).toHaveBeenCalled();
	await view.rerender({
		phone: { ...phone, orderItemId: 'fixture-new', countryName: 'Canada', otp: '222222' }
	});
	resolve(Response.json({ status: 'received', otp: '999999' }));
	await expect.element(page.getByRole('button', { name: '222222', exact: true })).toBeVisible();
	expect(page.getByRole('button', { name: '999999', exact: true }).query()).toBeNull();
});
it('explains a failed Numbers order without falsely claiming its refund is complete', async () => {
	render(NumbersOtpCard, {
		phone: { ...phone, status: 'failed', phoneNumber: null, otp: null, refundConfirmed: false }
	});
	await expect
		.element(page.getByText('This number order couldn’t be completed', { exact: true }))
		.toBeVisible();
	expect(page.getByText('Refund complete', { exact: true }).query()).toBeNull();
	await expect
		.element(page.getByRole('link', { name: 'View store credit', exact: true }))
		.toBeVisible();
});
it.each(['replacing', 'cancelling', 'unknown'])(
	'explains a %s state without inviting use of the retired number',
	async (status) => {
		render(NumbersOtpCard, { phone: { ...phone, status, otp: null } });
		await expect.element(page.getByRole('status')).toBeVisible();
		expect(page.getByRole('button', { name: 'Copy', exact: true }).query()).toBeNull();
		expect(page.getByText('Refund complete', { exact: true }).query()).toBeNull();
	}
);
it('offers an explicit next step if receipt was recorded without visible code details', async () => {
	render(NumbersOtpCard, { phone: { ...phone, otp: null, smsMessage: null } });
	await expect
		.element(page.getByRole('button', { name: 'Refresh details', exact: true }))
		.toBeVisible();
});
it('does not apply a fractional earned-credit remainder the server will refuse', async () => {
	seed();
	render(Checkout, {
		data: {
			user,
			storeCredit: { totalAvailable: 599.5, refundAvailable: 499.5, earnedAvailable: 100 },
			affiliateRef: null
		}
	} as never);
	await page.getByRole('checkbox', { name: /Use store credit/ }).click();
	await expect.element(page.getByRole('button', { name: 'Pay Now', exact: true })).toBeVisible();
	expect(page.getByRole('button', { name: 'Complete Order', exact: true }).query()).toBeNull();
});
it('keeps mobile Checkout clickable with the first-visit consent banner, and closes on Escape', async () => {
	seed();
	cart.open();
	render(MiniCart);
	render(CookieConsentBar);
	await expect.element(page.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
	await expect.element(page.getByRole('dialog', { name: 'Shopping cart' })).toBeVisible();
	const button = page.getByRole('button', { name: 'Checkout', exact: true });
	await expect.element(button).toBeEnabled();
	const rect = button.element().getBoundingClientRect();
	expect(
		button
			.element()
			.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
	).toBe(true);
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	expect(cart.isOpen).toBe(false);
});
