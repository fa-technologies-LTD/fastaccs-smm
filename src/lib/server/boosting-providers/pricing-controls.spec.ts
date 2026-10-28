import { beforeEach, expect, it, vi } from 'vitest';
import { sheet as fixture } from '$lib/helpers/boosting-pricing-sheet-fixtures';
import type { BoostPricingSheet } from '$lib/helpers/boosting-pricing-sheet';
import { saleOfferFixture } from '../boosting-sale-readiness-fixtures';
const store = vi.hoisted(() => ({ record: {} as any, offers: [] as any[], services: [] as any[] }));
const db = vi.hoisted(() => ({
	$executeRaw: vi.fn(),
	$queryRaw: vi.fn(),
	$transaction: vi.fn(),
	adminAuditLog: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
	boostCustomerOffer: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
	boostProviderService: { findMany: vi.fn(), findUnique: vi.fn() },
	boostServiceRoute: { upsert: vi.fn(), updateMany: vi.fn() },
	category: { update: vi.fn(), findMany: vi.fn() },
	microcopy: { findMany: vi.fn(), upsert: vi.fn() }
}));
vi.mock('$lib/prisma', () => ({ prisma: db }));
vi.mock('$env/dynamic/private', () => ({ env: { BOOSTING_AUTOMATION_MODE: 'live' } }));
import { loadBoostControls, saveBoostControls, refreshBoostAutoPrices } from './pricing-controls';
import { supplierChoiceRevision } from './supplier-choice';
import { inspectBoostSale } from '$lib/server/boosting-sale-readiness';

it('price-only saves cannot publish even with forged selections and confirmation', async () => {
	store.offers[0].status = 'hidden';
	const next = structuredClone((await loadBoostControls(db as never)).sheet);
	next.rows[0].selected = true;
	next.rows[0].sale = 900;
	await saveBoostControls(next, 'owner', db as never, false, true, true);
	expect(store.offers[0].status).toBe('hidden');
	expect(store.offers[0].pricePerStepNgn).toBe(90);
});

