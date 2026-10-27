import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const whatsappOrder = (id: string, order: Record<string, unknown>) => ({
	id,
	orderNumber: `ORD-${id}`,
	deliveryMethod: 'whatsapp',
	createdAt: '2026-10-21T10:00:00Z',
	totalAmount: 5000,
	refundedAmount: 0,
	orderItems: [{ quantity: 1 }],
	...order
});

it('pins only paid WhatsApp orders still waiting for handover, never refunded or unpaid ones', async () => {
	render(Page, {
		data: {
			orders: [
				whatsappOrder('paid', { status: 'paid', paymentStatus: 'paid' }),
				whatsappOrder('refunded', {
					status: 'refunded',
					paymentStatus: 'refunded',
					deliveryStatus: 'refunded',
					refundedAmount: 5000
				}),
				whatsappOrder('unpaid', { status: 'pending_payment', paymentStatus: 'pending' }),
				whatsappOrder('done', { status: 'completed', paymentStatus: 'paid' })
			],
			error: null,
			canViewRevenue: true,
			canViewOrderAmounts: true,
			adminPermissions: ['admin:orders:manage']
		}
	} as never);
	await expect.element(page.getByText('1 manual handover awaiting delivery')).toBeVisible();
});
