import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '../../../app.css';
import BankDetails from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/affiliate/bank-details'), data: { user: null } }
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/stores/toasts', () => ({
	showError: vi.fn(),
	showSuccess: vi.fn(),
	showWarning: vi.fn(),
	addToast: vi.fn()
}));

let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
	request = vi
		.fn()
		.mockResolvedValue(Response.json({ success: true, data: { status: 'pending' } }));
	vi.stubGlobal('fetch', request);
});
afterEach(() => vi.unstubAllGlobals());

function renderForm() {
	render(BankDetails, { data: { submission: null, submissionError: null } } as never);
	return document.querySelector<HTMLInputElement>('#accountNumber')!;
}

it('renders the literal ten-digit pattern rather than interpolating its quantifier', async () => {
	const input = renderForm();
	expect(input.getAttribute('pattern')).toBe('[0-9]{10}');
	await page.getByRole('textbox', { name: 'Account number', exact: true }).fill('0123456789');
	expect(input.checkValidity()).toBe(true);
	expect(input.value).toBe('0123456789');
});

it.each(['123456789', '12345678901', '12345a7890', '12345-7890'])(
	'refuses an invalid account number %s before submitting',
	async (value) => {
		const input = renderForm();
		// Set directly to cover overlength data even when an input limits typing.
		input.value = value;
		expect(input.checkValidity()).toBe(false);
		await page.getByRole('textbox', { name: 'Bank name', exact: true }).fill('Test Bank');
		await page
			.getByRole('textbox', { name: 'Account name', exact: true })
			.fill('Fictional Affiliate');
		await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('08000000000');
		await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
		expect(
			request.mock.calls.filter(([url]) => String(url) === '/api/affiliate/bank-details')
		).toHaveLength(0);
	}
);

it('submits a valid ten-digit account unchanged for review, without requesting a payout', async () => {
	renderForm();
	await page.getByRole('textbox', { name: 'Bank name', exact: true }).fill('Test Bank');
	await page.getByRole('textbox', { name: 'Account number', exact: true }).fill('0123456789');
	await page
		.getByRole('textbox', { name: 'Account name', exact: true })
		.fill('Fictional Affiliate');
	await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('08000000000');
	await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
	await expect
		.element(
			page.getByText("Your submission is under review. We'll let you know once it's approved.")
		)
		.toBeVisible();
	const submissions = request.mock.calls.filter(
		([url]) => String(url) === '/api/affiliate/bank-details'
	);
	expect(submissions).toHaveLength(1);
	expect(JSON.parse(submissions[0][1].body).accountNumber).toBe('0123456789');
	expect(request.mock.calls.some(([url]) => /payout|withdraw/.test(String(url)))).toBe(false);
});
