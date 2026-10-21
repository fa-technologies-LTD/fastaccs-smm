import { expect, it, vi } from 'vitest';
const environment = vi.hoisted(() => ({ dev: true }));
vi.mock('$app/environment', () => environment);
import { load } from './+page.server';

it('keeps the fictional preview loopback/development-only and out of indexing', async () => {
	const request = (hostname = 'localhost') =>
		({
			url: new URL(`http://${hostname}:5173/local-review/super-rewards`),
			setHeaders: vi.fn()
		}) as never;
	environment.dev = true;
	const event = request();
	await expect(load(event)).resolves.toEqual({});
	expect(
		(event as unknown as { setHeaders: ReturnType<typeof vi.fn> }).setHeaders
	).toHaveBeenCalledWith({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow'
	});
	await expect(load(request('example.com'))).rejects.toMatchObject({ status: 404 });
	environment.dev = false;
	await expect(load(request())).rejects.toMatchObject({ status: 404 });
	environment.dev = true;
});
