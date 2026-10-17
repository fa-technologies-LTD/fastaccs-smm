import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
	permission: vi.fn(),
	controls: vi.fn(),
	choices: vi.fn(),
	offer: vi.fn()
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mock.permission }));
vi.mock('$lib/server/boosting-providers/pricing-controls', () => ({
	loadBoostControls: mock.controls
}));
vi.mock('$lib/server/boosting-providers/supplier-choice', () => ({
	loadBoostSupplierChoices: mock.choices
}));
vi.mock('$lib/prisma', () => ({
	prisma: { boostCustomerOffer: { findUnique: mock.offer, findFirst: mock.offer } }
}));
import { GET } from './+server';
const event = (query = 'row=row', user: object | null = { id: 'admin' }) =>
	({
		locals: { user, adminContext: {} },
		url: new URL(`http://localhost/api/admin/boosting-pricing/supplier-choices?${query}`),
		setHeaders: vi.fn()
	}) as never;
beforeEach(() => {
	vi.clearAllMocks();
	mock.permission.mockReturnValue(true);
	mock.controls.mockResolvedValue({
		sheet: { rows: [{ id: 'row', platform: 'tiktok', outcome: 'likes', sourceOfferId: null }] },
		setup: { row: { categoryId: 'category' } }
	});
	mock.choices.mockResolvedValue({ services: [], hasMore: false });
});
it('requires a catalogue manager before any catalogue reads', async () => {
	expect((await GET(event('row=row', null))).status).toBe(403);
	mock.permission.mockReturnValue(false);
	expect((await GET(event())).status).toBe(403);
	expect(mock.controls).not.toHaveBeenCalled();
});
it('validates provider/search and supports rows that do not yet have a saved supplier or offer', async () => {
	expect((await GET(event('row=row&provider=unknown'))).status).toBe(400);
	expect((await GET(event(`row=row&search=${'x'.repeat(121)}`))).status).toBe(400);
	const input = event('row=row&provider=smm_raja&search=s4975');
	expect((await GET(input)).status).toBe(200);
	expect(mock.choices).toHaveBeenCalledWith(
		expect.objectContaining({ id: 'row' }),
		{ provider: 'smm_raja', search: 's4975' },
		expect.anything()
	);
	expect((input as any).setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
});
it('rejects unknown rows and hides connection details on failure', async () => {
	expect((await GET(event('row=unknown'))).status).toBe(400);
	mock.controls.mockRejectedValueOnce(new Error('private credentials'));
	const response = await GET(event());
	expect(response.status).toBe(503);
	expect(await response.text()).not.toContain('credentials');
});

it('searches a saved offer without reloading the whole pricing sheet on every keystroke', async () => {
	const id = '11111111-1111-4111-8111-111111111111';
	mock.offer.mockResolvedValue({
		id,
		platform: 'tiktok',
		outcome: 'likes',
		routes: [],
		requiredVerifiedSignals: [],
		refillDays: null,
		audienceTag: 'general'
	});
	expect((await GET(event(`row=row&offerId=${id}&search=Likes`))).status).toBe(200);
	expect(mock.controls).not.toHaveBeenCalled();
	expect(mock.offer).toHaveBeenCalledTimes(1);
});
