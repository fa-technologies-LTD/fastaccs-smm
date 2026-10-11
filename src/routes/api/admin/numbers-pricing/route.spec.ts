import { beforeEach, expect, it, vi } from 'vitest';
import { numbersFixture } from '$lib/helpers/numbers-pricing-sheet-fixtures';
const m = vi.hoisted(() => ({
	permission: vi.fn(),
	load: vi.fn(),
	save: vi.fn(),
	publish: vi.fn()
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: m.permission }));
vi.mock('$lib/server/numbers-pricing-sheet', () => ({
	NumbersPricingError: class extends Error {
		constructor(
			message: string,
			readonly status = 400
		) {
			super(message);
		}
	},
	loadNumbersPricingView: m.load,
	saveNumbersPricingDraft: m.save,
	publishNumbersPricingSheet: m.publish
}));
import { GET, POST } from './+server';
const event = (body: unknown = {}, origin = 'https://smm.fastaccs.com', query = '') =>
	({
		locals: { user: { id: 'admin' }, adminContext: {} },
		url: new URL('https://smm.fastaccs.com/api/admin/numbers-pricing' + query),
		request: new Request('https://smm.fastaccs.com/api/admin/numbers-pricing', {
			method: 'POST',
			headers: { origin, 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		setHeaders: vi.fn()
	}) as never;
beforeEach(() => {
	vi.clearAllMocks();
	m.permission.mockReturnValue(true);
	m.load.mockResolvedValue(numbersFixture());
});
it('denies reads/exports/writes without permission before loading costs', async () => {
	m.permission.mockReturnValue(false);
	expect((await GET(event())).status).toBe(403);
	expect((await GET(event({}, undefined, '?export=csv'))).status).toBe(403);
	expect((await POST(event())).status).toBe(403);
	expect(m.load).not.toHaveBeenCalled();
	expect(m.save).not.toHaveBeenCalled();
});
it('rejects cross-origin writes before mutation', async () => {
	expect(
		(await POST(event({ action: 'save', sheet: numbersFixture().sheet }, 'https://evil.example')))
			.status
	).toBe(403);
	expect(m.save).not.toHaveBeenCalled();
});
it('requires authentication even with a permissive role mock', async () => {
	const e = event() as any;
	e.locals.user = null;
	expect((await GET(e)).status).toBe(403);
	expect((await POST(e)).status).toBe(403);
});
it('saving never publishes', async () => {
	const sheet = numbersFixture().sheet;
	expect((await POST(event({ action: 'save', sheet }))).status).toBe(200);
	expect(m.save).toHaveBeenCalledWith(sheet, 'admin');
	expect(m.publish).not.toHaveBeenCalled();
});
it('requires explicit publish confirmation and a saved revision', async () => {
	expect((await POST(event({ action: 'publish', version: 1 }))).status).toBe(400);
	expect(m.publish).not.toHaveBeenCalled();
	expect((await POST(event({ action: 'publish', version: 1, confirm: true }))).status).toBe(200);
	expect(m.publish).toHaveBeenCalledWith(1, 'admin');
});
it('exports private downloadable CSV', async () => {
	const r = await GET(event({}, undefined, '?export=csv'));
	expect(r.headers.get('cache-control')).toBe('private, no-store');
	expect(r.headers.get('content-disposition')).toContain('.csv');
	expect(await r.text()).toContain('Estimated cost NGN');
});
it('rejects malformed/unknown actions and oversized bodies', async () => {
	expect((await POST(event(null))).status).toBe(400);
	expect((await POST(event({ action: 'seed' }))).status).toBe(400);
	expect((await POST(event({ large: 'x'.repeat(2000001) }))).status).toBe(413);
	expect(m.save).not.toHaveBeenCalled();
});
it('does not expose unexpected internal errors', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	m.save.mockRejectedValueOnce(new Error('Private credentials'));
	const r = await POST(event({ action: 'save' }));
	expect(r.status).toBe(500);
	expect(await r.text()).not.toContain('credentials');
	log.mockRestore();
});
