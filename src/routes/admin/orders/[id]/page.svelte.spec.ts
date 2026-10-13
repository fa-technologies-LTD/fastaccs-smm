import { page } from '@vitest/browser/context';
import { render } from 'vitest-browser-svelte';
import { expect, it, vi } from 'vitest';
import { orderedItemSummary } from '$lib/helpers/ordered-item-summary';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

it('renders purchased followers, not a cart-line count or an internal product type', async () => {
	const item = {
		quantity: 1,
		boostQuantity: 1000,
		boostTargetUrl: 'https://facebook.com/example',
		productName: 'Facebook Page Followers',
		productCategory: 'boosting_service',
		boostFulfillment: { platform: 'facebook', outcome: 'followers' }
	};
	render(Page, {
		data: {
			order: {
				id: 'test-order',
				status: 'paid',
				paymentStatus: 'paid',
				orderItems: [item],
				item_count: 1,
				total_amount: 1000,
				net_sale_amount: 1000,
				refunded_amount: 0,
				created_at: '2026-10-12T11:00:00Z',
				metadata: { notes: [] }
			},
			items: [],
			orderedItems: [orderedItemSummary(item)],
			error: null,
			canViewOrderAmounts: true
		} as any
	});
	await expect.element(page.getByText('1,000 followers', { exact: true })).toBeVisible();
	await expect.element(page.getByText('Facebook', { exact: true })).toBeVisible();
	await expect.element(page.getByText('×1', { exact: true })).not.toBeInTheDocument();
	await expect.element(page.getByText('boosting_service', { exact: true })).not.toBeInTheDocument();
});