beforeEach(() => {
	vi.clearAllMocks();
	const service = {
		...saleOfferFixture().routes[0].providerService,
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
			...saleOfferFixture(),
			id: 'offer',
			updatedAt: new Date(fixture.rows[0].sourceUpdatedAt!),
			platform: 'tiktok',
			outcome: 'likes',
			targetType: 'content',
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
			maxQuantity: null,
			shortPromise: 'Original description',
			normalCostTargetNgn: 8.1,
			maximumSupplierCostNgn: 20,
			minimumMarginPercent: 30,
			routingPolicy: 'locked',
			lockedRouteId: 'route',
			routes: [
				{
					...saleOfferFixture().routes[0],
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
	db.boostCustomerOffer.create.mockImplementation(async ({ data }: any) => {
		const offer = {
			...saleOfferFixture(),
			...data,
			id: 'created-offer',
			updatedAt: new Date(),
			category: {
				id: data.categoryId,
				name: 'TikTok Likes',
				isActive: true,
				metadata: {},
				categoryType: 'boosting_service'
			},
			routes: []
		};
		store.offers.push(offer);
		return offer;
	});
	db.boostProviderService.findMany.mockImplementation(async () => store.services);
	db.boostProviderService.findUnique.mockImplementation(
		async ({ where }: any) => store.services.find((s) => s.id === where.id) ?? null
	);
	db.boostServiceRoute.updateMany.mockImplementation(async ({ where, data }: any) => {
		for (const offer of store.offers)
			for (const route of offer.routes)
				if (where.id.in.includes(route.id)) Object.assign(route, data);
		return { count: where.id.in.length };
	});
	db.boostServiceRoute.upsert.mockImplementation(async ({ where, create, update }: any) => {
		const offer = store.offers.find((o) => o.id === where.offerId_providerServiceId.offerId);
		let route = offer.routes.find(
			(r: any) => r.providerService.id === where.offerId_providerServiceId.providerServiceId
		);
		if (route) Object.assign(route, update);
		else {
			route = {
				...saleOfferFixture().routes[0],
				...create,
				id: 'new-route',
				providerService: store.services.find((s) => s.id === create.providerServiceId)
			};
			offer.routes.push(route);
		}
		return route;
	});
	db.microcopy.findMany.mockResolvedValue([{ key: 'config.boosting.usd_ngn_rate', value: '1500' }]);
	db.category.findMany.mockResolvedValue([]);
});
const current = async () => structuredClone((await loadBoostControls(db as never)).sheet);

it.each([
	[3484.44, 6000],
	[3745.25, 7500]
])(
	'saves an owner-reviewed price cut with fractional cost %s, and the saved offer remains purchasable',
	async (cost, price) => {
		store.services[0].ratePerThousand = cost / 1500;
		store.services[0].minQuantity = 10;
		Object.assign(store.offers[0], {
			minQuantity: 10,
			stepQuantity: 10,
			pricePerStepNgn: 270,
			minimumMarginPercent: 350,
			maximumSupplierCostNgn: 100
		});
		store.offers[0].routes[0].minimumQuantity = 10;
		const next = await current();
		next.rows[0].sale = price;
		await saveBoostControls(next, 'owner', db as never, false, true);
		expect(Number(store.offers[0].normalCostTargetNgn)).toBe(Math.ceil(cost - 1e-7) / 100);
		expect(inspectBoostSale(store.offers[0], 1500)).toMatchObject({ available: true, reasons: [] });
		expect((await current()).rows[0].sale).toBe(price);
	}
);

it('accepts the owner-confirmed manual price below profit preferences and reviews only the displayed current cost', async () => {
	store.offers[0].maximumSupplierCostNgn = 5;
	const next = await current();
	next.settings.hardProfitNgn = 1000;
	next.rows[0].sale = 600;
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0].maximumSupplierCostNgn).toBe(8.1);
	expect(store.offers[0].pricePerStepNgn).toBe(60);
	expect(store.record.metadata.sheet.settings.hardProfitNgn).toBe(1000);
	expect(inspectBoostSale(store.offers[0], 1500).available).toBe(true);
});

it('queues explicit review without a price edit, but cannot repeat that acceptance automatically', async () => {
	store.offers[0].maximumSupplierCostNgn = 5;
	const next = await current();
	next.rows[0].reviewRequested = true;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'confirm current prices'
	);
	await expect(saveBoostControls(next, 'owner', db as never, true, true)).rejects.toThrow(
		'confirm current prices'
	);
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0].maximumSupplierCostNgn).toBe(8.1);
	expect((await current()).rows[0].reviewRequested).toBeUndefined();
	expect(store.record.metadata.sheet.rows[0].reviewRequested).toBeUndefined();
});

it('keeps custom non-multiple quantity grids purchasable after approving a fractional quote', async () => {
	store.services[0].ratePerThousand = 81.1 / 1500;
	Object.assign(store.offers[0], {
		maximumSupplierCostNgn: 5,
		stepQuantity: 50,
		pricePerStepNgn: 25
	});
	const next = await current();
	next.rows[0].reviewRequested = true;
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0].maximumSupplierCostNgn).toBe(8.12);
	for (const quantity of [100, 150, 200, 250, 1000])
		expect(inspectBoostSale(store.offers[0], 1500, quantity).available).toBe(true);
	expect(store.record.metadata.ownerReviews[0].quantityRoundingAllowanceNgn).toBe(0.01);
});

it('floors the accepted margin at database precision so reloading cannot make the saved offer unavailable', async () => {
	store.services[0].ratePerThousand = 97.4 / 1500;
	store.offers[0].minimumMarginPercent = 600;
	const next = await current();
	next.rows[0].sale = 600;
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0].minimumMarginPercent).toBe(516.01);
	expect(inspectBoostSale(store.offers[0], 1500).available).toBe(true);
});

it('does not approve a current quote above the supported persisted spending budget', async () => {
	store.services[0].ratePerThousand = 1000 / 1500;
	store.services[0].maxQuantity = 100000000;
	store.offers[0].routes[0].maximumQuantity = 100000000;
	store.offers[0].minQuantity = 100000000;
	const next = await current();
	next.rows[0].sale = 10000000;
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'choose a cheaper supplier'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});

