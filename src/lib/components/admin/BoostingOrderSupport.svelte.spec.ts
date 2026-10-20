import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Component from './BoostingOrderSupport.svelte';
const props = {
	itemId: 'item',
	orderId: 'order',
	productName: 'Instagram Followers',
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
	await expect.element(page.getByRole('button', { name: 'Request valid link' })).toBeVisible();
	await expect
		.element(page.getByRole('button', { name: 'Customer update', exact: true }))
		.toBeVisible();
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
it('requires delivery evidence and an explicit check before closing, and Escape never saves', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetchMock);
	render(Component, props);
	await page.getByRole('button', { name: 'Mark completed' }).click();
	const submit = page.getByRole('button', { name: 'Confirm completion', exact: true });
	await expect.element(submit).toBeDisabled();
	await page
		.getByRole('textbox', { name: /What delivery evidence/ })
		.fill('Customer confirmed receipt in support chat.');
	await expect.element(submit).toBeDisabled();
	await page.getByRole('checkbox').click();
	await expect.element(submit).toBeEnabled();
	await userEvent.keyboard('{Escape}');
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	expect(fetchMock).not.toHaveBeenCalled();
	await expect.element(page.getByRole('button', { name: 'Mark completed' })).toHaveFocus();
});
it('keeps active supplier deliveries out of the link-change and close-review controls', async () => {
	render(Component, { ...props, held: false });
	expect(page.getByRole('button', { name: 'Mark completed' }).query()).toBeNull();
	expect(page.getByRole('button', { name: 'Request valid link' }).query()).toBeNull();
	await expect
		.element(page.getByRole('button', { name: 'Customer update', exact: true }))
		.toBeVisible();
});
it('completes a manually sorted delivery and its review with one confirmed action, then refreshes the list', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
	const onUpdated = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	render(Component, { ...props, onUpdated });
	await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
	await page
		.getByRole('textbox', { name: /What delivery evidence/ })
		.fill('Owner confirmed this delivery was manually sorted.');
	await page.getByRole('checkbox').click();
	await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	expect(fetchMock).toHaveBeenCalledOnce();
	expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/boosting-orders/item/support');
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
		action: 'confirm_delivery',
		confirmed: true,
		evidence: 'Owner confirmed this delivery was manually sorted.'
	});
	expect(onUpdated).toHaveBeenCalledOnce();
});
