import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it } from 'vitest';
import '$lib/../app.css';
import Page from './+page.svelte';

const row = (costs: boolean) => ({
	orderId: 'order-1',
	orderNumber: 'ORD-NUM-1',
	createdAt: '2026-10-20T10:00:00Z',
	buyer: 'Ada Buyer',
	buyerUserId: 'user-1',
	serviceName: 'WhatsApp',
	countryName: 'USA',
	phoneNumber: '+15550001111',
	rentalStatus: 'received',
	provider: 'hubman',
	saleNgn: 5500,
	costUsd: costs ? 0.75 : null,
	order: {
		status: 'completed',
		paymentStatus: 'paid',
		deliveryStatus: 'delivered',
		totalAmount: 5500,
		refundedAmount: 0,
		orderType: 'phone',
		paymentExpiresAt: null
	},
	attempts: [
		{
			createdAt: '2026-10-20T10:00:01Z',
			provider: 'pvapins',
			providerServiceRef: 'Whatsapp24',
			outcome: 'otp_timeout',
			failureCategory: 'timeout',
			expectedCostUsd: costs ? 0.4 : null,
			actualCostUsd: null
		},
		{
			createdAt: '2026-10-20T10:05:00Z',
			provider: 'hubman',
			providerServiceRef: '17',
			outcome: 'otp_received',
			failureCategory: null,
			expectedCostUsd: costs ? 0.75 : null,
			actualCostUsd: costs ? 0.75 : null
		}
	]
});
const data = (costs: boolean) => ({
	rows: [row(costs)],
	total: 1,
	page: 1,
	pageCount: 1,
	search: '',
	canViewRevenue: costs
});

it('lists each number order with its stage, sale and full supplier attempt trail', async () => {
	render(Page, { data: data(true) } as never);
	await expect
		.element(page.getByRole('link', { name: 'ORD-NUM-1', exact: true }))
		.toHaveAttribute('href', '/admin/orders/order-1');
	await expect.element(page.getByText('Delivered', { exact: true })).toBeVisible();
	await expect.element(page.getByText('₦5,500', { exact: true })).toBeVisible();
	await page.getByText('2 attempts', { exact: true }).click();
	await expect.element(page.getByText(/Whatsapp24/)).toBeVisible();
	await expect.element(page.getByText(/otp timeout/)).toBeVisible();
	await expect.element(page.getByText(/otp received/)).toBeVisible();
});

it('keeps per-order amounts but hides supplier costs from roles without revenue access', async () => {
	render(Page, { data: data(false) } as never);
	await expect.element(page.getByText('₦5,500', { exact: true })).toBeVisible();
	expect(page.getByText('$0.75', { exact: true }).query()).toBeNull();
	expect(page.getByRole('columnheader', { name: 'Cost' }).query()).toBeNull();
});
