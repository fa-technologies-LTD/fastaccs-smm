import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it } from 'vitest';
import '../../app.css';
import DecisionHost from './DecisionHost.svelte';
import { confirmSeparateCheckout } from '$lib/helpers/separate-checkout';

it('asks in plain words, keeps the cart by default, and answers each way', async () => {
	render(DecisionHost);

	let answer = confirmSeparateCheckout('instant_auto', 'boosting_manual');
	const dialog = page.getByRole('alertdialog', { name: 'Check out separately' });
	await expect.element(dialog).toBeVisible();
	await expect
		.element(page.getByText('Your cart has accounts. Engagement orders are paid on their own.'))
		.toBeVisible();
	const keep = page.getByRole('button', { name: 'Keep my cart', exact: true });
	await expect.element(keep).toHaveFocus();
	await keep.click();
	expect(await answer).toBe(false);
	await expect.element(dialog).not.toBeInTheDocument();

	answer = confirmSeparateCheckout('boosting_manual', 'instant_auto');
	await page.getByRole('button', { name: 'Empty cart and add', exact: true }).click();
	expect(await answer).toBe(true);

	answer = confirmSeparateCheckout('manual_handover', 'instant_auto');
	await expect.element(page.getByRole('alertdialog')).toBeVisible();
	await userEvent.keyboard('{Escape}');
	expect(await answer).toBe(false);
});
