import { beforeEach, expect, it, vi } from 'vitest';
import { sheet as fixture, quote as quoted } from '$lib/helpers/boosting-pricing-sheet-fixtures';
import type { BoostProviderService, Prisma } from '@prisma/client';
import type { BoostPricingRow, BoostPricingSheet } from '$lib/helpers/boosting-pricing-sheet';
type TestOffer = Prisma.BoostCustomerOfferGetPayload<{
	include: { category: true; routes: { include: { providerService: true } } };
}>;
type TestService = Omit<BoostProviderService, 'ratePerThousand'> & {
	ratePerThousand: number | null;
};
type TestLog = { action: string; metadata: { sheet: BoostPricingSheet }; createdAt: Date };
type TestAudit = TestLog & { id: string };
const state = vi.hoisted(() => ({
	record: {} as TestAudit,
	offers: [] as TestOffer[],
	services: [] as TestService[],
	logs: [] as TestLog[]
}));
const db = vi.hoisted(() => ({
	$executeRaw: vi.fn(),
	$queryRaw: vi.fn(),
	$transaction: vi.fn(),
	adminAuditLog: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
	boostCustomerOffer: { findMany: vi.fn(), update: vi.fn() },
	boostProviderService: { findMany: vi.fn(), findUnique: vi.fn() },
	boostServiceRoute: { updateMany: vi.fn(), upsert: vi.fn() },
	category: { update: vi.fn() },
	microcopy: { findMany: vi.fn(), upsert: vi.fn() }
}));
vi.mock('$lib/prisma', () => ({ prisma: db }));
vi.mock('$env/dynamic/private', () => ({ env: { BOOSTING_AUTOMATION_MODE: 'live' } }));
import {
	loadBoostPricingView,
	saveBoostPricingDraft,
	publishBoostPricingSheet,
	restoreBoostPricingDraft,
	reconcileBoostPricingDraft
} from './pricing-sheet';
beforeEach(() => {
	vi.clearAllMocks();
	state.logs = [];
	state.record = {
		id: 'audit',
		createdAt: new Date('2026-10-10T12:00:00Z'),
		metadata: { sheet: { ...structuredClone(fixture), version: 1 } },
		action: 'boosting_pricing_draft_saved'
	};
	state.services = [
		{
			id: quoted.providerServiceId,
			provider: 'smm_raja',
			serviceId: 's1675',
			name: 'TikTok Likes [Real]',
			category: 'TikTok Likes',
			providerType: 'Default',
			ratePerThousand: 0.054,
			minQuantity: 100,
			maxQuantity: 100000,
			targetType: 'content',
			platforms: ['tiktok'],
			outcomes: ['likes'],
			lastSeenAt: new Date(),
			unavailableAt: null,
			catalogueStatus: 'ready_for_review'
		}
	] as unknown as TestService[];
	state.offers = [
		{
			id: 'offer',
			updatedAt: new Date(fixture.rows[0].sourceUpdatedAt!),
			status: 'reviewed',
			platform: 'tiktok',
			outcome: 'likes',
			categoryId: 'category',
			targetType: 'content',
			routes: [],
			lockedRouteId: null,
			preferredRouteId: null,
			category: { metadata: { boosting_platform: 'tiktok', boosting_action_type: 'likes' } },
			shortPromise: 'OLD SUPPLIER PROMISE',
			requiredVerifiedSignals: ['quality_verified'],
			expectationChips: ['30-day refill protection'],
			refillDays: 30
		}
	] as unknown as TestOffer[];
	db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
	db.$executeRaw.mockResolvedValue(1);
	db.$queryRaw.mockResolvedValue([]);
	db.adminAuditLog.findFirst.mockImplementation(async () => state.record);
	db.adminAuditLog.findMany.mockResolvedValue([]);
	db.adminAuditLog.create.mockImplementation(async ({ data }: { data: TestLog }) => {
		state.logs.push(data);
		return data;
	});
	db.boostCustomerOffer.findMany.mockImplementation(async () => state.offers);
	db.boostCustomerOffer.update.mockImplementation(
		async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
			...state.offers.find((o) => o.id === where.id),
			...data,
			updatedAt: new Date('2026-10-10T14:00:00Z')
		})
	);
	db.boostProviderService.findMany.mockImplementation(async () => state.services);
	db.boostProviderService.findUnique.mockImplementation(
		async ({ where }: { where: { provider_serviceId: { provider: string; serviceId: string } } }) =>
			state.services.find(
				(s) =>
					s.provider === where.provider_serviceId.provider &&
					s.serviceId === where.provider_serviceId.serviceId
			) ?? null
	);
	db.microcopy.findMany.mockResolvedValue([{ key: 'config.boosting.usd_ngn_rate', value: '1500' }]);
	db.boostServiceRoute.upsert.mockResolvedValue({ id: 'route' });
});
it('reads quotes from the database, not the submitted review rates', async () => {
	const v = await loadBoostPricingView(db as never);
	expect(v.quotes.row?.rateUsd).toBe(0.054);
	expect(v.sheet.rows[0].sale).toBe(500);
});
it('saving only creates an immutable draft audit snapshot', async () => {
	const input = structuredClone(state.record.metadata.sheet);
	input.rows[0].sale = 900;
	const s = await saveBoostPricingDraft(input, 'admin', db as never);
	expect(s.version).toBe(2);
	expect(state.logs[0].metadata.sheet.rows[0].sale).toBe(900);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
	expect(db.boostServiceRoute.upsert).not.toHaveBeenCalled();
	expect(db.microcopy.upsert).not.toHaveBeenCalled();
});
it('rejects a stale draft before writing anything', async () => {
	await expect(saveBoostPricingDraft(fixture, 'admin', db as never)).rejects.toMatchObject({
		status: 409
	});
	expect(db.adminAuditLog.create).not.toHaveBeenCalled();
});
it('recalculates target mode from the newly chosen supplier, ignoring forged rates', async () => {
	const input = structuredClone(state.record.metadata.sheet);
	input.rows[0].priceMode = 'target';
	input.rows[0].sale = 1;
	(input.rows[0] as BoostPricingRow & { rateUsd: number }).rateUsd = 0;
	await saveBoostPricingDraft(input, 'admin', db as never);
	expect(state.logs[0].metadata.sheet.rows[0].sale).toBe(150);
});
it('restores old values only as a new draft, never as publication', async () => {
	const restored = await restoreBoostPricingDraft('audit', 1, 'admin', db as never);
	expect(restored.version).toBe(2);
	expect(state.logs[0].action).toBe('boosting_pricing_restored');
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('blocks publication when source configuration has changed', async () => {
	state.offers[0].updatedAt = new Date('2026-10-10T13:00:00Z');
	await expect(publishBoostPricingSheet(1, 'admin', db as never)).rejects.toMatchObject({
		status: 409
	});
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('blocks wrong-platform, live-like and subscription services', async () => {
	const original = structuredClone(state.services[0]);
	for (const change of [
		{ platforms: ['instagram'] },
		{ name: 'TikTok Live Likes', outcomes: ['live_likes'] },
		{ providerType: 'Subscriptions' }
	]) {
		state.services[0] = { ...original, ...change };
		await expect(publishBoostPricingSheet(1, 'admin', db as never)).rejects.toThrow();
	}
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('blocks missing quotes, stale costs, below-cost prices and invalid ranges', async () => {
	const original = structuredClone(state.services[0]);
	for (const change of [
		{ ratePerThousand: null },
		{ lastSeenAt: new Date(0) },
		{ ratePerThousand: 10 },
		{ minQuantity: 500 }
	]) {
		state.services[0] = { ...original, ...change };
		await expect(publishBoostPricingSheet(1, 'admin', db as never)).rejects.toThrow();
	}
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('preserves old approved routes and their refill evidence for existing purchases', async () => {
	state.offers[0].routes = [
		{
			id: 'route',
			providerServiceId: quoted.providerServiceId,
			equivalenceApproved: true,
			verifiedSignals: ['quality_verified'],
			verifiedRefillDays: 30,
			audienceTags: ['general', 'tested']
		},
		{ id: 'old-route', providerServiceId: 'old-service', state: 'enabled' }
	] as unknown as TestOffer['routes'];
	state.offers[0].lockedRouteId = 'route';
	await publishBoostPricingSheet(1, 'admin', db as never);
	expect(db.boostServiceRoute.updateMany).not.toHaveBeenCalled();
	expect(db.boostServiceRoute.upsert.mock.calls[0][0].update).toMatchObject({
		verifiedSignals: ['quality_verified'],
		verifiedRefillDays: 30,
		audienceTags: ['general', 'tested']
	});
	expect(db.boostCustomerOffer.update.mock.calls[0][0].data.refillDays).toBe(30);
});
it('acknowledges setup revisions without changing prices or publishing', async () => {
	state.offers[0].updatedAt = new Date('2026-10-10T15:00:00Z');
	expect((await loadBoostPricingView(db as never)).changedRows).toEqual(['row']);
	const draft = await reconcileBoostPricingDraft(1, 'admin', db as never);
	expect(draft.rows[0].sourceUpdatedAt).toBe('2026-10-10T15:00:00.000Z');
	expect(draft.rows[0].sale).toBe(500);
	expect(draft.version).toBe(2);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
	expect(db.boostServiceRoute.upsert).not.toHaveBeenCalled();
});
it('returns a safe validation error for malformed drafts', async () => {
	await expect(saveBoostPricingDraft({}, 'admin', db as never)).rejects.toMatchObject({
		status: 400
	});
	expect(db.adminAuditLog.create).not.toHaveBeenCalled();
});
it('adds newly configured Advanced offers without replacing existing prices or editing the saved snapshot', async () => {
	state.offers.push({
		...state.offers[0],
		id: 'new-offer',
		qualityTier: 'premium',
		customerName: 'Premium likes',
		category: { ...state.offers[0].category, name: 'TikTok Likes' },
		stepQuantity: 100,
		minQuantity: 100,
		pricePerStepNgn: 75,
		minimumMarginPercent: 50,
		routes: [
			{
				id: 'new-route',
				state: 'enabled',
				equivalenceApproved: true,
				providerService: state.services[0]
			}
		]
	} as unknown as TestOffer);
	const view = await loadBoostPricingView(db as never);
	expect(view.sheet.rows).toHaveLength(2);
	expect(view.sheet.rows[0].sale).toBe(500);
	expect(view.sheet.rows[1]).toMatchObject({
		id: 'new-offer',
		sale: 75,
		sourceOfferId: 'new-offer',
		serviceId: 's1675',
		selected: false
	});
	expect(state.record.metadata.sheet.rows).toHaveLength(1);
	expect(db.adminAuditLog.create).not.toHaveBeenCalled();
});
it('keeps per-pack fee estimates consistent when a cheap offer has small quantity steps', async () => {
	state.record.metadata.sheet.settings = {
		...fixture.settings,
		feeConfirmed: true,
		feeFixed: 50,
		feePercent: 2
	};
	await expect(publishBoostPricingSheet(1, 'admin', db as never)).resolves.toMatchObject({
		version: 2
	});
	expect(
		db.boostCustomerOffer.update.mock.calls[0][0].data.maximumSupplierCostNgn
	).toBeGreaterThanOrEqual(8.1);
});
it('resolves a proposed row when Advanced setup is created, without duplicating or overwriting its price', async () => {
	state.record.metadata.sheet.rows[0].sourceOfferId = null;
	state.record.metadata.sheet.rows[0].sourceUpdatedAt = null;
	state.offers[0].qualityTier = 'value';
	state.offers[0].audienceTag = 'general';
	const v = await loadBoostPricingView(db as never);
	expect(v.sheet.rows).toHaveLength(1);
	expect(v.sheet.rows[0]).toMatchObject({ id: 'row', sourceOfferId: 'offer', sale: 500 });
	expect(state.record.metadata.sheet.rows[0].sourceOfferId).toBeNull();
});
it('publishes exact pack pricing without copying a different supplier refill promise', async () => {
	const result = await publishBoostPricingSheet(1, 'admin', db as never);
	expect(result.version).toBe(2);
	expect(db.boostCustomerOffer.update).toHaveBeenCalledWith(
		expect.objectContaining({
			data: expect.objectContaining({
				pricePerStepNgn: 50,
				stepQuantity: 100,
				customerName: 'TikTok Likes',
				status: 'live',
				refillDays: null,
				requiredVerifiedSignals: [],
				expectationChips: [],
				attemptCap: 2,
				recoveryModes: ['retry_definitive_failure']
			})
		})
	);
	expect(state.logs.at(-1)!.action).toBe('boosting_pricing_published');
	expect(result.rows[0].sourceUpdatedAt).toBe('2026-10-10T14:00:00.000Z');
});
it('keeps paid replacement estimates separate from the supported retry policy', async () => {
	state.record.metadata.sheet.rows[0].recoveryMode = 'fallback';
	await expect(publishBoostPricingSheet(1, 'admin', db as never)).rejects.toThrow('Advanced setup');
	expect(db.boostServiceRoute.upsert).not.toHaveBeenCalled();
});
