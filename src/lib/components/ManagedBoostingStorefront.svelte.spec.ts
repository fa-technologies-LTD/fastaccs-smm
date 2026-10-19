import { page } from '@vitest/browser/context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ManagedBoostingStorefront from './ManagedBoostingStorefront.svelte';
import { cart } from '$lib/stores/cart.svelte';

const notifications = vi.hoisted(() => ({ showSuccess: vi.fn() }));
vi.mock('$lib/stores/toasts', () => ({
	showSuccess: notifications.showSuccess,
	showError: vi.fn(),
	showWarning: vi.fn()
}));

const groups = [
	{
		categoryId: '11111111-1111-4111-8111-111111111111',
		platform: 'x' as const,
		platformLabel: 'X (Twitter)',
		outcome: 'followers',
		outcomeLabel: 'Followers',
		offers: [
			{
				id: '22222222-2222-4222-8222-222222222222',
				categoryId: '11111111-1111-4111-8111-111111111111',
				platform: 'x' as const,
				outcome: 'followers',
				customerName: 'Affordable',
				shortPromise: 'A lower-cost option for straightforward growth.',
				expectationChips: [],
				qualityTier: 'value',
				minQuantity: 500,
				maxQuantity: 100_000,
				stepQuantity: 500,
				quantityPresets: [500, 1000, 2500, 5000],
				pricePerStepNgn: 2000,
				refillDays: null,
				displayOrder: 0
			},
			{
				id: '33333333-3333-4333-8333-333333333333',
				categoryId: '11111111-1111-4111-8111-111111111111',
				platform: 'x' as const,
				outcome: 'followers',
				customerName: 'More stable',
				shortPromise: 'Less likely to drop, with stronger staying power.',
				expectationChips: ['30-day refill protection'],
				qualityTier: 'stable',
				minQuantity: 500,
				maxQuantity: 100_000,
				stepQuantity: 500,
				quantityPresets: [500, 1000, 2500, 5000],
				pricePerStepNgn: 5000,
				refillDays: 30,
				displayOrder: 1
			}
		]
	}
];

