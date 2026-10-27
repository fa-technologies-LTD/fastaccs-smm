import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { orderedItemSummary } from '$lib/helpers/ordered-item-summary';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$lib/stores/decision.svelte', () => ({ askDecision: vi.fn(async () => true) }));

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
it('shows under review rather than a stale completed summary for a held Boosting order', async () => {
	const data = supportFixture();
	data.order.status = 'completed';
	data.order.orderItems = [
		{
			boostTargetUrl: 'https://example.invalid/test',
			boostFulfillmentStatus: 'under_review'
		}
	] as any;
	render(Page, { data } as any);
	await expect.element(page.getByText('Checking', { exact: true })).toBeVisible();
	await expect.element(page.getByRole('link', { name: 'Manage delivery review' })).toBeVisible();
	expect(page.getByText('Completed', { exact: true }).query()).toBeNull();
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

function accountOrderFixture(order: Record<string, unknown>) {
	return {
		order: {
			id: 'test-order',
			orderNumber: 'ORD-TEST',
			orderItems: [{ quantity: 1, productName: 'test' }],
			item_count: 1,
			created_at: '2026-06-17T11:18:15Z',
			metadata: { notes: [] },
			...order
		},
		items: [
			{
				id: 'acc-1',
				account_username: 'buyer_account',
				account_status: 'delivered',
				platform_name: 'Facebook',
				tier_name: 'test'
			}
		],
		orderedItems: [],
		error: null,
		canViewOrderAmounts: true,
		adminRole: 'FULL_ADMIN',
		adminPermissions: ['admin:orders:manage']
	};
}

it('closes a refunded order: no send, cancel or refund actions, only a muted refunded note', async () => {
	render(Page, {
		data: accountOrderFixture({
			status: 'refunded',
			paymentStatus: 'refunded',
			deliveryStatus: 'refunded',
			totalAmount: 500,
			refundedAmount: 500,
			total_amount: 500,
			refunded_amount: 500,
			net_sale_amount: 0
		})
	} as never);
	await expect.element(page.getByText('Refunded ₦500 to store credit')).toBeVisible();
	await expect.element(page.getByText(/^Closed\. This order was refunded/)).toBeVisible();
	for (const name of ['Refund to store credit', 'Cancel Order', 'Mark as Completed']) {
		expect(page.getByRole('button', { name, exact: true }).query()).toBeNull();
	}
	expect(page.getByRole('button', { name: /^Send via/ }).query()).toBeNull();
	expect(page.getByRole('button', { name: /faulty & refund/i }).query()).toBeNull();
});

it('closes an order whose payment failed: no cancel button', async () => {
	render(Page, {
		data: accountOrderFixture({
			status: 'failed',
			paymentStatus: 'failed',
			total_amount: 500,
			refunded_amount: 0,
			net_sale_amount: 500
		})
	} as never);
	await expect.element(page.getByText(/^Closed\. The payment never came through/)).toBeVisible();
	expect(page.getByRole('button', { name: 'Cancel Order', exact: true }).query()).toBeNull();
});

it('keeps the actions on a paid account order that still needs handing over', async () => {
	render(Page, {
		data: accountOrderFixture({
			status: 'processing',
			paymentStatus: 'paid',
			totalAmount: 500,
			total_amount: 500,
			refunded_amount: 0,
			net_sale_amount: 500
		})
	} as never);
	await expect
		.element(page.getByRole('button', { name: 'Refund to store credit', exact: true }))
		.toBeVisible();
	await expect
		.element(page.getByRole('button', { name: 'Cancel Order', exact: true }))
		.toBeVisible();
	expect(page.getByText(/^Closed\./).query()).toBeNull();
});

it('replaces a faulty account from stock after confirming, with no refund', async () => {
	const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
		async () => Response.json({ success: true, newAccountId: 'acc-2' })
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, {
		data: accountOrderFixture({
			status: 'completed',
			paymentStatus: 'paid',
			deliveryStatus: 'delivered',
			totalAmount: 500,
			total_amount: 500,
			refunded_amount: 0,
			net_sale_amount: 500
		})
	} as never);
	await page.getByRole('button', { name: 'Replace', exact: true }).first().click();
	await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
	expect(String(fetchMock.mock.calls[0][0])).toBe('/api/orders/test-order/replace-account');
	expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ accountId: 'acc-1' });
});

it('shows a replaced account as done, with no buttons left on it', async () => {
	const data = accountOrderFixture({
		status: 'completed',
		paymentStatus: 'paid',
		totalAmount: 500,
		total_amount: 500,
		refunded_amount: 0,
		net_sale_amount: 500
	});
	data.items[0].account_status = 'replaced';
	render(Page, { data } as never);
	await expect.element(page.getByText('Replaced', { exact: true }).first()).toBeVisible();
	expect(page.getByRole('button', { name: 'Replace', exact: true }).query()).toBeNull();
	expect(page.getByRole('button', { name: /faulty & refund/i }).query()).toBeNull();
});
