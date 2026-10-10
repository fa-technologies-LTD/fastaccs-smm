import { page } from '@vitest/browser/context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import OrderPage from './+page.svelte';
import { getBoostingProgress } from '$lib/helpers/boosting-progress';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn() }));
vi.mock('$lib/components/Navigation.svelte', () => ({ default: () => {} }));
vi.mock('$lib/components/Footer.svelte', () => ({ default: () => {} }));

function data(
	status: string,
	options: { paymentStatus?: string; remains?: number; eligible?: boolean } = {}
) {
	const order = {
		id: 'order-1',
		orderNumber: 'FA-123-ABC',
		createdAt: new Date().toISOString(),
		status: status === 'completed' ? 'completed' : 'paid',
		paymentStatus: options.paymentStatus ?? 'paid',
		deliveryStatus: status === 'completed' ? 'delivered' : 'processing',
		orderType: 'boosting',
		totalAmount: 500
	};
	const item = {
		id: 'item-1',
		productName: 'TikTok Likes',
		quantity: 1,
		totalPrice: 500,
		boostTargetUrl: 'https://www.tiktok.com/@faworldwidegifting/video/7599586070874918162',
		boostQuantity: 100,
		boostFulfillmentStatus: status,
		category: { metadata: { delivery_mode: 'boosting_manual' } },
		accounts: [],
		boostFulfillment: {
			remains: options.remains,
			lastCheckedAt: new Date().toISOString(),
			nextActionAt: new Date(Date.now() + 120000).toISOString()
		},
		boostComplaints: [],
		boostComplaintEligibility: {
			allowedTypes: options.eligible ? ['dropped'] : [],
			note: 'Refill requests are reviewed before being sent.'
		}
	};
	return {
		order: { ...order, orderItems: [{ ...item, boostProgress: getBoostingProgress(item, order) }] },
		phone: null
	} as never;
}

describe('customer Boosting progress and refill journey', () => {
	afterEach(() => vi.restoreAllMocks());
	it('separates payment confirmation from queued delivery', async () => {
		render(OrderPage, { data: data('pending') });
		await expect.element(page.getByRole('heading', { name: 'Payment Confirmed' })).toBeVisible();
		await expect.element(page.getByText('Queued', { exact: true }).first()).toBeVisible();
		await expect
			.element(page.getByText('Your boost is queued. No need to order again.'))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Request refill' }))
			.not.toBeInTheDocument();
	});
	it('shows reported progress without pretending it is independently verified', async () => {
		render(OrderPage, { data: data('in_progress', { remains: 40 }) });
		await expect.element(page.getByText('In progress', { exact: true }).first()).toBeVisible();
		await expect.element(page.getByText('Reported progress: 60 / 100')).toBeVisible();
		await expect
			.element(page.getByText('Your boost has started. Progress updates here automatically.'))
			.toBeVisible();
	});
	it('submits one eligible refill report and shows its acknowledgement', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ success: true, data: { status: 'open' } }), {
				headers: { 'content-type': 'application/json' }
			})
		);
		render(OrderPage, { data: data('completed', { eligible: true }) });
		await page.getByRole('button', { name: 'Request refill' }).click();
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/orders/order-1/boosting-complaints',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ itemId: 'item-1', type: 'dropped' })
			})
		);
		await expect
			.element(page.getByRole('button', { name: 'Request refill' }))
			.not.toBeInTheDocument();
	});
	it('does not claim a boost started when payment is unconfirmed', async () => {
		render(OrderPage, { data: data('in_progress', { paymentStatus: 'unpaid', remains: 20 }) });
		await expect.element(page.getByRole('heading', { name: 'Awaiting Payment' })).toBeVisible();
		await expect
			.element(page.getByText('Delivery starts after payment is confirmed.'))
			.toBeVisible();
		await expect.element(page.getByText('Reported progress: 80 / 100')).not.toBeInTheDocument();
	});
});
