import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
	permission: vi.fn(),
	load: vi.fn(),
	save: vi.fn(),
	expand: vi.fn(),
	sync: vi.fn()
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mock.permission }));
vi.mock('$lib/server/boosting-providers/pricing-controls', () => ({
	loadBoostControls: mock.load,
	saveBoostControls: mock.save
}));
vi.mock('$lib/server/boosting-providers/draft-suggestions', () => ({
	prepopulateBoostingDraftSuggestions: mock.expand
}));
vi.mock('$lib/server/boosting-providers/catalog-sync', () => ({
	syncBoostProviderCatalogues: mock.sync
}));
vi.mock('$lib/server/boosting-providers/pricing-sheet', () => ({
	BoostPricingError: class extends Error {
		constructor(
			message: string,
			readonly status = 400
		) {
			super(message);
		}
	}
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
	mock.sync.mockResolvedValue([{ status: 'synced' }]);
	mock.expand.mockResolvedValue({ offersCreated: 2 });
});
it('denies reads, export, save and expansion without catalogue permission', async () => {
	mock.permission.mockReturnValue(false);
	expect((await GET(event())).status).toBe(403);
	expect((await GET(event({}, undefined, '?export=csv'))).status).toBe(403);
	expect((await POST(event({ action: 'expand' }))).status).toBe(403);
	expect(mock.sync).not.toHaveBeenCalled();
});
it('rejects cross-origin mutations before contacting suppliers', async () => {
	expect((await POST(event({ action: 'expand' }, 'https://evil.example'))).status).toBe(403);
	expect(mock.sync).not.toHaveBeenCalled();
});
it('saves through the atomic controls service, with no separate publish step', async () => {
	expect((await POST(event({ action: 'save', sheet }))).status).toBe(200);
	expect(mock.save).toHaveBeenCalledWith(sheet, 'admin');
});
it('expands from refreshed catalogues using add-only hidden drafts', async () => {
	const response = await POST(event({ action: 'expand' }));
	expect(response.status).toBe(200);
	expect(mock.expand).toHaveBeenCalledWith({ appendOnly: true, usdNgnRate: 1500 });
	expect(mock.save).not.toHaveBeenCalled();
	expect((await response.json()).summary.offersCreated).toBe(2);
});
it('does not expand when all supplier refreshes fail', async () => {
	mock.sync.mockResolvedValue([{ status: 'failed' }]);
	expect((await POST(event({ action: 'expand' }))).status).toBe(400);
	expect(mock.expand).not.toHaveBeenCalled();
});
it('removes old sheet publish/restore mutation paths', async () => {
	expect((await POST(event({ action: 'publish', version: 1, confirm: true }))).status).toBe(400);
	expect((await POST(event({ action: 'restore', version: 1, historyId: 'old' }))).status).toBe(400);
	expect(mock.save).not.toHaveBeenCalled();
});
it('exports private downloadable CSV', async () => {
	const response = await GET(event({}, undefined, '?export=csv'));
	expect(response.headers.get('content-disposition')).toContain('.csv');
	expect(response.headers.get('cache-control')).toBe('private, no-store');
	expect(await response.text()).toContain('Selling price NGN');
});
it('rejects malformed data and hides internal failures', async () => {
	expect((await POST(event(null))).status).toBe(400);
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	mock.save.mockRejectedValueOnce(new Error('private database password'));
	const response = await POST(event({ action: 'save', sheet }));
	expect(response.status).toBe(500);
	expect(await response.text()).not.toContain('password');
	log.mockRestore();
});
