import { expect, test } from '@playwright/test';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('h1')).toBeVisible();
});

test('platforms page is never hidden behind a stale skeleton', async ({ page }) => {
	await page.goto('/platforms', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.platform-skeleton')).toHaveCount(0);
	await expect(page.locator('main')).toBeVisible();

	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await page.goBack({ waitUntil: 'domcontentloaded' });
	await expect(page.locator('.platform-skeleton')).toHaveCount(0);
	await expect(page.locator('main')).toBeVisible();
});

const storedCart = {
	items: [
		{
			cartItemId: 'tier:checkout-test-tier',
			tierId: 'checkout-test-tier',
			quantity: 1,
			addedAt: Date.now()
		}
	],
	lastUpdated: Date.now()
};

const refreshedCart = {
	success: true,
	data: {
		items: [
			{
				...storedCart.items[0],
				tier: {
					id: 'checkout-test-tier',
					name: 'Checkout Test Tier',
					price: 2500,
					slug: 'checkout-test-tier',
					platformName: 'Test Platform',
					platformSlug: 'test-platform',
					isActive: true
				}
			}
		],
		messages: []
	}
};

test('checkout refreshes once per visit without entering a request loop', async ({ page }) => {
	let refreshRequests = 0;
	const checkoutKey = 'checkout-session-test-key';
	await page.addInitScript((cartData) => {
		localStorage.setItem('fastaccs_cart', JSON.stringify(cartData));
		localStorage.setItem(
			'fastaccs_checkout_session',
			JSON.stringify({ key: 'checkout-session-test-key', fingerprint: 'test' })
		);
	}, storedCart);
	await page.route('**/api/cart/refresh', async (route) => {
		refreshRequests += 1;
		expect(route.request().postDataJSON().checkoutKey).toBe(checkoutKey);
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(refreshedCart)
		});
	});

	await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
	await expect(page.getByText('Checkout Test Tier')).toBeVisible();
	await page.waitForTimeout(750);
	expect(refreshRequests).toBe(1);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.getByText('Checkout Test Tier')).toBeVisible();
	await page.waitForTimeout(750);
	expect(refreshRequests).toBe(2);
});

test('temporary cart refresh failure preserves the saved cart and offers retry', async ({
	page
}) => {
	await page.addInitScript((cartData) => {
		localStorage.setItem('fastaccs_cart', JSON.stringify(cartData));
	}, storedCart);
	await page.route('**/api/cart/refresh', async (route) => {
		await route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ success: false, error: 'Temporary outage' })
		});
	});

	await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
	await expect(page.getByText('Your cart is still here')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Retry cart' })).toBeVisible();

	const savedCount = await page.evaluate(() => {
		const stored = JSON.parse(localStorage.getItem('fastaccs_cart') || '{"items":[]}');
		return stored.items.length;
	});
	expect(savedCount).toBe(1);
});
