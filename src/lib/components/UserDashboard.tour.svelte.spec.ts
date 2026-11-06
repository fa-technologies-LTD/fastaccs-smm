import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserDashboard from './UserDashboard.svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidateAll: vi.fn(),
	afterNavigate: vi.fn()
}));

beforeEach(() => {
	history.replaceState({}, '', '/dashboard');
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ success: true, data: [] }))
	);
});
afterEach(() => {
	localStorage.clear();
	vi.unstubAllGlobals();
});

function open(options: { paidOrders?: number; secured?: boolean } = {}) {
	render(UserDashboard, {
		user: { id: 'u1', emailVerified: options.secured ?? false },
		metrics: { completedOrders: options.paidOrders ?? 0 },
		storeCredit: { totalAvailable: 0 }
	} as never);
}
const dialog = () => page.getByRole('dialog');
const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();

describe('dashboard tour', () => {
	it('walks a new customer through the dashboard once, in plain words', async () => {
		open();
		await expect
			.element(page.getByText('Welcome to your dashboard'), { timeout: 3000 })
			.toBeVisible();
		await page.getByRole('button', { name: 'Show me' }).click();
		await expect.element(dialog()).toHaveTextContent('Your store credit');
		await next();
		await expect.element(dialog()).toHaveTextContent('Your orders');
		await next();
		await expect.element(dialog()).toHaveTextContent('Your accounts');
		await next();
		await expect.element(dialog()).toHaveTextContent('6-digit code');
		await next();
		await expect.element(dialog()).toHaveTextContent('WhatsApp');
		await page.getByRole('button', { name: 'Done' }).click();
		expect(dialog().query()).toBeNull();
		expect(localStorage.getItem('fastaccs_dashboard_tour_v1:u1')).toBe('done');
	});

	it('does not open again once seen, and can be replayed from the header', async () => {
		localStorage.setItem('fastaccs_dashboard_tour_v1:u1', 'done');
		open();
		await new Promise((resolve) => setTimeout(resolve, 900));
		expect(dialog().query()).toBeNull();
		await page.getByRole('button', { name: 'Take the tour' }).click();
		await expect.element(page.getByText('Welcome to your dashboard')).toBeVisible();
		await page.getByRole('button', { name: 'Not now' }).click();
		expect(dialog().query()).toBeNull();
	});

	it('leaves regular customers alone and skips the email step when already secured', async () => {
		open({ paidOrders: 4, secured: true });
		await new Promise((resolve) => setTimeout(resolve, 900));
		expect(dialog().query()).toBeNull();
		await page.getByRole('button', { name: 'Take the tour' }).click();
		await page.getByRole('button', { name: 'Show me' }).click();
		await next();
		await next();
		await next();
		await expect.element(dialog()).toHaveTextContent('That’s it');
	});

	it('closes with Escape', async () => {
		open();
		await expect
			.element(page.getByText('Welcome to your dashboard'), { timeout: 3000 })
			.toBeVisible();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => dialog().query()).toBeNull();
	});
});
