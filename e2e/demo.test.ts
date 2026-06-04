import { expect, test } from '@playwright/test';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});

test('platforms page is never hidden behind a stale skeleton', async ({ page }) => {
	await page.goto('/platforms');
	await expect(page.locator('.platform-skeleton')).toHaveCount(0);
	await expect(page.locator('main')).toBeVisible();

	await page.goto('/');
	await page.goBack();
	await expect(page.locator('.platform-skeleton')).toHaveCount(0);
	await expect(page.locator('main')).toBeVisible();
});
