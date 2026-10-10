import { page } from '@vitest/browser/context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MiniCart from './MiniCart.svelte';
import { cart } from '$lib/stores/cart.svelte';
import type { CartItemWithTier } from '$lib/types/cart';

const mocks = vi.hoisted(() => ({ goto: vi.fn(), showWarning: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/stores/toasts', () => ({ showSuccess: vi.fn(), showWarning: mocks.showWarning }));

function openBoostingCart(quantities: number[], step = 10, price = 5): void {
	cart.clear();
	for (const quantity of quantities) {
		cart.addBoostingService('category', 'https://www.instagram.com/p/test/', quantity, 'offer');
	}
	const items: CartItemWithTier[] = cart.items.map((item) => ({
		...item,
		tier: {
			id: 'category',
			name: 'Instagram Likes',
			price: 0,
			slug: 'instagram-likes',
			platformName: 'Instagram',
			platformSlug: 'instagram',
			isActive: true,
			deliveryMode: 'boosting_manual',
			boostingConfig: {
				minQuantity: 100,
				stepQuantity: step,
				pricePerStep: price,
				platform: 'instagram',
				actionType: 'likes'
			}
		}
	}));
	vi.spyOn(cart, 'getItemsWithTiers').mockResolvedValue(items);
	cart.open();
	render(MiniCart);
}

describe('MiniCart Boosting checkout pricing', () => {
	afterEach(() => {
		cart.clear();
		cart.close();
		vi.restoreAllMocks();
		mocks.goto.mockReset();
		mocks.showWarning.mockReset();
	});

	it('rounds a 455-naira Boosting quote upwards to 500 and permits checkout', async () => {
		openBoostingCart([910]);
		await expect.element(page.getByText('₦500', { exact: true }).first()).toBeVisible();
		await page.getByRole('button', { name: /checkout/i }).click();
		expect(mocks.goto).toHaveBeenCalledWith('/checkout');
		expect(mocks.showWarning).not.toHaveBeenCalled();
	});

	it('uses the same upward quote for a 91-comment starting quantity', async () => {
		openBoostingCart([91], 1, 5);
		await expect.element(page.getByText('₦500', { exact: true }).first()).toBeVisible();
		await page.getByRole('button', { name: /checkout/i }).click();
		expect(mocks.goto).toHaveBeenCalledWith('/checkout');
	});

	it('only shows the missing amount after an under-minimum checkout attempt', async () => {
		openBoostingCart([100]);
		await expect.element(page.getByText('₦50', { exact: true }).first()).toBeVisible();
		expect(mocks.showWarning).not.toHaveBeenCalled();
		await page.getByRole('button', { name: /checkout/i }).click();
		expect(mocks.showWarning).toHaveBeenCalledWith('Add ₦450 more in Boosting to check out.');
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it('allows two 250-naira Boosting lines to combine toward the minimum', async () => {
		openBoostingCart([500, 500]);
		await expect.element(page.getByText('₦500', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: /checkout/i }).click();
		expect(mocks.goto).toHaveBeenCalledWith('/checkout');
		expect(mocks.showWarning).not.toHaveBeenCalled();
	});
});
