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

function workspace(categoryId: string, name: string): BoostMappingWorkspace {
	return {
		foundationReady: true,
		migrationMessage: null,
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
		configuredCurrencyBufferPercent: 5
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

		render(Page, { data: { offers: [...offers] } } as never);
		await expect.poll(() => fetchMock.mock.calls.length).toBe(1);

		await page.getByRole('button', { name: /Facebook Page Followers/ }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Facebook Page Followers' }))
			.toBeVisible();

		finishFirst?.(Response.json({ success: true, data: workspace(offers[0].id, offers[0].name) }));
		await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
		await expect
			.element(page.getByRole('heading', { name: 'Facebook Page Followers' }))
			.toBeVisible();
	});
});
