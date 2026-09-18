import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('Boosting customer preview', () => {
	it('shows actual valid quantities instead of multipliers', async () => {
		render(Page);

		await page.getByRole('button', { name: 'Comments' }).click();

		await expect
			.element(page.getByRole('button', { name: '50 Comments', exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: '100 Comments', exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: '250 Comments', exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: '500 Comments', exact: true }))
			.toBeVisible();
		await expect.element(page.getByText('1×', { exact: true })).not.toBeInTheDocument();
	});
});
