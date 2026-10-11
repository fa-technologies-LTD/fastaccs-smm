import { beforeEach, expect, it, vi } from 'vitest';
import { sheet as fixture } from '$lib/helpers/boosting-pricing-sheet-fixtures';
import type { BoostPricingSheet } from '$lib/helpers/boosting-pricing-sheet';
const store = vi.hoisted(() => ({ record: {} as any, offers: [] as any[], services: [] as any[] }));
const db = vi.hoisted(() => ({
	$executeRaw: vi.fn(),
	$queryRaw: vi.fn(),
	$transaction: vi.fn(),
	adminAuditLog: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
	boostCustomerOffer: { findMany: vi.fn(), update: vi.fn() },
	boostProviderService: { findMany: vi.fn() },
	category: { update: vi.fn(), findMany: vi.fn() },
	microcopy: { findMany: vi.fn(), upsert: vi.fn() }
}));
vi.mock('$lib/prisma', () => ({ prisma: db }));
vi.mock('$env/dynamic/private', () => ({ env: { BOOSTING_AUTOMATION_MODE: 'live' } }));
import { loadBoostControls, saveBoostControls, refreshBoostAutoPrices } from './pricing-controls';

beforeEach(() => {
	vi.clearAllMocks();
	const service = {
		id: 'service',
		provider: 'smm_raja',
		serviceId: 's1675',
		name: 'TikTok Likes',
		category: 'TikTok Likes',
		platforms: ['tiktok'],
		outcomes: ['likes'],
		providerType: 'Default',
		targetType: 'content',
		ratePerThousand: 0.054,
		minQuantity: 100,
		maxQuantity: 100000,
		lastSeenAt: new Date(),
		unavailableAt: null,
		catalogueStatus: 'ready_for_review'
	};
	store.services = [service];
	store.offers = [
		{
			id: 'offer',
			updatedAt: new Date(fixture.rows[0].sourceUpdatedAt!),
			platform: 'tiktok',
			outcome: 'likes',
			qualityTier: 'value',
			audienceTag: 'general',
			categoryId: 'category',
			category: {
				id: 'category',
				name: 'TikTok Likes',
				categoryType: 'boosting_service',
				isActive: true,
				metadata: {}
			},
			customerName: 'TikTok Likes',
			status: 'live',
			pricePerStepNgn: 50,
			priceLocked: true,
			stepQuantity: 100,
			minQuantity: 100,
			maximumSupplierCostNgn: 20,
			minimumMarginPercent: 30,
			routingPolicy: 'locked',
			lockedRouteId: 'route',
			routes: [
				{
					id: 'route',
					providerService: service,
					equivalenceApproved: true,
					state: 'enabled',
					minimumQuantity: 100,
					maximumQuantity: 100000
				}
			]
		}
	];
	store.record = {
		id: 'audit',
		actorUserId: 'owner',
		action: 'boosting_pricing_draft_saved',
		createdAt: new Date(),
		metadata: { sheet: { ...structuredClone(fixture), version: 1 } }
	};
	db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
	db.adminAuditLog.findFirst.mockImplementation(async () => store.record);
	db.adminAuditLog.findMany.mockResolvedValue([]);
	db.adminAuditLog.create.mockImplementation(async ({ data }: any) => {
		store.record = { ...data, id: 'next' };
		return store.record;
	});
	db.boostCustomerOffer.findMany.mockImplementation(async () => store.offers);
	db.boostCustomerOffer.update.mockImplementation(async ({ where, data }: any) => {
		const offer = store.offers.find((o) => o.id === where.id);
		Object.assign(offer, data, { updatedAt: new Date() });
		return offer;
	});
	db.boostProviderService.findMany.mockImplementation(async () => store.services);
	db.microcopy.findMany.mockResolvedValue([{ key: 'config.boosting.usd_ngn_rate', value: '1500' }]);
	db.category.findMany.mockResolvedValue([]);
});
const current = async () => structuredClone((await loadBoostControls(db as never)).sheet);

