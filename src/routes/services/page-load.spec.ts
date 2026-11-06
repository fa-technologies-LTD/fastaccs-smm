import { expect, it, vi } from 'vitest';
import { load } from './+page';
import { load as platformLoad } from './[platform]/+page';

const legacyCategories = () =>
	Response.json({
		data: [
			{
				id: 'legacy',
				name: 'TikTok Likes',
				metadata: { boosting_platform: 'tiktok', boosting_action_type: 'likes' }
			}
		]
	});

it('never resurrects legacy prices when the availability API fails', async () => {
	const fetch = vi.fn(async (url: string) =>
		url === '/api/boosting-offers'
			? Response.json({ error: 'unavailable' }, { status: 503 })
			: legacyCategories()
	);
	const index = await load({ fetch } as never);
	expect(index).toMatchObject({ managedGroups: [] });
	expect(index).not.toHaveProperty('platformTiles');
	const platform = await platformLoad({ fetch, params: { platform: 'tiktok' } } as never);
	expect(platform).toMatchObject({ services: [], error: expect.stringContaining('availability') });
});

it('shows the upgrade pause, never the old catalogue, when no reviewed offer is live', async () => {
	const fetch = vi.fn(async (url: string) =>
		url === '/api/boosting-offers'
			? Response.json({ success: true, managedRolloutActive: false, data: [] })
			: url === '/api/categories?type=platform'
				? Response.json({ data: [{ slug: 'tiktok', metadata: {} }] })
				: legacyCategories()
	);
	const index = await load({ fetch } as never);
	expect(index).toMatchObject({ managedGroups: [], error: null });
	expect(fetch).not.toHaveBeenCalledWith('/api/categories?type=boosting_service');
	// A category with no reviewed offer is not for sale on its platform page either.
	await expect(
		platformLoad({ fetch, params: { platform: 'tiktok' } } as never)
	).rejects.toMatchObject({ status: 303, location: '/services' });
});
