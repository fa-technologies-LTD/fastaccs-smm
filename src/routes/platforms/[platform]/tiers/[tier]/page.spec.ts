import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

describe('account tier page load errors', () => {
	it('preserves a missing tier as a 404', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { id: 'platform-1', name: 'X', slug: 'x' } }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [] }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			);

		await expect(
			load({
				params: { platform: 'x', tier: 'does-not-exist' },
				fetch
			} as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('keeps unexpected failures as a safe 500', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const fetch = vi.fn().mockRejectedValue(new Error('network unavailable'));

		await expect(
			load({
				params: { platform: 'x', tier: 'anything' },
				fetch
			} as never)
		).rejects.toMatchObject({ status: 500 });

		consoleError.mockRestore();
	});
});