it('removes unverified quality requirements only for new owner-reviewed purchases, without fabricating route evidence', async () => {
	store.offers[0].requiredVerifiedSignals = ['verified-existing', 'unverified-quality'];
	store.offers[0].routes[0].verifiedSignals = ['verified-existing'];
	const oldPurchaseRequirements = structuredClone(store.offers[0].requiredVerifiedSignals);
	const next = await current();
	next.rows[0].sale = 900;
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0].requiredVerifiedSignals).toEqual(['verified-existing']);
	expect(store.offers[0].routes[0].verifiedSignals).toEqual(['verified-existing']);
	expect(oldPurchaseRequirements).toEqual(['verified-existing', 'unverified-quality']);
	expect(db.boostServiceRoute.updateMany).not.toHaveBeenCalled();
	expect(inspectBoostSale(store.offers[0], 1500).available).toBe(true);
});

it.each(['loss', 'unavailable', 'refill'])(
	'does not let an owner confirmation bypass %s safeguards',
	async (issue) => {
		if (issue === 'unavailable') store.services[0].unavailableAt = new Date();
		if (issue === 'refill') store.offers[0].refillDays = 30;
		const next = await current();
		next.rows[0].sale = issue === 'loss' ? 50 : 900;
		await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow();
		expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
	}
);

it('preserves fractional legacy pack rates on load and Save instead of rounding the actual selling rate', async () => {
	store.record.metadata.sheet.rows[0].units = 10;
	store.offers[0].stepQuantity = 500;
	store.offers[0].minQuantity = 500;
	store.offers[0].pricePerStepNgn = 7500.01;
	store.offers[0].normalCostTargetNgn = 40.5;
	store.offers[0].maximumSupplierCostNgn = 100;
	const next = await current();
	expect(next.rows[0]).toMatchObject({
		units: 10,
		sale: 150.0002,
		increment: 500,
		startingQuantity: 500
	});
	next.rows[0].shortPromise = 'Updated description';
	await saveBoostControls(next, 'owner', db as never, false);
	expect(store.offers[0].pricePerStepNgn).toBe(7500.01);
	expect((await current()).rows[0].sale).toBe(150.0002);
});

it('does not let inherited valid large supplier maxima block unrelated hidden price edits', async () => {
	store.offers[0].status = 'hidden';
	store.offers[0].maxQuantity = 2147483647;
	store.services[0].maxQuantity = 2147483647;
	const next = await current();
	next.rows[0].sale = 900;
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0].status).toBe('hidden');
	expect(store.offers[0].maxQuantity).toBe(2147483647);
	expect((await current()).rows[0].sale).toBe(900);
});

it('saves offer settings, price and Live selection together without modifying suppliers or refill promises', async () => {
	store.offers[0].status = 'hidden';
	const next = await current();
	Object.assign(next.rows[0], {
		startingQuantity: 200,
		increment: 200,
		maximumQuantity: 10000,
		option: 'Everyday likes',
		shortPromise: 'A straightforward option.',
		sale: 900,
		selected: true
	});
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0]).toMatchObject({
		minQuantity: 200,
		stepQuantity: 200,
		maxQuantity: 10000,
		pricePerStepNgn: 180,
		priceLocked: true,
		customerName: 'Everyday likes',
		shortPromise: 'A straightforward option.',
		maximumSupplierCostNgn: 40,
		status: 'live'
	});
	const reloaded = await current();
	expect(reloaded.rows[0]).toMatchObject({
		startingQuantity: 200,
		increment: 200,
		maximumQuantity: 10000,
		option: 'Everyday likes',
		shortPromise: 'A straightforward option.',
		sale: 900
	});
	const patch = db.boostCustomerOffer.update.mock.calls[0][0].data;
	for (const key of [
		'routingPolicy',
		'lockedRouteId',
		'preferredRouteId',
		'requiredVerifiedSignals',
		'refillDays',
		'attemptCap'
	])
		expect(patch).not.toHaveProperty(key);
	expect(
		store.offers[0].quantityPresets.every(
			(n: number) => n >= 200 && n <= 10000 && (n - 200) % 200 === 0
		)
	).toBe(true);
});

it('saves hidden offer edits during an outage while preserving unit cost ceilings', async () => {
	store.offers[0].status = 'hidden';
	store.services[0].unavailableAt = new Date();
	const next = await current();
	Object.assign(next.rows[0], {
		startingQuantity: 200,
		increment: 200,
		maximumQuantity: 10000,
		option: 'Draft option'
	});
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0]).toMatchObject({
		status: 'hidden',
		minQuantity: 200,
		stepQuantity: 200,
		maxQuantity: 10000,
		pricePerStepNgn: 100,
		maximumSupplierCostNgn: 40,
		normalCostTargetNgn: 16.2
	});
});

