import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BoostProofField from './BoostProofField.svelte';

afterEach(() => vi.restoreAllMocks());

describe('BoostProofField', () => {
	it('explains that proof is optional and private until a report is closed', async () => {
		render(BoostProofField, { itemId: 'item-1', proof: null, onUploaded: () => {} });
		await expect
			.element(page.getByText('only after you close their report, and only once', { exact: false }))
			.toBeVisible();
		expect(page.getByRole('link', { name: 'View proof' }).query()).toBeNull();
	});

	it('uploads a pasted screenshot', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
		const onUploaded = vi.fn();
		render(BoostProofField, { itemId: 'item-1', proof: null, onUploaded });
		const zone = page.getByLabelText('Paste or drop a delivery screenshot').element();
		const data = new DataTransfer();
		data.items.add(new File([new Uint8Array(8)], 'shot.png', { type: 'image/png' }));
		zone.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
		await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/admin/boosting-orders/item-1/proof',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('shows when the customer opened it and when it will be deleted', async () => {
		render(BoostProofField, {
			itemId: 'item-1',
			proof: {
				uploadedAt: '2026-11-06T10:00:00.000Z',
				firstViewedAt: '2026-11-07T10:00:00.000Z',
				deletedAt: null,
				expiresAt: '2026-12-06T10:00:00.000Z'
			},
			onUploaded: () => {}
		});
		await expect.element(page.getByRole('link', { name: 'View proof' })).toBeVisible();
		await expect
			.element(page.getByText('customer viewed it 7 Nov', { exact: false }))
			.toBeVisible();
		await expect.element(page.getByText('deleted 6 Dec', { exact: false })).toBeVisible();
	});
});
