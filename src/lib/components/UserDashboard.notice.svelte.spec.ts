import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import UserDashboard from './UserDashboard.svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidateAll: vi.fn(),
	afterNavigate: vi.fn()
}));

afterEach(() => {
	history.replaceState({}, '', '/');
	vi.unstubAllGlobals();
});

function open(query: string) {
	history.replaceState({}, '', `/dashboard?tab=orders&paymentPending=${query}`);
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ success: true, data: [] }))
	);
	render(UserDashboard, {
		user: { id: 'u1', email: 'buyer@example.invalid' },
		storeCredit: { totalAvailable: 0 }
	} as never);
}

it('does not claim a payment is pending when the order outcome is unknown', async () => {
	open('unknown');
	await expect.element(page.getByText('We couldn’t confirm your order')).toBeVisible();
	await expect
		.element(
			page.getByText(
				'Check your orders below before you try again. If it isn’t there, you weren’t charged.'
			)
		)
		.toBeVisible();
	expect(page.getByText('Waiting for payment confirmation').query()).toBeNull();
});

it('says a saved order is waiting for payment confirmation', async () => {
	open('1');
	await expect.element(page.getByText('Waiting for payment confirmation')).toBeVisible();
});