it.each([0, -10, 1.5, 100000001])('rejects invalid minimum %s before writing', async (minimum) => {
	const next = await current();
	next.rows[0].startingQuantity = minimum;
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'whole quantities'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});

it('rejects maximum below minimum and excessive text rather than silently clamping settings', async () => {
	const next = await current();
	next.rows[0].maximumQuantity = 50;
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'Maximum quantity'
	);
	next.rows[0].maximumQuantity = 10000;
	next.rows[0].shortPromise = 'x'.repeat(121);
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'120 characters'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});

it('does not allow quantity changes to bypass supplier minimum or customer checkout minimum', async () => {
	const next = await current();
	next.rows[0].startingQuantity = 10;
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'supplier minimum'
	);
	next.rows[0].startingQuantity = 100;
	next.rows[0].maximumQuantity = 500;
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'₦500 checkout minimum'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
});

it('clears an optional maximum and restores the service name without clearing other settings', async () => {
	store.offers[0].maxQuantity = 10000;
	store.offers[0].customerName = 'Old option';
	const next = await current();
	next.rows[0].maximumQuantity = null;
	next.rows[0].option = '';
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0]).toMatchObject({
		maxQuantity: null,
		customerName: 'TikTok Likes',
		shortPromise: 'Original description'
	});
});

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

it('saves a confirmed price edit and unpublishing together, even without a supplier quote', async () => {
	const next = await current();
	next.rows[0].selected = false;
	next.rows[0].sale = 950;
	store.services[0].unavailableAt = new Date();
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0]).toMatchObject({
		status: 'hidden',
		pricePerStepNgn: 95,
		priceLocked: true
	});
	expect(store.record.metadata.sheet.rows[0]).toMatchObject({ sale: 950, selected: false });
});

it('does not replace a confirmed price with a newly calculated one during manual Save', async () => {
	store.offers[0].priceLocked = false;
	const next = await current();
	next.rows[0].sale = 950;
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'suggested price changed'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
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
	expect(db.boostCustomerOffer.update.mock.calls[0][0].data).toEqual({
		status: 'hidden',
		pricePerStepNgn: 50,
		priceLocked: true
	});
});
it('approves the displayed preload only through the owner-confirmed Live Save', async () => {
	store.offers[0].status = 'hidden';
	store.offers[0].routes[0].equivalenceApproved = false;
	const next = await current();
	next.rows[0].selected = true;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow('Confirm');
	expect(db.boostServiceRoute.updateMany).not.toHaveBeenCalled();
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0].status).toBe('live');
	expect(store.offers[0].routes[0]).toMatchObject({
		state: 'enabled',
		equivalenceApproved: true,
		reviewedByUserId: 'owner'
	});
});
it('rejects a fabricated unlocked price rather than silently saving a different price', async () => {
	const next = await current();
	next.rows[0].priceMode = 'target';
	next.rows[0].sale = 1;
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow(
		'suggested price changed'
	);
	expect(db.boostCustomerOffer.update).not.toHaveBeenCalled();
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

it('loads the current locked supplier instead of the historical sheet service after a manual change', async () => {
	const replacement = {
		...store.services[0],
		id: 'replacement',
		serviceId: 'manual-new',
		ratePerThousand: 0.075
	};
	store.offers[0].routes.push({
		...store.offers[0].routes[0],
		id: 'replacement-route',
		providerService: replacement
	});
	store.offers[0].lockedRouteId = 'replacement-route';
	const view = await loadBoostControls(db as never);
	expect(view.sheet.rows[0].serviceId).toBe('manual-new');
	expect(view.quotes.row).toMatchObject({ providerServiceId: 'replacement', rateUsd: 0.075 });
	expect(store.record.metadata.sheet.rows[0].serviceId).toBe('s1675');
});

it('displays the newly saved review-only service, never a retired service, without approving publication', async () => {
	store.offers[0].routingPolicy = 'automatic';
	store.offers[0].status = 'reviewed';
	store.offers[0].lockedRouteId = null;
	store.offers[0].routes[0].state = 'paused';
	store.offers[0].routes.push({
		...store.offers[0].routes[0],
		id: 'new-shadow',
		state: 'shadow',
		providerService: {
			...store.services[0],
			id: 'new-service',
			serviceId: 'saved-new',
			ratePerThousand: 0.075
		}
	});
	const view = await loadBoostControls(db as never);
	expect(view.sheet.rows[0]).toMatchObject({ serviceId: 'saved-new', selected: false });
	expect(view.quotes.row).toMatchObject({ providerServiceId: 'new-service', rateUsd: 0.075 });
	expect(view.setup.row.reviewed).toBe(false);
	view.sheet.rows[0].selected = true;
	await saveBoostControls(view.sheet, 'owner', db as never, false, true);
	expect(store.offers[0].routes[0].state).toBe('paused');
	expect(store.offers[0].routes[1]).toMatchObject({ state: 'enabled', equivalenceApproved: true });
	expect(store.offers[0].status).toBe('live');
});

it('pins an exact owner choice without changing other mappings, evidence or retry policy', async () => {
	const replacement = {
		...store.services[0],
		id: '11111111-1111-4111-8111-111111111111',
		serviceId: 's999',
		ratePerThousand: 0.08
	};
	store.services.push(replacement);
	const next = await current();
	Object.assign(next.rows[0], {
		supplierChoiceId: replacement.id,
		supplierChoiceRevision: supplierChoiceRevision(replacement),
		sale: 1000
	});
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0]).toMatchObject({
		routingPolicy: 'locked',
		lockedRouteId: 'new-route',
		preferredRouteId: null,
		status: 'live'
	});
	expect(store.offers[0].routes[0]).toMatchObject({ state: 'enabled', id: 'route' });
	expect(store.offers[0].routes[1]).toMatchObject({
		verifiedSignals: [],
		reviewedByUserId: 'owner'
	});
	const reloaded = await loadBoostControls(db as never);
	expect(reloaded.sheet.rows[0]).toMatchObject({
		serviceId: 's999',
		sale: 1000,
		priceMode: 'manual'
	});
	expect(reloaded.sheet.rows[0].supplierChoiceId).toBeUndefined();
	expect(store.record.metadata.sheet.rows[0]).toMatchObject({
		provider: 'smm_raja',
		serviceId: 's999'
	});
});

