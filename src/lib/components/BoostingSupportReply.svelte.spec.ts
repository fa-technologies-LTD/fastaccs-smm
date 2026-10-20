import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Component from './BoostingSupportReply.svelte';
const support = {
	state: 'awaiting_customer' as const,
	revision: 'request',
	requestId: 'request',
	message: 'Please send your public profile link.',
	updatedAt: null,
	reply: null
};
afterEach(() => vi.unstubAllGlobals());
it('submits a corrected link for review only and shows a clear acknowledgement', async () => {
	const mock = vi.fn().mockResolvedValue(Response.json({ success: true }));
	vi.stubGlobal('fetch', mock);
	render(Component, { support, orderId: 'order', itemId: 'item' });
	await page
		.getByRole('textbox', { name: 'Your public link' })
		.fill('https://instagram.com/example');
	await page.getByRole('button', { name: 'Send link for review' }).click();
	await expect
		.element(page.getByText('Link received — we’ll review it', { exact: true }))
		.toBeVisible();
	expect(mock).toHaveBeenCalledOnce();
	expect(String(mock.mock.calls[0][0])).toBe('/api/orders/order/boosting-support/item');
	expect(JSON.parse(mock.mock.calls[0][1].body)).toMatchObject({
		link: 'https://instagram.com/example',
		requestId: 'request',
		expectedRevision: 'request'
	});
});
it('keeps a failed reply and reuses its idempotency key', async () => {
	const mock = vi
		.fn()
		.mockResolvedValue(Response.json({ success: false, error: 'Please retry.' }, { status: 503 }));
	vi.stubGlobal('fetch', mock);
	render(Component, { support, orderId: 'order', itemId: 'item' });
	await page
		.getByRole('textbox', { name: 'Your public link' })
		.fill('https://instagram.com/example');
	await page.getByRole('button', { name: 'Send link for review' }).click();
	await expect.element(page.getByRole('alert')).toHaveTextContent('Please retry.');
	await page.getByRole('button', { name: 'Send link for review' }).click();
	expect(JSON.parse(mock.mock.calls[0][1].body).operationId).toBe(
		JSON.parse(mock.mock.calls[1][1].body).operationId
	);
});
