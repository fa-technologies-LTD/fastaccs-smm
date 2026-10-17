import { page } from '@vitest/browser/context';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { orderedItemSummary } from '$lib/helpers/ordered-item-summary';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
function supportFixture(permissions: string[] = ['admin:orders:manage']) {
	return {
		order: {
			id: 'test-order',
			status: 'paid',
			paymentStatus: 'paid',
			orderItems: [{ boostTargetUrl: 'https://example.invalid/test' }],
			item_count: 1,
			total_amount: 1000,
			net_sale_amount: 1000,
			refunded_amount: 0,
			created_at: '2026-10-14T11:00:00Z',
			metadata: { notes: [] }
		},
		items: [],
		orderedItems: [],
		error: null,
		canViewOrderAmounts: true,
		adminPermissions: permissions
	};
}
it('hides customer messaging from read-only admins', () => {
	render(Page, { data: supportFixture([]) } as any);
	expect(page.getByText('Customer update', { exact: true }).query()).toBeNull();
});
it('keeps a failed message and retries with the same request key', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(
			Response.json({ success: false, error: 'Please retry.' }, { status: 503 })
		)
		.mockResolvedValueOnce(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: supportFixture() } as any);
	await page.getByText('Customer update', { exact: true }).click();
	const field = page.getByRole('textbox', { name: 'Message to customer' });
	await field.fill('We are checking the remaining delivery.');
	await page.getByRole('button', { name: 'Send customer update', exact: true }).click();
	await expect.element(field).toHaveValue('We are checking the remaining delivery.');
	await page.getByRole('button', { name: 'Send customer update', exact: true }).click();
	await expect.element(field).toHaveValue('');
	const first = JSON.parse(fetchMock.mock.calls[0][1].body);
	const second = JSON.parse(fetchMock.mock.calls[1][1].body);
	expect(first.requestId).toBe(second.requestId);
	expect(first.message).toBe('We are checking the remaining delivery.');
});
it('includes optional customer wording in the existing two-step refund', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValue(Response.json({ success: true, refundedAmount: 1000 }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: supportFixture() } as any);
	await page.getByRole('button', { name: 'Refund to store credit', exact: true }).click();
	await expect
		.element(
			page.getByText(
				'Refunds the entire order to store credit. Existing supplier work may continue.'
			)
		)
		.toBeVisible();
	await page
		.getByRole('textbox', { name: 'Message with refund (optional)' })
		.fill('We could not complete delivery.');
	await page.getByRole('button', { name: 'Confirm refund', exact: true }).click();
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
		customerMessage: 'We could not complete delivery.'
	});
});
it('keeps refunds available for paid Boosting orders reported completed by a provider', async () => {
	const data = supportFixture();
	data.order.status = 'completed';
	render(Page, { data } as any);
	await expect
		.element(page.getByRole('button', { name: 'Refund to store credit', exact: true }))
		.toBeVisible();
	expect(page.getByRole('button', { name: 'Confirm refund', exact: true }).query()).toBeNull();
});

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
