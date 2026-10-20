import { expect, it, vi } from 'vitest';
const environment = vi.hoisted(() => ({ dev: true }));
vi.mock('$app/environment', () => environment);
import { load } from './+page.server';
const event = (host = 'localhost') =>
	({
		url: new URL(`http://${host}:5173/local-review/order-support`),
		setHeaders: vi.fn()
	}) as never;
it('serves only a no-store/noindex loopback demo and refuses production or public access', async () => {
	environment.dev = true;
	const request = event();
	await expect(load(request)).resolves.toEqual({});
	expect((request as any).setHeaders).toHaveBeenCalledWith({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow'
	});
	await expect(load(event('example.com'))).rejects.toMatchObject({ status: 404 });
	environment.dev = false;
	await expect(load(event())).rejects.toMatchObject({ status: 404 });
	environment.dev = true;
});
