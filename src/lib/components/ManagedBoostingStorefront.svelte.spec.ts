import { page } from '@vitest/browser/context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ManagedBoostingStorefront from './ManagedBoostingStorefront.svelte';
import { cart } from '$lib/stores/cart.svelte';

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
	afterEach(() => vi.restoreAllMocks());
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

		await expect.element(page.getByRole('button', { name: /X \(Twitter\)/ })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Followers', exact: true }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /Affordable/ })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Affordable/ }))
			.toHaveTextContent('500 followers');
		await expect.element(page.getByRole('button', { name: /More stable/ })).toBeVisible();
		await expect.element(page.getByLabelText('Paste your profile link')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Add to Cart/ })).toBeEnabled();
	});
});
