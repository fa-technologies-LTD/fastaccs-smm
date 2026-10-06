import { page } from '@vitest/browser/context';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BoostingQuantitySelector from './BoostingQuantitySelector.svelte';

describe('Boosting quantity selector', () => {
	it('shows a soft minimum message and safely adjusts a low typed value', async () => {
		const onchange = vi.fn();
		render(BoostingQuantitySelector, {
			value: 200,
			minQuantity: 200,
			maxQuantity: 30_000,
			stepQuantity: 200,
			presets: [200, 400, 1000],
			onchange
		});

		const quantity = page.getByRole('spinbutton', { name: 'Quantity', exact: true });
		await quantity.fill('100');
		await expect.element(page.getByText('Minimum is 200.')).toBeVisible();
		(quantity.element() as HTMLInputElement).blur();

		await expect.element(quantity).toHaveValue(200);
		await expect.element(page.getByText('Minimum is 200. We adjusted it for you.')).toBeVisible();
		expect(onchange).toHaveBeenLastCalledWith(200);
	});

	it('uses concise helper copy', async () => {
		render(BoostingQuantitySelector, {
			value: 200,
			minQuantity: 200,
			maxQuantity: 30_000,
			stepQuantity: 200,
			onchange: vi.fn()
		});

		await expect.element(page.getByText('Enter a quantity or use +/−.')).toBeVisible();
		expect(page.getByText(/nearest valid/i).query()).toBeNull();
	});
});
