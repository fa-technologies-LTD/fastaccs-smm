import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Component from './BoostingOrderSupport.svelte';
const props = {
	itemId: 'item',
	orderId: 'order',
	productName: 'Instagram Followers',
	quantity: 500,
	held: true,
	canManage: true,
	onUpdated: vi.fn()
};
afterEach(() => vi.unstubAllGlobals());
it('shows support controls for held live orders and no write controls for read-only admins', async () => {
	const first = render(Component, { ...props, canManage: false });
	expect(page.getByRole('button', { name: 'Mark completed' }).query()).toBeNull();
	await first.unmount();
	render(Component, props);
	await page.getByText('Resolve order', { exact: true }).click();
	await expect.element(page.getByRole('button', { name: 'Request valid link' })).toBeVisible();
	await expect
		.element(page.getByRole('button', { name: 'Customer update', exact: true }))
		.toBeVisible();
});

it('does not offer delivery resolution for a refunded item', async () => {
	render(Component, { ...props, status: 'refunded' });
	expect(page.getByText('Resolve order', { exact: true }).query()).toBeNull();
	await expect
		.element(page.getByRole('button', { name: 'Customer update', exact: true }))
		.toBeVisible();
});

it('keeps resolved history closed even without an item status', async () => {
	render(Component, {
		...props,
		held: false,
		support: {
			revision: 'resolved',
			state: 'resolved',
			requestId: null,
			message: 'Your delivery is confirmed. This review is closed.',
			updatedAt: null,
			reply: null
		}
	});
	expect(page.getByText('Resolve order', { exact: true }).query()).toBeNull();
	await expect.element(page.getByText('Review resolved by support')).toBeVisible();
});

it('offers a deliberate change of resolution, not completion or retry, while waiting for a link', async () => {
	render(Component, {
		...props,
		support: {
			revision: 'request',
			state: 'awaiting_customer',
			requestId: 'request',
			message: 'Please correct your public link.',
			updatedAt: null,
			reply: null
		}
	});
	await expect.element(page.getByText('Waiting for the customer’s link')).toBeVisible();
	await page.getByText('Change resolution', { exact: true }).click();
	expect(page.getByRole('button', { name: 'Mark completed', exact: true }).query()).toBeNull();
	expect(
		page.getByRole('button', { name: 'Confirm delivery failed', exact: true }).query()
	).toBeNull();
	await expect.element(page.getByRole('button', { name: 'Withdraw link request' })).toBeVisible();
});
it('keeps customer updates available during an active delivery without offering completion', async () => {
	render(Component, { ...props, held: false, status: 'in_progress' });
	await page.getByText('Resolve order', { exact: true }).click();
	expect(page.getByRole('button', { name: 'Mark completed', exact: true }).query()).toBeNull();
	await page.getByRole('button', { name: 'Customer update', exact: true }).click();
	await expect.element(page.getByRole('dialog')).toHaveTextContent('No delivery change or email');
	await userEvent.keyboard('{Escape}');
});
it('records failure evidence and the missing quantity without claiming supplier closure', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetchMock);
	render(Component, { ...props, held: false });
	await page.getByText('Resolve order', { exact: true }).click();
	await page.getByRole('button', { name: 'Confirm delivery failed', exact: true }).click();
	await expect.element(page.getByRole('dialog')).toHaveTextContent('not supplier closure');
	await page
		.getByRole('textbox', { name: 'What failed and how did you check?' })
		.fill('Valid target checked; customer confirmed no delivery.');
	await page.getByRole('spinbutton', { name: 'Quantity still missing' }).fill('500');
	await page.getByRole('checkbox').click();
	await page.getByRole('button', { name: 'Confirm failure', exact: true }).click();
	expect(fetchMock).toHaveBeenCalledOnce();
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
		action: 'confirm_failure',
		quantity: 500,
		confirmed: true
	});
});

