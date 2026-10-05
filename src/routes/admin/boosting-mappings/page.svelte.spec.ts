import { page } from '@vitest/browser/context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { BoostMappingWorkspace } from '$lib/helpers/boosting-mapping-types';
import Page from './+page.svelte';

const offers = [
	{
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Facebook Comments',
		isActive: true,
		platform: 'facebook',
		platformLabel: 'Facebook',
		outcome: 'comments',
		outcomeLabel: 'Comments',
		pricePerStepNgn: 700
	},
	{
		id: '22222222-2222-4222-8222-222222222222',
		name: 'Facebook Page Followers',
		isActive: true,
		platform: 'facebook',
		platformLabel: 'Facebook',
		outcome: 'followers',
		outcomeLabel: 'Followers',
		pricePerStepNgn: 2000
	}
] as const;

function workspace(
	categoryId: string,
	name: string,
	qualityTier: 'value' | 'stable' | 'premium' = 'value'
): BoostMappingWorkspace {
	return {
		foundationReady: true,
		migrationMessage: null,
		selectedQualityTier: qualityTier,
		category: {
			id: categoryId,
			name,
			platform: 'facebook',
			outcome: name.includes('Followers') ? 'followers' : 'comments',
			minQuantity: name.includes('Followers') ? 1000 : 50,
			stepQuantity: name.includes('Followers') ? 1000 : 50,
			pricePerStepNgn: name.includes('Followers') ? 2000 : 700,
			refillDays: null
		},
		offer: null,
		candidates: [],
		candidateCount: 0,
		configuredFxNgnPerUsd: 1700,
		configuredCurrencyBufferPercent: 5,
		configuredDefaultMarginPercent: 40
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Boosting mapping offer selection', () => {
	it('keeps the latest clicked offer when an earlier request finishes late', async () => {
		let finishFirst: ((response: Response) => void) | undefined;
		const firstResponse = new Promise<Response>((resolve) => {
			finishFirst = resolve;
		});
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes(offers[0].id)) return firstResponse;
			return Promise.resolve(
				Response.json({ success: true, data: workspace(offers[1].id, offers[1].name) })
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			data: {
				offers: [...offers],
				mappingSummary: { categories: 2, tiers: 0, reviewedTiers: 0, approvedRoutes: 0 }
			}
		} as never);
		await expect.poll(() => fetchMock.mock.calls.length).toBe(1);

		await page.getByRole('combobox', { name: 'Result' }).selectOptions(offers[1].id);
		await expect
			.element(page.getByRole('heading', { name: 'Facebook Page Followers' }))
			.toBeVisible();

		finishFirst?.(Response.json({ success: true, data: workspace(offers[0].id, offers[0].name) }));
		await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
		await expect
			.element(page.getByRole('heading', { name: 'Facebook Page Followers' }))
			.toBeVisible();
	});

	it('opens the recommended category and exact tier first', async () => {
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const requestUrl = String(input);
			if (!requestUrl) throw new Error('Missing request URL');
			return Promise.resolve(
				Response.json({
					success: true,
					data: workspace(offers[1].id, offers[1].name, 'premium')
				})
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			data: {
				offers: [...offers],
				mappingSummary: { categories: 2, tiers: 3, reviewedTiers: 0, approvedRoutes: 0 },
				firstReviewQueue: [
					{
						categoryId: offers[1].id,
						categoryName: offers[1].name,
						qualityTier: 'premium',
						qualityLabel: 'Premium',
						platformLabel: 'Facebook',
						outcomeLabel: 'Followers',
						routeCount: 4
					}
				]
			}
		} as never);

		await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(offers[1].id);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain('tier=premium');
		await expect
			.element(page.getByRole('heading', { name: 'Facebook Page Followers' }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /Premium/ })).toBeVisible();
		await expect.element(page.getByText('Default target profit % for new options')).toBeVisible();
		await expect.element(page.getByText('Target profit on supplier cost %')).toBeVisible();
		expect(page.getByText(/Paid pilot controls/i).query()).toBeNull();
		expect(page.getByText(/Currency buffer/i).query()).toBeNull();
	});

	it('lets My choice use an owner-tested service when catalogue quality wording is missing', async () => {
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const requestUrl = String(input);
			if (requestUrl.includes('/api/admin/boosting-suppliers/service?')) {
				return Promise.resolve(
					Response.json({
						success: true,
						data: {
							found: true,
							compatible: true,
							issues: [
								'The supplier listing does not state premium, high-quality, HQ or real delivery; use your own test result.'
							],
							service: {
								id: 'service-14545',
								provider: 'bulk_follows',
								providerLabel: 'BulkFollows',
								serviceId: '14545',
								name: 'Facebook Followers - 30 day refill',
								category: 'Facebook',
								providerType: null,
								ratePerThousand: 6.5,
								minQuantity: 200,
								maxQuantity: 100_000,
								refillAdvertised: true,
								refillDaysClaimed: 30,
								cancelAdvertised: false,
								dripfeedAdvertised: false,
								qualitySignals: ['refill_claim'],
								catalogueStatus: 'ready_for_review',
								lastSeenAt: new Date().toISOString(),
								mappedRoute: null
							}
						}
					})
				);
			}
			return Promise.resolve(
				Response.json({
					success: true,
					data: workspace(offers[1].id, offers[1].name, 'premium')
				})
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			data: {
				offers: [...offers],
				mappingSummary: { categories: 2, tiers: 3, reviewedTiers: 0, approvedRoutes: 0 },
				firstReviewQueue: [
					{
						categoryId: offers[1].id,
						categoryName: offers[1].name,
						qualityTier: 'premium',
						qualityLabel: 'Premium',
						platformLabel: 'Facebook',
						outcomeLabel: 'Followers',
						routeCount: 0
					}
				]
			}
		} as never);

		await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
		await page.getByRole('textbox', { name: 'Primary service code' }).fill('14545');
		await page.getByRole('button', { name: 'Find' }).click();
		const approveButton = page.getByRole('button', {
			name: 'Use for Premium based on my test'
		});
		await expect.element(approveButton).toBeVisible();
		await approveButton.click();
		await expect.element(page.getByText('Primary · BulkFollows #14545').first()).toBeVisible();
		await expect.element(page.getByText('Supplier cost for 200')).toBeVisible();
	});
});