describe('Managed Boosting storefront', () => {
	it('uses neutral option labels, no invented recommendation, and explains refill limits', async () => {
		render(ManagedBoostingStorefront, { groups });
		await expect.element(page.getByText('Lower price', { exact: true })).toBeVisible();
		await expect.element(page.getByText('30-day refill', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Recommended', { exact: true })).not.toBeInTheDocument();
		await expect
			.element(page.getByText('Less likely to drop, with stronger staying power.', { exact: true }))
			.not.toBeInTheDocument();
		expect(
			page
				.getByText('Delivery timing varies. Track progress from your order.', { exact: true })
				.all()
		).toHaveLength(1);
		await expect
			.element(page.getByText('Refill terms (eligibility applies)', { exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: /30-day refill/ }).click();
		const terms = page.getByText('Refill terms (eligibility applies)', { exact: true });
		await expect.element(terms).toBeVisible();
		await expect.element(page.getByText(/not\s+a\s+guarantee\s+against\s+drops/)).not.toBeVisible();
		await terms.click();
		await expect.element(page.getByText(/not\s+a\s+guarantee\s+against\s+drops/)).toBeVisible();
		await expect
			.element(page.getByText(/normally starts when your order is sent to the supplier/))
			.toBeVisible();
		await page.getByRole('button', { name: /Lower price/ }).click();
		await expect.element(terms).not.toBeInTheDocument();
	});
	it('keeps differing descriptions attached to their own options', async () => {
		render(ManagedBoostingStorefront, {
			groups: [
				{
					...groups[0],
					offers: groups[0].offers.map((offer, index) => ({
						...offer,
						shortPromise: index ? 'For public profiles.' : 'For public pages.'
					}))
				}
			]
		});
		await expect
			.element(page.getByRole('button', { name: /Lower price/ }))
			.toHaveTextContent('For public pages.');
		await expect
			.element(page.getByRole('button', { name: /30-day refill/ }))
			.toHaveTextContent('For public profiles.');
	});
	it('shows a short refill label for a custom name and disables checkout in the local demo', async () => {
		const add = vi.spyOn(cart, 'addBoostingService').mockImplementation(() => {});
		render(ManagedBoostingStorefront, {
			groups: [{ ...groups[0], offers: [{ ...groups[0].offers[1], customerName: 'X Followers' }] }],
			previewOnly: true
		});
		await expect.element(page.getByText('30-day refill', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Preview only — checkout disabled' }))
			.toBeDisabled();
		expect(add).not.toHaveBeenCalled();
	});
	afterEach(() => {
		cart.close();
		notifications.showSuccess.mockClear();
		vi.restoreAllMocks();
	});
	const customGroups = [
		{
			...groups[0],
			platform: 'tiktok' as const,
			platformLabel: 'TikTok',
			outcome: 'custom_comments',
			outcomeLabel: 'Custom comments',
			offers: [
				{
					...groups[0].offers[0],
					platform: 'tiktok' as const,
					outcome: 'custom_comments',
					customerName: 'Custom comments',
					minQuantity: 10,
					maxQuantity: 500,
					stepQuantity: 1,
					pricePerStepNgn: 10.5,
					quantityPresets: []
				}
			]
		}
	];
	it('counts custom comments rather than showing a separate quantity input', async () => {
		render(ManagedBoostingStorefront, { groups: customGroups });
		await page.getByLabelText('Your comments').fill('Love this!\nLovely colours!\nGreat work!');
		await expect.element(page.getByText('3 comments · One per line')).toBeVisible();
		await expect.element(page.getByRole('spinbutton')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add to Cart — ₦50' })).toBeVisible();
	});
	it('does not add too few custom comments and only shows the error after an attempt', async () => {
		const add = vi.spyOn(cart, 'addBoostingService').mockImplementation(() => {});
		render(ManagedBoostingStorefront, { groups: customGroups });
		await page.getByLabelText('Your comments').fill('Lovely!');
		await expect
			.element(page.getByText('Use at least 10 comments, in steps of 1.'))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: /Add to Cart/ }).click();
		await expect.element(page.getByText('Use at least 10 comments, in steps of 1.')).toBeVisible();
		expect(add).not.toHaveBeenCalled();
	});
	it('sends the exact approved comments and their count to the cart', async () => {
		const open = vi.spyOn(cart, 'open');
		vi.spyOn(cart, 'ensureDeliveryModeCompatibility').mockResolvedValue({
			compatible: true,
			existingMode: null
		});
		const add = vi.spyOn(cart, 'addBoostingService').mockImplementation(() => {});
		render(ManagedBoostingStorefront, { groups: customGroups });
		const comments = Array.from({ length: 10 }, (_, i) => `Lovely idea ${i + 1}!`).join('\n');
		await page.getByLabelText('Your comments').fill(comments);
		await page
			.getByLabelText('Paste your post or video link')
			.fill('https://www.tiktok.com/@faworldwidegifting/video/7599586070874918162');
		await page.getByRole('button', { name: /Add to Cart/ }).click();
		expect(add).toHaveBeenCalledWith(
			groups[0].categoryId,
			'https://www.tiktok.com/@faworldwidegifting/video/7599586070874918162',
			10,
			groups[0].offers[0].id,
			comments
		);
		expect(open).toHaveBeenCalled();
		expect(notifications.showSuccess).toHaveBeenCalledWith(
			'Added to cart!',
			expect.any(String),
			6000
		);
	});
	it('starts a cheap offer at ₦500 and keeps the existing quantity increment', async () => {
		const cheapGroups = [
			{
				...groups[0],
				offers: [
					{ ...groups[0].offers[0], minQuantity: 100, stepQuantity: 100, pricePerStepNgn: 50 }
				]
			}
		];
		render(ManagedBoostingStorefront, { groups: cheapGroups });
		await expect.element(page.getByRole('button', { name: 'Add to Cart — ₦500' })).toBeVisible();
		await expect.element(page.getByRole('spinbutton')).toHaveValue(1000);
		await page.getByRole('button', { name: 'Increase followers quantity by 100' }).click();
		await expect.element(page.getByRole('spinbutton')).toHaveValue(1100);
	});

	it('renders the approved platform, result, tier and working purchase controls', async () => {
		render(ManagedBoostingStorefront, { groups });

		await expect.element(page.getByRole('button', { name: /X \(Twitter\)/ }).first()).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Followers', exact: true }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /Lower price/ })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Lower price/ }))
			.toHaveTextContent('500 followers');
		await expect.element(page.getByRole('button', { name: /30-day refill/ })).toBeVisible();
		await expect.element(page.getByLabelText('Paste your profile link')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Add to Cart/ })).toBeEnabled();
	});
	it('uses the service name without a tier or recommendation when only one option exists', async () => {
		render(ManagedBoostingStorefront, {
			groups: [{ ...groups[0], offers: [{ ...groups[0].offers[0], customerName: 'Premium' }] }]
		});
		await expect.element(page.getByRole('button', { name: /500 followers/ })).toBeVisible();
		expect(page.getByText('Premium', { exact: true }).query()).toBeNull();
		expect(page.getByText('Recommended', { exact: true }).query()).toBeNull();
		expect(page.getByText('Pick what suits you', { exact: true }).query()).toBeNull();
	});
});