it('does not submit a saved update again when refreshing the order list fails', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetchMock);
	const onUpdated = vi
		.fn()
		.mockRejectedValueOnce(new Error('Network unavailable'))
		.mockResolvedValue(undefined);
	render(Component, { ...props, onUpdated });
	await page.getByRole('button', { name: 'Customer update', exact: true }).click();
	await page
		.getByRole('textbox', { name: 'Message the customer will see' })
		.fill('We are checking your order.');
	await page.getByRole('button', { name: 'Send to customer', exact: true }).click();
	await expect.element(page.getByRole('alert')).toHaveTextContent('update was saved');
	await page.getByRole('button', { name: 'Refresh review', exact: true }).click();
	expect(fetchMock).toHaveBeenCalledOnce();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});
it('preserves a failed message and retries with the same operation key', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(
			Response.json({ success: false, error: 'Temporary error' }, { status: 503 })
		)
		.mockResolvedValueOnce(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetchMock);
	render(Component, props);
	await page.getByRole('button', { name: 'Customer update', exact: true }).click();
	const field = page.getByRole('textbox', { name: 'Message the customer will see' });
	await field.fill('We are checking this delivery with support.');
	await page.getByRole('button', { name: 'Send to customer', exact: true }).click();
	await expect.element(page.getByRole('alert')).toHaveTextContent('Temporary error');
	await expect.element(field).toHaveValue('We are checking this delivery with support.');
	await page.getByRole('button', { name: 'Send to customer', exact: true }).click();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	expect(JSON.parse(fetchMock.mock.calls[0][1].body).operationId).toBe(
		JSON.parse(fetchMock.mock.calls[1][1].body).operationId
	);
});
it('marks a delivery completed in one click with no note, and Escape never saves', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetchMock);
	render(Component, props);
	await page.getByText('Resolve order', { exact: true }).click();
	await page.getByRole('button', { name: 'Mark completed' }).click();
	const dialog = page.getByRole('dialog');
	await expect
		.element(dialog.getByRole('button', { name: 'Mark completed', exact: true }))
		.toBeEnabled();
	expect(dialog.getByRole('checkbox').query()).toBeNull();
	await userEvent.keyboard('{Escape}');
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	expect(fetchMock).not.toHaveBeenCalled();
	await expect.element(page.getByRole('button', { name: 'Mark completed' })).toHaveFocus();
});

it('keeps the completion button inside a short mobile viewport', async () => {
	await page.viewport(360, 560);
	render(Component, props);
	await page.getByText('Resolve order', { exact: true }).click();
	await page.getByRole('button', { name: 'Mark completed' }).click();
	const button = page
		.getByRole('dialog')
		.getByRole('button', { name: 'Mark completed', exact: true })
		.element();
	const rect = button.getBoundingClientRect();
	expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight - 16);
	expect(rect.top).toBeGreaterThan(0);
	const point = button.getBoundingClientRect();
	expect(
		button.contains(
			document.elementFromPoint(point.x + point.width / 2, point.y + point.height / 2)
		)
	).toBe(true);
	await userEvent.keyboard('{Escape}');
	await page.viewport(1280, 720);
});
it('keeps active supplier deliveries out of the link-change and close-review controls', async () => {
	render(Component, { ...props, held: false });
	expect(page.getByRole('button', { name: 'Mark completed' }).query()).toBeNull();
	expect(page.getByRole('button', { name: 'Request valid link' }).query()).toBeNull();
	await expect
		.element(page.getByRole('button', { name: 'Customer update', exact: true }))
		.toBeVisible();
});
it('completes a hand-sorted delivery with one click, then refreshes the list', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
	const onUpdated = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	render(Component, { ...props, onUpdated });
	await page.getByText('Resolve order', { exact: true }).click();
	await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Mark completed', exact: true })
		.click();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	expect(fetchMock).toHaveBeenCalledOnce();
	expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/boosting-orders/item/support');
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
		action: 'confirm_delivery',
		confirmed: true,
		evidence: '',
		message: 'Your delivery is confirmed. This review is closed.'
	});
	expect(onUpdated).toHaveBeenCalledOnce();
});

it('sends an optional note when one is written', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetchMock);
	render(Component, props);
	await page.getByText('Resolve order', { exact: true }).click();
	await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
	await page.getByRole('textbox', { name: /Note for your records/ }).fill('Delivered on WhatsApp.');
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Mark completed', exact: true })
		.click();
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
		evidence: 'Delivered on WhatsApp.'
	});
});
