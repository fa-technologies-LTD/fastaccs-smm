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

it('never asks a buyer to pay again for money that arrived and is being checked', async () => {
	const order = {
		id: 'held-order',
		orderNumber: 'HELD',
		totalAmount: 10500,
		paymentStatus: 'under_review',
		deliveryStatus: 'pending',
		orderItems: [{ id: 'held-item', productName: 'X accounts', quantity: 3 }]
	};
	const view = render(OrderTab, { initialOrders: [{ ...order, status: 'payment_review' }] });
	await expect.element(page.getByText('Checking payment', { exact: true })).toBeVisible();
	await expect
		.element(page.getByText(/received a payment for this order and are checking it/))
		.toBeVisible();
	expect(page.getByRole('button', { name: 'Resume payment' }).query()).toBeNull();
	expect(page.getByText(/Nothing was charged/).query()).toBeNull();
	await view.unmount();
	// An unpaid order still offers to finish paying.
	render(OrderTab, {
		initialOrders: [{ ...order, status: 'pending_payment', paymentStatus: 'pending' }]
	});
	await expect.element(page.getByRole('button', { name: 'Resume payment' })).toBeVisible();
});
