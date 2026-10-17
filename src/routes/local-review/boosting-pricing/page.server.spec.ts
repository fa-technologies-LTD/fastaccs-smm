import { beforeEach, expect, it, vi } from 'vitest';
import type { BoostControlsView } from '$lib/helpers/boosting-pricing-controls';
const environment = vi.hoisted(() => ({ dev: true }));
vi.mock('$app/environment', () => environment);
import { load } from './+page.server';

beforeEach(() => {
	environment.dev = true;
});
const event = (host = 'localhost') =>
	({
		url: new URL(`http://${host}:5173/local-review/boosting-pricing`),
		setHeaders: vi.fn()
	}) as never;

it('provides only illustrative UI data on loopback in development', async () => {
	const request = event();
	const data = (await load(request)) as { pricing: BoostControlsView };
	expect(data?.pricing.sheet.rows).toHaveLength(3);
	expect(data?.pricing.sheet.rows.every((row) => row.serviceId === 'DEMO')).toBe(true);
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
