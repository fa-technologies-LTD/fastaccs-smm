import { beforeEach, expect, it, vi } from 'vitest';
const environment = vi.hoisted(() => ({ dev: true }));
vi.mock('$app/environment', () => environment);
import { load } from './+page.server';

beforeEach(() => {
	environment.dev = true;
});
const event = (host = 'localhost') =>
	({
		url: new URL(`http://${host}:5173/local-review/boosting-copy`),
		setHeaders: vi.fn()
	}) as never;

it('serves fictional offers with non-indexable, uncached development headers', async () => {
	const request = event();
	const data = (await load(request)) as { groups: { offers: { id: string }[] }[] };
	expect(data.groups[0].offers.map((offer) => offer.id)).toEqual(['demo-standard', 'demo-refill']);
	expect((request as { setHeaders: ReturnType<typeof vi.fn> }).setHeaders).toHaveBeenCalledWith({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow'
	});
});
it('is unavailable in production even on loopback', async () => {
	environment.dev = false;
	await expect(load(event())).rejects.toMatchObject({ status: 404 });
});
it('is unavailable on non-loopback hosts even in development', async () => {
	await expect(load(event('example.com'))).rejects.toMatchObject({ status: 404 });
});
