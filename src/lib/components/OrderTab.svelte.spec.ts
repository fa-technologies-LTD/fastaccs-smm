import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import OrderTab from './OrderTab.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

it.each([
	['under_review', 'Checking'],
	['in_progress', 'In progress']
])(
	'shows %s rather than a stale completed parent in the customer order list',
	async (status, chip) => {
		render(OrderTab, {
			initialOrders: [
				{
					id: 'fictional-order',
					orderNumber: 'DEMO',
					totalAmount: 850,
					status: 'completed',
					paymentStatus: 'paid',
					deliveryStatus: 'delivered',
					orderItems: [
						{
							id: 'fictional-item',
							productName: 'Instagram Followers',
							quantity: 1,
							boostTargetUrl: 'https://instagram.com/example',
							boostQuantity: 500,
							boostFulfillmentStatus: status,
							boostProgress: { status }
						}
					]
				}
			]
		});
		await expect.element(page.getByText(chip, { exact: true })).toBeVisible();
		expect(page.getByText('Delivered', { exact: true }).query()).toBeNull();
	}
);