it('does not approve a service through a hidden price-only save or automated repricing', async () => {
	const next = await current();
	next.rows[0].supplierChoiceId = '11111111-1111-4111-8111-111111111111';
	next.rows[0].supplierChoiceRevision = 'a'.repeat(64);
	await expect(saveBoostControls(next, 'owner', db as never, true, true)).rejects.toThrow(
		'confirmed owner Save'
	);
	await expect(saveBoostControls(next, 'owner', db as never, false, true, true)).rejects.toThrow(
		'confirmed owner Save'
	);
	await expect(saveBoostControls(next, 'owner', db as never)).rejects.toThrow('confirm supplier');
	expect(db.boostServiceRoute.upsert).not.toHaveBeenCalled();
});

it('creates a missing customer offer and exact mapping through the same confirmed Save', async () => {
	store.offers = [];
	db.category.findMany.mockResolvedValue([
		{ id: 'category', metadata: { boosting_platform: 'tiktok', boosting_action_type: 'likes' } }
	]);
	store.services[0].id = '11111111-1111-4111-8111-111111111111';
	const next = await current();
	expect(next.rows[0].sourceOfferId).toBeNull();
	Object.assign(next.rows[0], {
		supplierChoiceId: store.services[0].id,
		supplierChoiceRevision: supplierChoiceRevision(store.services[0]),
		selected: true,
		startingQuantity: 200,
		increment: 200,
		sale: 1000
	});
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers).toHaveLength(1);
	expect(store.offers[0]).toMatchObject({
		status: 'live',
		routingPolicy: 'locked',
		lockedRouteId: 'new-route',
		minQuantity: 200,
		stepQuantity: 200,
		pricePerStepNgn: 200,
		requiredVerifiedSignals: [],
		refillDays: null,
		attemptCap: 1
	});
	expect((await current()).rows[0]).toMatchObject({
		sourceOfferId: 'created-offer',
		serviceId: 's1675',
		selected: true
	});
});

