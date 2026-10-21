import { expect, it, vi } from 'vitest';
const environment = vi.hoisted(() => ({ dev: true }));
vi.mock('$app/environment', () => environment);
import { load } from './+page.server';

it('allows only loopback development preview with no caching or indexing', async () => {
	const event = (hostname = 'localhost') =>
		({
			url: new URL(`http://${hostname}:5173/local-review/affiliate-bank-details`),
			setHeaders: vi.fn()
		}) as never;
	environment.dev = true;
	const local = event();
	await expect(load(local)).resolves.toEqual({});
	expect(
		(local as unknown as { setHeaders: ReturnType<typeof vi.fn> }).setHeaders
	).toHaveBeenCalledWith({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow'
	});
	await expect(load(event('example.com'))).rejects.toMatchObject({ status: 404 });
	environment.dev = false;
	await expect(load(event())).rejects.toMatchObject({ status: 404 });
	environment.dev = true;
});
