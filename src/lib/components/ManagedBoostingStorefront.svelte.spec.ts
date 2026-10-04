import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ManagedBoostingStorefront from './ManagedBoostingStorefront.svelte';

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
	it('renders the approved platform, result, tier and working purchase controls', async () => {
		render(ManagedBoostingStorefront, { groups });

		await expect.element(page.getByRole('button', { name: /X \(Twitter\)/ })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Followers', exact: true }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /Affordable/ })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /More stable/ })).toBeVisible();
		await expect.element(page.getByLabelText('Paste your profile link')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Add to Cart/ })).toBeEnabled();
	});
});
