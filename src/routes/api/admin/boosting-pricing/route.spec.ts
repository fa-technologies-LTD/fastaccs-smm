import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
	permission: vi.fn(),
	load: vi.fn(),
	save: vi.fn(),
	publish: vi.fn(),
	restore: vi.fn(),
	reconcile: vi.fn()
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mock.permission }));
vi.mock('$lib/server/boosting-providers/pricing-sheet', () => ({
	BoostPricingError: class extends Error {
		constructor(
			message: string,
			readonly status = 400
		) {
			super(message);
		}
	},
	loadBoostPricingView: mock.load,
	saveBoostPricingDraft: mock.save,
	publishBoostPricingSheet: mock.publish,
	restoreBoostPricingDraft: mock.restore,
	reconcileBoostPricingDraft: mock.reconcile
}));
import { GET, POST } from './+server';
import { sheet, quote } from '$lib/helpers/boosting-pricing-sheet-fixtures';
const event = (body: unknown = {}, origin = 'https://smm.fastaccs.com', query = '') =>
	({
		locals: { user: { id: 'admin' }, adminContext: {} },
		url: new URL('https://smm.fastaccs.com/api/admin/boosting-pricing' + query),
		request: new Request('https://smm.fastaccs.com/api/admin/boosting-pricing', {
			method: 'POST',
			headers: { origin, 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		setHeaders: vi.fn()
	}) as never;
beforeEach(() => {
	vi.clearAllMocks();
	mock.permission.mockReturnValue(true);
	mock.load.mockResolvedValue({ sheet, quotes: { row: quote } });
});
it('denies reads, export and writes without catalogue permission', async () => {
	mock.permission.mockReturnValue(false);
	expect((await GET(event())).status).toBe(403);
	expect((await GET(event({}, undefined, '?export=csv'))).status).toBe(403);
	expect((await POST(event())).status).toBe(403);
	expect(mock.load).not.toHaveBeenCalled();
	expect(mock.save).not.toHaveBeenCalled();
});
it('rejects cross-origin writes before any mutation', async () => {
	expect((await POST(event({ action: 'save', sheet }, 'https://evil.example'))).status).toBe(403);
	expect(mock.save).not.toHaveBeenCalled();
});
it('saving a draft never publishes', async () => {
	expect((await POST(event({ action: 'save', sheet }))).status).toBe(200);
	expect(mock.save).toHaveBeenCalledWith(sheet, 'admin');
	expect(mock.publish).not.toHaveBeenCalled();
});
it('requires explicit publication confirmation and saved revision', async () => {
	expect((await POST(event({ action: 'publish', version: 1 }))).status).toBe(400);
	expect(mock.publish).not.toHaveBeenCalled();
	expect((await POST(event({ action: 'publish', version: 1, confirm: true }))).status).toBe(200);
	expect(mock.publish).toHaveBeenCalledWith(1, 'admin');
});
it('returns downloadable CSV with no-store headers', async () => {
	const response = await GET(event({}, undefined, '?export=csv'));
	expect(response.headers.get('content-disposition')).toContain('.csv');
	expect(response.headers.get('cache-control')).toBe('private, no-store');
	expect(await response.text()).toContain('Selling price NGN');
});
it('rejects malformed action data', async () => {
	expect((await POST(event(null))).status).toBe(400);
	expect(mock.save).not.toHaveBeenCalled();
});
it('accepts external setup changes only as a confirmed draft', async () => {
	expect((await POST(event({ action: 'reconcile', version: 1 }))).status).toBe(400);
	expect(mock.reconcile).not.toHaveBeenCalled();
	expect((await POST(event({ action: 'reconcile', version: 1, confirm: true }))).status).toBe(200);
	expect(mock.reconcile).toHaveBeenCalledWith(1, 'admin');
	expect(mock.publish).not.toHaveBeenCalled();
});
it('does not expose unexpected internal error messages', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	mock.save.mockRejectedValueOnce(new Error('database password is private'));
	const response = await POST(event({ action: 'save', sheet }));
	expect(response.status).toBe(500);
	expect(await response.text()).not.toContain('password');
	log.mockRestore();
});
