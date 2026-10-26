import { page } from 'vitest/browser';
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
let benefitLabel: string | null = null;
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
				actionType: 'likes',
				benefitLabel
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
	sessionStorage.clear();
	price = 500;
	benefitLabel = null;
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
it('shows selected terms and human quantities without repeating platform text or creating a payment', async () => {
	benefitLabel = '30-day refill';
	seed();
	render(Checkout, {
		data: { user, storeCredit: { totalAvailable: 0 }, affiliateRef: null }
	} as never);
	await expect.element(page.getByText('200 likes', { exact: true })).toBeVisible();
	await expect.element(page.getByText('30-day refill', { exact: true })).toBeVisible();
	await expect.element(page.getByText('Instagram', { exact: true })).not.toBeInTheDocument();
	expect(mocks.createOrder).not.toHaveBeenCalled();
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
	await page.getByRole('button', { name: /^Pay ₦/ }).click();
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
	await page.getByRole('button', { name: /^Pay ₦/ }).click();
	await expect.poll(() => mocks.createOrder.mock.calls.length).toBe(1);
	expect(JSON.parse(localStorage.getItem('fastaccs_checkout_session')!).request).toMatchObject({
		userId: user.id
	});
	expect(cart.itemCount).toBe(1);
	expect(mocks.goto).not.toHaveBeenCalled();
});
const seededItem = {
	categoryId: 'fixture-category',
	quantity: 1,
	boostTargetUrl: 'https://instagram.com/p/fixture/',
	boostQuantity: 200,
	boostOfferId: 'fixture-offer'
};
function earlierRequest(overrides: Record<string, unknown> = {}) {
	return {
		userId: user.id,
		email: user.email,
		phone: '',
		items: [seededItem],
		currency: 'NGN',
		paymentMethod: 'monnify',
		totalAmount: 500,
		checkoutKey: 'fixture-existing-checkout',
		useStoreCredit: false,
		analytics: { ga4ClientId: '123456.654321', consentGranted: true },
		acceptedQuote: {
			subtotal: 500,
			discount: 0,
			total: 500,
			creditApplied: 0,
			payable: 500,
			linePrices: [500]
		},
		...overrides
	};
}
it('reuses the earlier checkout for the same cart after a lost response, at today’s price', async () => {
	seed();
	price = 1000;
	const request = earlierRequest();
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
	// The pay button pays for this cart; the same key lets the server recognise the earlier order.
	await page.getByRole('button', { name: /^Pay ₦1,000/ }).click();
	await expect.poll(() => mocks.createOrder.mock.calls.length).toBeGreaterThan(0);
	expect(mocks.createOrder.mock.calls[0][0]).toMatchObject({
		checkoutKey: 'fixture-existing-checkout',
		totalAmount: 1000
	});
	expect(mocks.createOrder.mock.calls[0][0].analytics).toMatchObject({
		consentGranted: false,
		ga4ClientId: null
	});
	expect(
		JSON.parse(localStorage.getItem('fastaccs_checkout_session')!).request.analytics
	).toBeUndefined();
	expect(mocks.goto).not.toHaveBeenCalled();
});
it('lets the buyer switch to store credit on the same cart without any extra step', async () => {
	seed();
	const request = earlierRequest({ checkoutKey: 'fixture-earlier-checkout' });
	localStorage.setItem(
		'fastaccs_checkout_session',
		JSON.stringify({ key: request.checkoutKey, request })
	);
	mocks.createOrder.mockResolvedValue({
		success: false,
		error: 'Fixture stops before order creation'
	});
	render(Checkout, {
		data: {
			user,
			storeCredit: {
				totalAvailable: 1000,
				refundAvailable: 1000,
				earnedAvailable: 0,
				promoAvailable: 0,
				promo: [],
				promoCaps: {}
			},
			affiliateRef: null
		}
	} as never);
	await page.getByRole('checkbox', { name: /store credit/i }).click();
	expect(page.getByRole('button', { name: 'Finish that payment', exact: true }).query()).toBeNull();
	await page.getByRole('button', { name: 'Pay with store credit', exact: true }).click();
	await expect.poll(() => mocks.createOrder.mock.calls.length).toBe(1);
	expect(mocks.createOrder.mock.calls[0][0]).toMatchObject({
		useStoreCredit: true,
		checkoutKey: 'fixture-earlier-checkout',
		acceptedQuote: { creditApplied: 500, payable: 0 }
	});
});
it.each([
	['still unpaid', 'pending_payment', true],
	['cancelled', 'cancelled', false]
])(
	'never blocks a new purchase with an earlier one (%s), and links to it only while unpaid',
	async (_label, earlierStatus, showsLink) => {
		seed();
		const request = earlierRequest({
			checkoutKey: 'fixture-old-checkout',
			items: [{ categoryId: 'another-product', quantity: 1 }],
			acceptedQuote: {
				subtotal: 300,
				discount: 0,
				total: 300,
				creditApplied: 0,
				payable: 300,
				linePrices: [300]
			}
		});
		localStorage.setItem(
			'fastaccs_checkout_session',
			JSON.stringify({ key: request.checkoutKey, request, orderId: 'fixture-old-order' })
		);
		const baseFetch = globalThis.fetch;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input, init) =>
				String(input).includes('/api/orders/fixture-old-order')
					? Response.json({
							data: {
								status: earlierStatus,
								paymentStatus: earlierStatus === 'cancelled' ? 'cancelled' : 'pending',
								paymentExpiresAt: new Date(Date.now() + 600_000).toISOString(),
								totalAmount: 300,
								storeCreditApplied: 0
							}
						})
					: baseFetch(input, init)
			)
		);
		mocks.createOrder.mockResolvedValue({
			success: false,
			error: 'Fixture stops before order creation'
		});
		render(Checkout, {
			data: { user, storeCredit: { totalAvailable: 0 }, affiliateRef: null }
		} as never);
		const pay = page.getByRole('button', { name: /^Pay ₦500/ });
		await expect.element(pay).toBeEnabled();
		if (showsLink) {
			await expect
				.element(page.getByText('You have an unpaid ₦300 order from earlier.'))
				.toBeVisible();
			await expect
				.element(page.getByRole('link', { name: 'View it' }))
				.toHaveAttribute('href', '/dashboard?tab=orders&orderId=fixture-old-order');
		} else {
			await new Promise((resolve) => setTimeout(resolve, 300));
			expect(page.getByText(/unpaid .* order from earlier/).query()).toBeNull();
		}
		await pay.click();
		await expect.poll(() => mocks.createOrder.mock.calls.length).toBe(1);
		expect(mocks.createOrder.mock.calls[0][0].checkoutKey).not.toBe('fixture-old-checkout');
		expect(mocks.createOrder.mock.calls[0][0].totalAmount).toBe(500);
	}
);
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
	await expect.element(page.getByRole('button', { name: /^Pay ₦/ })).toBeEnabled();
	price = 1000;
	await page.getByRole('button', { name: /^Pay ₦/ }).click();
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
	await page.getByRole('checkbox', { name: /store credit/i }).click();
	await page.getByRole('button', { name: 'Pay with store credit', exact: true }).click();
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
	await page.getByRole('checkbox', { name: /store credit/i }).click();
	await expect.element(page.getByRole('button', { name: /^Pay ₦/ })).toBeVisible();
	expect(
		page.getByRole('button', { name: 'Pay with store credit', exact: true }).query()
	).toBeNull();
});
it('leaves store credit for the buyer to choose and shows them where it is', async () => {
	seed();
	const credit = { totalAvailable: 1000, refundAvailable: 1000, earnedAvailable: 0 };
	render(Checkout, { data: { user, storeCredit: credit, affiliateRef: null } } as never);
	const box = page.getByRole('checkbox', { name: /store credit/i });
	await expect.element(box).not.toBeChecked();
	await expect.element(page.getByText('Use your ₦1,000 store credit')).toBeVisible();
	await expect.element(page.getByRole('button', { name: /^Pay ₦500/ })).toBeVisible();
	// First checkout: the credit row gets a short shake, and it is counted.
	await expect
		.poll(() => box.element().closest('label')?.classList.contains('nudge'), { timeout: 3000 })
		.toBe(true);
	expect(JSON.parse(localStorage.getItem(`fastaccs_checkout_nudges:${user.id}`)!)).toEqual({
		credit: 1
	});
	await box.click();
	await expect.element(page.getByText('₦500 left after this order')).toBeVisible();
	await expect
		.element(page.getByRole('button', { name: 'Pay with store credit', exact: true }))
		.toBeVisible();
});
it('stops the shake after three checkouts', async () => {
	seed();
	localStorage.setItem(`fastaccs_checkout_nudges:${user.id}`, JSON.stringify({ credit: 3 }));
	render(Checkout, {
		data: {
			user,
			storeCredit: { totalAvailable: 1000, refundAvailable: 1000, earnedAvailable: 0 },
			affiliateRef: null
		}
	} as never);
	const box = page.getByRole('checkbox', { name: /store credit/i });
	await expect.element(box).toBeVisible();
	await new Promise((resolve) => setTimeout(resolve, 1200));
	expect(box.element().closest('label')?.classList.contains('nudge')).toBe(false);
	expect(JSON.parse(localStorage.getItem(`fastaccs_checkout_nudges:${user.id}`)!)).toEqual({
		credit: 3
	});
});
it('says why reward credit only pays part of a larger order', async () => {
	price = 13_500;
	seed();
	render(Checkout, {
		data: {
			user,
			storeCredit: { totalAvailable: 16_500, refundAvailable: 1_800, earnedAvailable: 14_700 },
			affiliateRef: null
		}
	} as never);
	await page.getByRole('checkbox', { name: /store credit/i }).click();
	await expect.element(page.getByText('-₦5,850')).toBeVisible();
	await expect
		.element(page.getByText('₦16,500 balance · reward credit pays up to 30% of an order'))
		.toBeVisible();
	await expect.element(page.getByRole('button', { name: /^Pay ₦/ })).toBeVisible();
});
function accountCart(validate: () => Response) {
	cart.addTier('fixture-account', 1);
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input) => {
			const url = String(input);
			if (url.includes('/api/cart/refresh'))
				return Response.json({
					success: true,
					data: {
						items: [
							{
								...cart.items[0],
								tier: {
									id: 'fixture-account',
									name: 'Aged X account',
									price: 2000,
									slug: 'aged-x',
									platformName: 'X',
									platformSlug: 'x',
									isActive: true,
									deliveryMode: 'instant_auto'
								}
							}
						],
						messages: []
					}
				});
			if (url.includes('/api/promotions/validate')) return validate();
			return Response.json({ success: true, data: [] });
		})
	);
}
it('applies the first-order offer in one tap and shows what it saves', async () => {
	accountCart(() =>
		Response.json({ success: true, data: { code: 'WELCOME10', discountAmount: 200 } })
	);
	render(Checkout, {
		data: {
			user,
			storeCredit: { totalAvailable: 0 },
			affiliateRef: null,
			availablePromo: {
				code: 'WELCOME10',
				value: 10,
				minOrderValue: 0,
				label: '10% off your first account order'
			}
		}
	} as never);
	await page.getByRole('button', { name: /10% off your first account order/ }).click();
	await expect.element(page.getByText('WELCOME10 applied')).toBeVisible();
	await expect.element(page.getByRole('button', { name: /^Pay ₦1,800/ })).toBeVisible();
	expect(page.getByRole('button', { name: /10% off your first account order/ }).query()).toBeNull();
});
it('shows how much more is needed instead of offering a code the cart cannot use yet', async () => {
	accountCart(() =>
		Response.json({ success: true, data: { code: 'WELCOME10', discountAmount: 200 } })
	);
	render(Checkout, {
		data: {
			user,
			storeCredit: { totalAvailable: 0 },
			affiliateRef: null,
			availablePromo: {
				code: 'WELCOME10',
				value: 200,
				minOrderValue: 2500,
				label: '₦200 off your first account order'
			}
		}
	} as never);
	await expect.element(page.getByText('Add ₦500 more to use it')).toBeVisible();
	await expect
		.element(page.getByRole('button', { name: /₦200 off your first account order/ }))
		.toBeDisabled();
});
it('keeps a mistyped code in the field and explains the problem in place', async () => {
	accountCart(() =>
		Response.json({ success: false, error: 'This code isn’t valid.' }, { status: 400 })
	);
	render(Checkout, {
		data: { user, storeCredit: { totalAvailable: 0 }, affiliateRef: null }
	} as never);
	await page.getByRole('button', { name: 'Have a promo code?', exact: true }).click();
	const field = page.getByRole('textbox', { name: 'Promo code' });
	await field.fill('WELCOM10');
	await page.getByRole('button', { name: 'Apply', exact: true }).click();
	await expect.element(page.getByRole('alert')).toHaveTextContent('This code isn’t valid.');
	await expect.element(field).toHaveValue('WELCOM10');
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