it('keeps an explicitly chosen supplier offline when Live is unticked', async () => {
	store.offers[0].status = 'hidden';
	store.services[0].id = '11111111-1111-4111-8111-111111111111';
	const next = await current();
	Object.assign(next.rows[0], {
		supplierChoiceId: store.services[0].id,
		supplierChoiceRevision: supplierChoiceRevision(store.services[0]),
		sale: 900
	});
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(store.offers[0].status).toBe('hidden');
	expect(store.offers[0].pricePerStepNgn).toBe(90);
	expect(store.offers[0].routes[0]).toMatchObject({ state: 'enabled', equivalenceApproved: true });
});

it('reviews fractional supplier costs at a newly lowered minimum without losing a kobo to double rounding', async () => {
	store.offers[0].status = 'hidden';
	const service = {
		...store.services[0],
		id: '11111111-1111-4111-8111-111111111111',
		minQuantity: 10,
		ratePerThousand: 2.5014
	};
	store.services.push(service);
	const next = await current();
	Object.assign(next.rows[0], {
		supplierChoiceId: service.id,
		supplierChoiceRevision: supplierChoiceRevision(service),
		selected: true,
		startingQuantity: 10,
		increment: 10,
		sale: 10000
	});
	await saveBoostControls(next, 'owner', db as never, false, true);
	expect(Number(store.offers[0].maximumSupplierCostNgn)).toBe(37.53);
	expect(store.offers[0].status).toBe('live');
});

it('rejects a changed supplier quote and stale mapping approval before accepting the selection', async () => {
	const replacement = { ...store.services[0], id: '11111111-1111-4111-8111-111111111111' };
	store.services.push(replacement);
	const next = await current();
	Object.assign(next.rows[0], {
		supplierChoiceId: replacement.id,
		supplierChoiceRevision: supplierChoiceRevision(replacement)
	});
	replacement.ratePerThousand = 99;
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'selected supplier details changed'
	);
	delete next.rows[0].supplierChoiceId;
	store.offers[0].routes[0].state = 'paused';
	await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow(
		'supplier setup or cost changed'
	);
	expect(db.boostServiceRoute.upsert).not.toHaveBeenCalled();
});

it.each(['platform', 'inputs', 'unavailable', 'stale'])(
	'refuses an incompatible %s exact choice rather than bypassing safety checks',
	async (kind) => {
		const service = { ...store.services[0], id: '11111111-1111-4111-8111-111111111111' };
		if (kind === 'platform') service.platforms = ['facebook'];
		if (kind === 'inputs') service.providerType = 'Subscriptions';
		if (kind === 'unavailable') service.unavailableAt = new Date();
		if (kind === 'stale') service.lastSeenAt = new Date(Date.now() - 400 * 60000);
		store.services.push(service);
		const next = await current();
		Object.assign(next.rows[0], {
			supplierChoiceId: service.id,
			supplierChoiceRevision: supplierChoiceRevision(service)
		});
		await expect(saveBoostControls(next, 'owner', db as never, false, true)).rejects.toThrow();
		expect(db.boostServiceRoute.upsert).not.toHaveBeenCalled();
	}
);

it('does not present an arbitrary paused service as the current automatic configuration', async () => {
	store.offers[0].routingPolicy = 'automatic';
	store.offers[0].routes[0].state = 'paused';
	const view = await loadBoostControls(db as never);
	expect(view.quotes.row).toBeNull();
	expect(view.sheet.rows[0].serviceId).toBe('');
	expect(view.setup.row.reviewed).toBe(false);
});
it('shares a dollar rate a person changes and confirms with Numbers', async () => {
	const next = await current();
	next.settings.fx = Number(next.settings.fx) + 100;
	await saveBoostControls(next, 'owner', db as never, false, true);
	const numbersWrites = db.microcopy.upsert.mock.calls.filter(
		(call: unknown[]) =>
			(call[0] as { where: { key: string } }).where.key === 'config.phone.usd_ngn_rate'
	);
	expect(numbersWrites).toHaveLength(1);
	expect((numbersWrites[0][0] as { update: { value: string } }).update.value).toBe(
		String(next.settings.fx)
	);
});
it('leaves the Numbers rate alone when the dollar rate did not change', async () => {
	const next = await current();
	next.settings.defaultMarkup = 200;
	await saveBoostControls(next, 'owner', db as never);
	expect(
		db.microcopy.upsert.mock.calls.some(
			(call: unknown[]) =>
				(call[0] as { where: { key: string } }).where.key === 'config.phone.usd_ngn_rate'
		)
	).toBe(false);
});
