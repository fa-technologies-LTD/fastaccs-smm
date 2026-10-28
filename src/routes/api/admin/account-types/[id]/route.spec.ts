import { beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ category: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock('$lib/prisma', () => ({ prisma: db }));
vi.mock('$lib/services/admin-metrics', () => ({ invalidateAdminStatsCache: vi.fn() }));
vi.mock('$lib/auth/admin-roles', () => ({
	hasAdminPermission: (context: { permissions: string[] }, permission: string) =>
		context.permissions.includes(permission)
}));

import { PATCH } from './+server';

const call = (body: unknown, permissions: string[], canViewRevenue = false) =>
	PATCH({
		params: { id: 'tier-1' },
		request: new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }),
		locals: { user: { id: 'admin' }, adminContext: { permissions, canViewRevenue } }
	} as never);

const ASSISTANT = ['admin:access', 'admin:orders:manage', 'admin:inventory:manage'];
const OWNER = [...ASSISTANT, 'admin:catalog:manage', 'admin:revenue:view'];

beforeEach(() => {
	vi.clearAllMocks();
	db.category.findUnique.mockResolvedValue({
		id: 'tier-1',
		categoryType: 'tier',
		metadata: {
			delivery_mode: 'manual_handover',
			manual_available: true,
			pricing: { base_price: 5000 },
			unit_cost_ngn: 3000
		}
	});
	db.category.update.mockImplementation(async ({ data }) => ({ id: 'tier-1', ...data }));
});

it('lets inventory staff switch WhatsApp availability, changing nothing else', async () => {
	const response = await call({ manualAvailable: false }, ASSISTANT);
	expect(response.status).toBe(200);
	const saved = db.category.update.mock.calls[0][0].data.metadata;
	expect(saved).toMatchObject({ manual_available: false, pricing: { base_price: 5000 } });
	expect(saved.unit_cost_ngn).toBe(3000);
});

it('keeps price changes for catalogue managers and cost changes for people who see costs', async () => {
	expect((await call({ basePrice: 6000 }, ASSISTANT)).status).toBe(403);
	expect((await call({ unitCostNgn: 2000 }, OWNER, false)).status).toBe(403);
	expect(db.category.update).not.toHaveBeenCalled();
	expect((await call({ basePrice: 6000, unitCostNgn: 2000 }, OWNER, true)).status).toBe(200);
	expect(db.category.update.mock.calls[0][0].data.metadata).toMatchObject({
		pricing: { base_price: 6000 },
		unit_cost_ngn: 2000
	});
});

it('refuses anything that is not an account type', async () => {
	db.category.findUnique.mockResolvedValue({
		id: 'x',
		categoryType: 'boosting_service',
		metadata: {}
	});
	expect((await call({ manualAvailable: true }, OWNER)).status).toBe(404);
});

it('explains that only WhatsApp handover types have an availability switch', async () => {
	db.category.findUnique.mockResolvedValue({
		id: 'tier-1',
		categoryType: 'tier',
		metadata: { delivery_mode: 'instant_auto', pricing: { base_price: 5000 } }
	});
	expect((await call({ manualAvailable: false }, ASSISTANT)).status).toBe(400);
	expect(db.category.update).not.toHaveBeenCalled();
});
