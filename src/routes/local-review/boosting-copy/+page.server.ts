import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	if (!dev || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) error(404, 'Not found');
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' });
	const sample = {
		categoryId: 'demo-x-followers',
		platform: 'x' as const,
		outcome: 'followers',
		customerName: 'Affordable',
		shortPromise: 'Delivery timing varies. Track progress from your order.',
		expectationChips: [],
		qualityTier: 'value',
		minQuantity: 500,
		maxQuantity: 100000,
		stepQuantity: 500,
		quantityPresets: [500, 1000, 2500],
		pricePerStepNgn: 2500,
		refillDays: null,
		displayOrder: 0
	};
	return {
		groups: [
			{
				categoryId: sample.categoryId,
				platform: sample.platform,
				platformLabel: 'X (Twitter)',
				outcome: 'followers',
				outcomeLabel: 'Followers',
				offers: [
					{ ...sample, id: 'demo-standard' },
					{
						...sample,
						id: 'demo-refill',
						customerName: 'X Followers',
						minQuantity: 200,
						stepQuantity: 200,
						quantityPresets: [200, 400, 1000],
						pricePerStepNgn: 2800,
						refillDays: 30,
						displayOrder: 1
					}
				]
			},
			{
				categoryId: 'demo-spotify-followers',
				platform: 'spotify' as const,
				platformLabel: 'Spotify',
				outcome: 'followers',
				outcomeLabel: 'Followers',
				offers: [
					{
						...sample,
						id: 'demo-spotify-low',
						categoryId: 'demo-spotify-followers',
						platform: 'spotify' as const,
						customerName: 'Affordable',
						minQuantity: 100,
						stepQuantity: 100,
						quantityPresets: [100, 500, 1000],
						pricePerStepNgn: 75
					},
					{
						...sample,
						id: 'demo-spotify-other',
						categoryId: 'demo-spotify-followers',
						platform: 'spotify' as const,
						customerName: 'Premium',
						minQuantity: 100,
						stepQuantity: 100,
						quantityPresets: [100, 500, 1000],
						pricePerStepNgn: 650
					}
				]
			},
			{
				categoryId: 'demo-spotify-saves',
				platform: 'spotify' as const,
				platformLabel: 'Spotify',
				outcome: 'saves',
				outcomeLabel: 'Saves',
				offers: [
					{
						...sample,
						id: 'demo-spotify-single',
						categoryId: 'demo-spotify-saves',
						platform: 'spotify' as const,
						outcome: 'saves',
						customerName: 'Premium',
						minQuantity: 1000,
						stepQuantity: 1000,
						quantityPresets: [1000, 2000],
						pricePerStepNgn: 500
					}
				]
			},
			{
				categoryId: 'demo-instagram-audience',
				platform: 'instagram' as const,
				platformLabel: 'Instagram',
				outcome: 'followers',
				outcomeLabel: 'Followers',
				offers: [
					{
						...sample,
						id: 'demo-nigeria',
						categoryId: 'demo-instagram-audience',
						platform: 'instagram' as const,
						customerName: 'Instagram Followers',
						benefitLabel: 'Nigeria audience',
						pricePerStepNgn: 1500
					},
					{
						...sample,
						id: 'demo-uk',
						categoryId: 'demo-instagram-audience',
						platform: 'instagram' as const,
						customerName: 'Instagram Followers',
						benefitLabel: 'UK audience',
						pricePerStepNgn: 2500
					}
				]
			}
		]
	};
};
