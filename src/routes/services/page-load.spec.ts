import { expect, it, vi } from 'vitest';
import { load } from './+page';
import { load as platformLoad } from './[platform]/+page';

it('never resurrects legacy prices when the availability API fails', async () => {
	const fetch = vi.fn(async (url: string) =>
		url === '/api/boosting-offers'
			? Response.json({ error: 'unavailable' }, { status: 503 })
			: Response.json({
					data: [
						{
							id: 'legacy',
							name: 'TikTok Likes',
							metadata: { boosting_platform: 'tiktok', boosting_action_type: 'likes' }
						}
					]
				})
	);
	const index = await load({ fetch } as never);
	expect(index).toMatchObject({ managedRolloutActive: true, managedGroups: [], platformTiles: [] });
	const platform = await platformLoad({ fetch, params: { platform: 'tiktok' } } as never);
	expect(platform).toMatchObject({ services: [], error: expect.stringContaining('availability') });
});