it('requires explicit publication confirmation before a hidden offer can become live', async () => {
	store.offers[0].status = 'reviewed';
	const next = await current();
	next.rows[0].selected = true;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'Confirm the selected offers'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0].status).toBe('live');
});
it('does not silently reopen an inactive category while editing its price', async () => {
	store.offers[0].category.isActive = false;
	const view = await loadBoostControls(db as never);
	expect(view.sheet.rows[0].selected).toBe(false);
	expect(view.liveStatuses.row).toBe('category_hidden');
	view.sheet.rows[0].sale = 900;
	await saveBoostControls(view.sheet, 'owner', db as never);
	expect(db.category.update).not.toHaveBeenCalled();
});
it('saves a hidden price draft even with unavailable unreviewed routes, without spending approval', async () => {
	store.offers[0].status = 'hidden';
	store.offers[0].routes[0].state = 'paused';
	store.offers[0].routes[0].equivalenceApproved = false;
	store.services[0].lastSeenAt = new Date('2020-01-01');
	store.services[0].unavailableAt = new Date();
	const next = await current();
	next.rows[0].sale = 900;
	await saveBoostControls(next, 'owner', db as never);
	expect(db.boostCustomerOffer.update.mock.calls[0][0].data).toEqual({
		pricePerStepNgn: 90,
		priceLocked: true
	});
	expect(store.offers[0].status).toBe('hidden');
	expect(store.offers[0].maximumSupplierCostNgn).toBe(20);
	expect(db.category.update).not.toHaveBeenCalled();
	expect((await current()).rows[0].sale).toBe(900);
	const publish = await current();
	publish.rows[0].selected = true;
	await expect(saveBoostControls(publish, 'owner', db as never, false, true)).rejects.toThrow(
		'Supplier unavailable.'
	);
});
it('does not let an unavailable hidden automatic option block saving global rules', async () => {
	store.offers[0].status = 'hidden';
	store.offers[0].priceLocked = false;
	store.services[0].unavailableAt = new Date();
	const next = await current();
	next.settings.defaultMarkup = 200;
	next.rows[0].sale = 150; // Browser preview for a hidden option, not publication.
	await saveBoostControls(next, 'owner', db as never);
	expect(store.offers[0]).toMatchObject({
		status: 'hidden',
		pricePerStepNgn: 15,
		priceLocked: false,
		maximumSupplierCostNgn: 20
	});
	expect(db.category.update).not.toHaveBeenCalled();
});
it('allows below-cost hidden drafts but rejects making them Live until their price covers costs', async () => {
	store.offers[0].status = 'hidden';
	const next = await current();
	next.rows[0].sale = 50;
	await saveBoostControls(next, 'owner', db as never);
	expect(store.offers[0].status).toBe('hidden');
	const publish = await current();
	publish.rows[0].selected = true;
	await expect(saveBoostControls(publish, 'owner', db as never, false, true)).rejects.toThrow(
		'price does not cover cost'
	);
	expect(store.offers[0].status).toBe('hidden');
});
it('never treats a live offer in an inactive category as a harmless hidden draft', async () => {
	store.offers[0].category.isActive = false;
	store.services[0].unavailableAt = new Date();
	const next = await current();
	next.rows[0].sale = 900;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'Supplier unavailable.'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('still requires hidden draft prices to fit whole-kobo quantity increments', async () => {
	store.offers[0].status = 'hidden';
	const next = await current();
	next.rows[0].sale = 50.01;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow('whole kobo');
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('lets unconfigured proposals open their existing category setup, without pretending they are live', async () => {
	store.offers = [];
	db.category.findMany.mockResolvedValue([
		{ id: 'category', metadata: { boosting_platform: 'tiktok', boosting_action_type: 'likes' } }
	]);
	const view = await loadBoostControls(db as never);
	expect(view.setup.row).toMatchObject({
		categoryId: 'category',
		reviewed: false,
		routingPolicy: 'unconfigured'
	});
	expect(view.sheet.rows[0]).toMatchObject({ sourceOfferId: null, selected: false });
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('saves unconfigured price proposals without publishing or creating an offer', async () => {
	store.offers = [];
	const next = await current();
	next.rows[0].sale = 900;
	await saveBoostControls(next, 'owner', db as never);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
	expect(store.record.metadata.sheet.rows[0]).toMatchObject({ sale: 900, selected: false });
});

it('uses live price and visibility rather than silently applying old sheet drafts', async () => {
	store.offers[0].pricePerStepNgn = 70;
	store.offers[0].status = 'hidden';
	const view = await loadBoostControls(db as never);
	expect(view.sheet.rows[0]).toMatchObject({ sale: 700, selected: false, priceMode: 'manual' });
	expect(view.archivedDraft).toBe(true);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('saves a price and audit in one transaction without changing supplier routes or promises', async () => {
	const next = await current();
	next.rows[0].sale = 900;
	expect(await saveBoostControls(next, 'owner', db as never)).toEqual({ applied: 1 });
	const patch = db.boostCustomerOffer.update.mock.calls[0][0].data;
	expect(patch.pricePerStepNgn).toBe(90);
	expect(patch.maximumSupplierCostNgn).toBe(20);
	for (const key of [
		'routingPolicy',
		'lockedRouteId',
		'preferredRouteId',
		'refillDays',
		'requiredVerifiedSignals',
		'attemptCap'
	])
		expect(patch).not.toHaveProperty(key);
	expect(db.$transaction).toHaveBeenCalledOnce();
	expect(db.adminAuditLog.create.mock.calls[0][0].data.action).toBe('boosting_controls_saved');
});
it('rejects stale page versions before any pricing writes', async () => {
	const next = await current();
	next.version = 0;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toMatchObject({
		status: 409
	});
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('rejects a supplier edit that happened after the page loaded', async () => {
	const next = await current();
	store.offers[0].updatedAt = new Date('2026-10-11T15:00:00Z');
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toMatchObject({
		status: 409
	});
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('rejects a concurrent exchange-rate change before overwriting its settings', async () => {
	const next = await current();
	db.microcopy.findMany.mockResolvedValue([{ key: 'config.boosting.usd_ngn_rate', value: '2000' }]);
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toMatchObject({
		status: 409
	});
	expect(db.microcopy.upsert).not.toHaveBeenCalled();
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('does not allow per-offer overrides to lower the global retained-profit floor', async () => {
	const next = await current();
	next.settings.hardProfitNgn = 500;
	next.rows[0].hardProfitNgn = 0;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'minimum retained profit'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('does not accept a supplier-code change through the pricing endpoint', async () => {
	const next = await current();
	next.rows[0].serviceId = 's9999';
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow('supplier setup');
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('can take a service offline during a supplier outage', async () => {
	const next = await current();
	next.rows[0].selected = false;
	store.services[0].unavailableAt = new Date();
	await saveBoostControls(next, 'owner', db as never);
	expect(db.boostCustomerOffer.update.mock.calls[0][0].data).toEqual({ status: 'hidden' });
});
it('does not enable unreviewed routes even with a safe price', async () => {
	store.offers[0].status = 'hidden';
	store.offers[0].routes[0].equivalenceApproved = false;
	const next = await current();
	next.rows[0].selected = true;
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'review supplier routes'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('recalculates an unlocked price from server costs, ignoring a fabricated client price', async () => {
	const next = await current();
	next.rows[0].priceMode = 'target';
	next.rows[0].sale = 1;
	await saveBoostControls(next, 'owner', db as never);
	expect(db.boostCustomerOffer.update.mock.calls[0][0].data).toMatchObject({
		pricePerStepNgn: 15,
		priceLocked: false
	});
});
it('keeps manual prices fixed when global markup changes', async () => {
	const next = await current();
	next.settings.defaultMarkup = 200;
	await saveBoostControls(next, 'owner', db as never);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
	expect(store.offers[0].pricePerStepNgn).toBe(50);
});
it('does not let an unrelated stale locked offer block a default-markup edit', async () => {
	store.services[0].lastSeenAt = new Date('2020-01-01');
	const next = await current();
	next.settings.defaultMarkup = 200;
	await saveBoostControls(next, 'owner', db as never);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
	expect(db.microcopy.upsert).toHaveBeenCalled();
});
it('still requires fresh costs when an exchange-rate change affects a locked offer', async () => {
	store.services[0].lastSeenAt = new Date('2020-01-01');
	const next = await current();
	next.settings.fx = 2000;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'click Refresh costs'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
	expect(db.microcopy.upsert).not.toHaveBeenCalled();
});
it('still requires fresh costs for an automatic price using the changed default margin', async () => {
	store.services[0].lastSeenAt = new Date('2020-01-01');
	store.offers[0].priceLocked = false;
	const next = await current();
	next.rows[0].useDefaultMarkup = true;
	next.settings.defaultMarkup = 200;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'click Refresh costs'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('identifies incompatible supplier setup instead of suggesting a pointless refresh', async () => {
	store.services[0].platforms = ['threads'];
	const next = await current();
	next.rows[0].sale = 900;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'Different platform.'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('rejects a manual price that cannot cover the retained-profit floor', async () => {
	const next = await current();
	next.settings.hardProfitNgn = 500;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'minimum retained profit'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
	expect(db.microcopy.upsert).not.toHaveBeenCalled();
});
it('does not raise an approved supplier cost limit when prices increase', async () => {
	store.offers[0].maximumSupplierCostNgn = 5;
	const next = await current();
	next.rows[0].sale = 5000;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'reviewed cost limit'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('leaves an unchanged offer alone even when its quote is stale', async () => {
	store.services[0].lastSeenAt = new Date('2020-01-01');
	await saveBoostControls(await current(), 'owner', db as never);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('does not opt legacy unlocked offers into refresh until new controls have been saved', async () => {
	store.offers[0].priceLocked = false;
	expect(await refreshBoostAutoPrices(db as never)).toEqual({ applied: 0 });
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('automatically refreshes unlocked live offers after explicit controls opt-in', async () => {
	store.record.action = 'boosting_controls_saved';
	store.record.metadata.sheet.settings.defaultMarkup = 40;
	store.offers[0].priceLocked = false;
	expect(await refreshBoostAutoPrices(db as never)).toEqual({ applied: 1 });
	expect(db.boostCustomerOffer.update.mock.calls[0][0].data.pricePerStepNgn).toBe(15);
});
it('never refreshes locked prices or makes hidden offers live', async () => {
	store.record.action = 'boosting_controls_saved';
	store.record.metadata.sheet.settings.defaultMarkup = 40;
	expect(await refreshBoostAutoPrices(db as never)).toEqual({ applied: 0 });
	store.offers[0].priceLocked = false;
	store.offers[0].status = 'hidden';
	expect(await refreshBoostAutoPrices(db as never)).toEqual({ applied: 0 });
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('uses the highest approved cost when quoting an automatic shortlist', async () => {
	store.offers[0].routingPolicy = 'automatic';
	store.offers[0].routes.push({
		...store.offers[0].routes[0],
		id: 'second',
		providerService: { ...store.services[0], id: 'costlier', ratePerThousand: 0.1 }
	});
	const view = await loadBoostControls(db as never);
	expect(view.quotes.row!.rateUsd).toBe(0.1);
	expect(view.setup.row.routingPolicy).toBe('automatic');
});
