import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BoostDeliveryProgress from './BoostDeliveryProgress.svelte';
import type { BoostingProgress } from '$lib/helpers/boosting-progress';

const progress = (status: string, reportedDelivered: number | null): BoostingProgress => ({
	status,
	label: status,
	message: '',
	reportedDelivered,
	quantity: 500,
	lastCheckedAt: null,
	nextCheckAt: null
});

describe('BoostDeliveryProgress', () => {
	it('waits without inventing numbers before delivery starts', async () => {
		render(BoostDeliveryProgress, { progress: progress('queued', null) });
		await expect.element(page.getByText('Waiting to start.')).toBeVisible();
		await expect
			.element(page.getByRole('progressbar', { name: 'Waiting for delivery numbers' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('listitem').filter({ hasText: 'Started' }))
			.toHaveAttribute('aria-current', 'step');
	});

	it('shows the reported count, share and step while delivering', async () => {
		render(BoostDeliveryProgress, {
			progress: progress('in_progress', 436),
			quantityLabel: '500 followers'
		});
		await expect.element(page.getByText('436', { exact: true })).toBeVisible();
		await expect.element(page.getByText('of 500 followers')).toBeVisible();
		await expect.element(page.getByText('87%')).toBeVisible();
		await expect
			.element(page.getByRole('progressbar', { name: 'Delivered so far' }))
			.toHaveAttribute('aria-valuenow', '87');
		await expect.element(page.getByText('Counts reported by our supplier.')).toBeVisible();
		await expect
			.element(page.getByRole('listitem').filter({ hasText: 'Delivering' }))
			.toHaveAttribute('aria-current', 'step');
	});

	it('fills the bar and every step once complete', async () => {
		render(BoostDeliveryProgress, {
			progress: progress('completed', 489),
			quantityLabel: '500 followers'
		});
		await expect.element(page.getByText('100%')).toBeVisible();
		await expect
			.element(page.getByRole('progressbar', { name: 'Delivered so far' }))
			.toHaveAttribute('aria-valuenow', '100');
		expect(page.getByText('Counts reported by our supplier.').query()).toBeNull();
		expect(document.querySelector('[aria-current="step"]')).toBeNull();
	});
});
