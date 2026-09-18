import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

const entries = [
	{
		id: 'customer-welcome',
		name: 'Welcome',
		audience: 'Customer',
		classification: 'Transactional',
		state: 'Live',
		trigger: 'Customer verifies their email.',
		timing: 'Immediately.',
		frequency: 'Once.',
		protections: 'Deduplicated.',
		subject: 'Welcome — your account is ready',
		preheader: 'Everything is ready in your dashboard.',
		body: 'Welcome to Fast Accounts.',
		ctaText: 'Explore',
		ctaUrl: 'https://smm.fastaccs.com',
		notes: 'Transactional.',
		source: 'email.ts',
		html: '<!doctype html><html><body>Welcome preview</body></html>'
	},
	{
		id: 'admin-stock',
		name: 'New out-of-stock tier',
		audience: 'Admin',
		classification: 'Operational',
		state: 'Live',
		trigger: 'A tier reaches zero stock.',
		timing: 'Immediately.',
		frequency: 'Capped.',
		protections: 'Repeated alerts are grouped.',
		subject: 'Stock needed: 1 new tier',
		preheader: '1 newly out of stock · 3 total',
		body: '1 tier is newly out of stock.',
		ctaText: 'Open inventory',
		ctaUrl: 'https://smm.fastaccs.com/admin/inventory',
		notes: 'Operational.',
		source: 'admin-alerts.ts',
		html: '<!doctype html><html><body>Stock preview</body></html>'
	}
] as const;

describe('Email Review', () => {
	it('filters the catalogue and opens the selected email details', async () => {
		render(Page, { data: { entries: [...entries] } } as never);

		await expect.element(page.getByText('email versions', { exact: true })).toBeVisible();
		await page.getByRole('combobox', { name: 'Filter by recipient' }).selectOptions('Admin');
		await expect.element(page.getByRole('button', { name: /New out-of-stock tier/ })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Welcome/ })).not.toBeInTheDocument();

		await page.getByRole('button', { name: /New out-of-stock tier/ }).click();
		await expect
			.element(page.getByRole('heading', { name: 'New out-of-stock tier' }))
			.toBeVisible();
		await expect
			.element(page.getByText('Stock needed: 1 new tier', { exact: true }).nth(1))
			.toBeVisible();
	});
});
