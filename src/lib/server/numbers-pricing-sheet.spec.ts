import { beforeEach, expect, it, vi } from 'vitest';
import type { NumbersPricingSheet } from '$lib/helpers/numbers-pricing-sheet';
vi.mock('$lib/prisma', () => ({ prisma: {} }));
vi.mock('$lib/services/phone-pricing', () => ({
	getPhonePricingConfig: async () => ({
		usdNgnRate: 1500,
		marginPercent: 100,
		minFulfillmentProfitNgn: 500
	})
}));
import {
	loadNumbersPricingView,
	saveNumbersPricingDraft,
	publishNumbersPricingSheet
} from './numbers-pricing-sheet';

let tiers: Array<{ id: string; isActive: boolean; metadata: Record<string, unknown> }>,
	logs: any[],
	checkedAt: Date;
function database() {
	const db = {
		$executeRaw: vi.fn().mockResolvedValue(1),
		$queryRaw: vi.fn().mockResolvedValue([]),
		category: {
			findMany: vi.fn(async () => structuredClone(tiers)),
			findUnique: vi.fn(async ({ where }: any) =>
				structuredClone(tiers.find((t) => t.id === where.id) ?? null)
			),
			update: vi.fn(async ({ where, data }: any) => {
				const tier = tiers.find((t) => t.id === where.id)!;
				Object.assign(tier, structuredClone(data));
				return tier;
			})
		},
		phoneSupplierCatalogScope: {
			findMany: vi.fn(async () => [
				{ provider: 'hubman', serviceId: 1, countryId: 187, refreshedAt: checkedAt }
			])
		},
		adminAuditLog: {
			findMany: vi.fn(async () => structuredClone(logs)),
			create: vi.fn(async ({ data }: any) => {
				const log = { ...data, id: `log-${logs.length}`, createdAt: new Date() };
				logs.unshift(log);
				return log;
			})
		},
		$transaction: async (fn: any) => {
			const original = structuredClone({ tiers, logs });
			try {
				return await fn(db);
			} catch (e) {
				tiers = original.tiers;
				logs = original.logs;
				throw e;
			}
		}
	};
	return db;
}
beforeEach(() => {
	logs = [];
	checkedAt = new Date();
	tiers = [
		{
			id: 'number',
			isActive: true,
			metadata: {
				delivery_mode: 'auto_sms',
				hub_service_id: 1,
				hub_country_id: 187,
				hub_service_name: 'WhatsApp',
				hub_country_name: 'United States',
				hub_expected_cost_cents: 50,
				hub_available_count: 10,
				price_locked: false,
				pricing: { currency: 'NGN', base_price: 2000 },
				untouched: 'preserve',
				auto_hidden: false
			}
		}
	];
});
async function draft(
	db: ReturnType<typeof database>,
	modify?: (sheet: NumbersPricingSheet) => void
) {
	const view = await loadNumbersPricingView(db as never);
	modify?.(view.sheet);
	return saveNumbersPricingDraft(view.sheet, 'admin', db as never);
}
it('reads cached metadata/scopes without supplier calls or writes', async () => {
	const db = database(),
		v = await loadNumbersPricingView(db as never);
	expect(v.sheet.rows).toHaveLength(1);
	expect(v.quotes.number.costCents).toBe(50);
	expect(db.category.update).not.toHaveBeenCalled();
	expect(db.adminAuditLog.create).not.toHaveBeenCalled();
});
it('saves only an audited draft, never changes live prices', async () => {
	const db = database(),
		sheet = await draft(db, (s) => {
			s.rows[0].mode = 'manual';
			s.rows[0].sale = 2500;
		});
	expect(sheet.version).toBe(1);
	expect(db.category.update).not.toHaveBeenCalled();
	expect(logs[0].action).toBe('numbers_pricing_draft_saved');
	expect(tiers[0].metadata.price_locked).toBe(false);
});
it('publishes only edited rows and preserves all supplier/stock/safeguard metadata', async () => {
	const db = database();
	tiers.push({ ...structuredClone(tiers[0]), id: 'untouched' });
	const s = await draft(db, (s) => {
		s.rows[0].mode = 'manual';
		s.rows[0].sale = 2500;
	});
	const out = await publishNumbersPricingSheet(s.version, 'admin', db as never);
	expect(db.category.update).toHaveBeenCalledTimes(1);
	expect(tiers[0].metadata).toMatchObject({
		price_locked: true,
		pricing: { base_price: 2500 },
		untouched: 'preserve',
		auto_hidden: false
	});
	expect(out.rows[0].baseline.sale).toBe(2500);
	expect(out.version).toBe(2);
	expect(logs).toHaveLength(2);
});
it('rejects stale revision saves/publications before live changes', async () => {
	const db = database(),
		view = await loadNumbersPricingView(db as never);
	await draft(db);
	await expect(saveNumbersPricingDraft(view.sheet, 'admin', db as never)).rejects.toMatchObject({
		status: 409
	});
	await expect(publishNumbersPricingSheet(0, 'admin', db as never)).rejects.toMatchObject({
		status: 409
	});
	expect(db.category.update).not.toHaveBeenCalled();
});
it('rejects a forged baseline and invalid/duplicate row data', async () => {
	const db = database(),
		v = await loadNumbersPricingView(db as never);
	v.sheet.rows[0].mode = 'manual';
	v.sheet.rows[0].baseline.signature = 'forged';
	await expect(saveNumbersPricingDraft(v.sheet, 'admin', db as never)).rejects.toMatchObject({
		status: 409
	});
	v.sheet.rows[0].sale = NaN;
	await expect(saveNumbersPricingDraft(v.sheet, 'admin', db as never)).rejects.toThrow(
		'Invalid number'
	);
	expect(logs).toHaveLength(0);
});
it('rejects loss-making, unrounded, stale or missing-cost publications atomically', async () => {
	for (const scenario of ['loss', 'rounding', 'stale', 'missing']) {
		logs = [];
		const db = database();
		tiers[0].metadata.price_locked = false;
		(tiers[0].metadata.pricing as any).base_price = 2000;
		const s = await draft(db, (s) => {
			s.rows[0].mode = 'manual';
			s.rows[0].sale = scenario === 'loss' ? 1000 : scenario === 'rounding' ? 2051 : 2500;
		});
		if (scenario === 'stale') checkedAt = new Date(Date.now() - 3600000);
		if (scenario === 'missing') tiers[0].metadata.hub_expected_cost_cents = 0;
		await expect(publishNumbersPricingSheet(s.version, 'admin', db as never)).rejects.toThrow();
		expect(db.category.update).not.toHaveBeenCalled();
		expect(logs).toHaveLength(1);
		checkedAt = new Date();
		tiers[0].metadata.hub_expected_cost_cents = 50;
	}
});
it('permits disabling an offer even when its supplier cost is missing/stale', async () => {
	const db = database();
	tiers[0].metadata.hub_expected_cost_cents = 0;
	checkedAt = new Date(0);
	const s = await draft(db, (s) => (s.rows[0].active = false));
	await publishNumbersPricingSheet(s.version, 'admin', db as never);
	expect(tiers[0].isActive).toBe(false);
	expect(tiers[0].metadata.auto_hidden).toBe(false);
});
it('permits taking an old invalid manual price offline without requiring a new price', async () => {
	const db = database();
	tiers[0].metadata.price_locked = true;
	(tiers[0].metadata.pricing as any).base_price = 1051;
	tiers[0].metadata.hub_expected_cost_cents = 0;
	checkedAt = new Date(0);
	const s = await draft(db, (s) => (s.rows[0].active = false));
	await publishNumbersPricingSheet(s.version, 'admin', db as never);
	expect(tiers[0].isActive).toBe(false);
	expect(tiers[0].metadata.pricing).toMatchObject({ base_price: 1051 });
});
it('rejects live manual edits since the draft, then permits explicit live reset/re-edit', async () => {
	const db = database();
	await draft(db, (s) => {
		s.rows[0].mode = 'manual';
		s.rows[0].sale = 2500;
	});
	(tiers[0].metadata.pricing as any).base_price = 2100;
	await expect(publishNumbersPricingSheet(1, 'admin', db as never)).rejects.toMatchObject({
		status: 409
	});
	const v = await loadNumbersPricingView(db as never);
	v.sheet.rows[0].baseline = v.quotes.number.live;
	v.sheet.rows[0].sale = 2600;
	const s = await saveNumbersPricingDraft(v.sheet, 'admin', db as never);
	await publishNumbersPricingSheet(s.version, 'admin', db as never);
	expect(tiers[0].metadata.pricing).toMatchObject({ base_price: 2600 });
});
it('unlocking Auto preserves the current price until the next normal catalogue sync', async () => {
	const db = database();
	tiers[0].metadata.price_locked = true;
	const s = await draft(db, (s) => (s.rows[0].mode = 'auto'));
	await publishNumbersPricingSheet(s.version, 'admin', db as never);
	expect(tiers[0].metadata.price_locked).toBe(false);
	expect(tiers[0].metadata.pricing).toMatchObject({ base_price: 2000 });
});
it('never clears automatic stock hiding when enabling an offer', async () => {
	const db = database();
	tiers[0].isActive = false;
	tiers[0].metadata.auto_hidden = true;
	tiers[0].metadata.auto_hide_reason = 'no_stock';
	const s = await draft(db, (s) => (s.rows[0].active = true));
	await publishNumbersPricingSheet(s.version, 'admin', db as never);
	expect(tiers[0].isActive).toBe(true);
	expect(tiers[0].metadata.auto_hidden).toBe(true);
});
