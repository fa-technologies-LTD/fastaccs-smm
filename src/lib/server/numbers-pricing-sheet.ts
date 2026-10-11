import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { getPhonePricingConfig } from '$lib/services/phone-pricing';
import { getPhoneTierConfig } from '$lib/helpers/phone-tier-config';
import {
	numbersRowChanged,
	numbersEconomics,
	type NumbersPricingView,
	type NumbersPricingSheet,
	type NumbersPricingQuote
} from '$lib/helpers/numbers-pricing-sheet';

type Database = PrismaClient | Prisma.TransactionClient;
const RESOURCE = 'numbers_pricing_sheet';
const ACTIONS = ['numbers_pricing_draft_saved', 'numbers_pricing_published'];
export class NumbersPricingError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
	}
}
function object(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
function savedSheet(value: unknown): NumbersPricingSheet | null {
	const sheet = object(value).sheet as NumbersPricingSheet | undefined;
	return sheet && Number.isInteger(sheet.version) && Array.isArray(sheet.rows) ? sheet : null;
}
async function lock(tx: Database) {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fastaccs:numbers-pricing-sheet'))`;
}
function checkVersion(input: unknown, version: number) {
	if (input !== version)
		throw new NumbersPricingError('A newer draft was saved. Reload before continuing.', 409);
}
export async function loadNumbersPricingView(
	database: Database = prisma
): Promise<NumbersPricingView> {
	const [pricing, tiers, scopes, history] = await Promise.all([
		getPhonePricingConfig(database),
		database.category.findMany({
			where: {
				parent: { categoryType: 'numbers_platform' },
				metadata: { path: ['delivery_mode'], equals: 'auto_sms' }
			},
			select: { id: true, isActive: true, metadata: true },
			orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
		}),
		database.phoneSupplierCatalogScope.findMany({
			select: { provider: true, serviceId: true, countryId: true, refreshedAt: true }
		}),
		database.adminAuditLog.findMany({
			where: { resourceType: RESOURCE, action: { in: ACTIONS } },
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: 12
		})
	]);
	const stored = savedSheet(history[0]?.metadata),
		sheet: NumbersPricingSheet = structuredClone(stored ?? { version: 0, rows: [] });
	const quotes: Record<string, NumbersPricingQuote> = {};
	for (const tier of tiers) {
		const cfg = getPhoneTierConfig(tier.metadata);
		if (!cfg) continue;
		const md = object(tier.metadata),
			p = object(md.pricing),
			price = Number(p.base_price);
		const sale = Number.isFinite(price) && price >= 0 ? price : 0;
		const mode = md.price_locked === true ? ('manual' as const) : ('auto' as const);
		const minimumProfit = Math.max(
			pricing.minFulfillmentProfitNgn,
			cfg.minFulfillmentProfitNgn ?? 0
		);
		const provider = String(md.primary_source ?? 'hubman');
		const scope = scopes.find(
			(s) =>
				s.provider === provider && s.serviceId === cfg.serviceId && s.countryId === cfg.countryId
		);
		const signature = JSON.stringify([
			tier.isActive,
			mode,
			sale,
			minimumProfit,
			cfg.serviceId,
			cfg.countryId
		]);
		const live = { active: tier.isActive, mode, sale, signature };
		quotes[tier.id] = {
			app: cfg.serviceName,
			country: cfg.countryName,
			serviceId: cfg.serviceId,
			countryId: cfg.countryId,
			provider,
			costCents: cfg.expectedCostCents,
			available: cfg.availableCount,
			autoHidden: cfg.autoHidden,
			hideReason: cfg.hideReason,
			minimumProfit,
			checkedAt: scope?.refreshedAt.toISOString() ?? null,
			live
		};
		const existing = sheet.rows.find((r) => r.id === tier.id);
		if (!existing)
			sheet.rows.push({
				id: tier.id,
				active: tier.isActive,
				mode,
				sale,
				targetMarkup: pricing.marginPercent,
				baseline: live
			});
		else if (!numbersRowChanged(existing))
			Object.assign(existing, { active: live.active, mode, sale, baseline: live });
	}
	// Removed catalogue entries remain in the audit history, not in the editable current sheet.
	sheet.rows = sheet.rows.filter((row) => quotes[row.id]);
	return {
		sheet,
		fx: pricing.usdNgnRate,
		defaultMarkup: pricing.marginPercent,
		quotes,
		history: history.map((h) => ({
			id: h.id,
			action: h.action,
			createdAt: h.createdAt.toISOString(),
			version: savedSheet(h.metadata)?.version ?? 0
		}))
	};
}
function clean(input: unknown, view: NumbersPricingView): NumbersPricingSheet {
	const current = view.sheet;
	const value = object(input);
	checkVersion(value.version, current.version);
	if (
		!Array.isArray(value.rows) ||
		value.rows.length !== current.rows.length ||
		value.rows.length > 10000
	)
		throw new NumbersPricingError('Invalid sheet rows.');
	const ids = new Set<string>();
	const rows = value.rows.map((raw) => {
		const r = object(raw),
			old = current.rows.find((row) => row.id === r.id);
		if (
			!old ||
			ids.has(old.id) ||
			typeof r.active !== 'boolean' ||
			typeof r.mode !== 'string' ||
			!['auto', 'manual'].includes(r.mode) ||
			typeof r.sale !== 'number' ||
			!Number.isFinite(r.sale) ||
			r.sale < 0 ||
			r.sale > 100000000 ||
			typeof r.targetMarkup !== 'number' ||
			!Number.isFinite(r.targetMarkup) ||
			r.targetMarkup < 0 ||
			r.targetMarkup > 100000
		)
			throw new NumbersPricingError('Invalid number or price.');
		ids.add(old.id);
		const next = {
			...old,
			active: r.active,
			mode: r.mode as 'auto' | 'manual',
			sale: r.sale,
			targetMarkup: r.targetMarkup
		};
		// Accept an explicit reset/re-edit against CURRENT trusted settings, never client-supplied values.
		const live = view.quotes[old.id]?.live;
		if (live && object(r.baseline).signature === live.signature) next.baseline = live;
		if (numbersRowChanged(next) && object(r.baseline).signature !== next.baseline.signature)
			throw new NumbersPricingError('Live settings changed. Reload before saving.', 409);
		return next;
	});
	return { version: current.version + 1, rows };
}
async function record(
	tx: Database,
	sheet: NumbersPricingSheet,
	actor: string,
	action: string,
	changedIds: string[] = []
) {
	await tx.adminAuditLog.create({
		data: {
			actorUserId: actor,
			resourceType: RESOURCE,
			action,
			description: `Numbers Pricing v${sheet.version}`,
			metadata: { sheet: sheet as unknown as Prisma.InputJsonValue, changedIds }
		}
	});
}
export async function saveNumbersPricingDraft(
	input: unknown,
	actor: string,
	database: PrismaClient = prisma
) {
	return database.$transaction(
		async (tx) => {
			await lock(tx);
			const view = await loadNumbersPricingView(tx);
			const next = clean(input, view);
			await record(tx, next, actor, ACTIONS[0]);
			return next;
		},
		{ timeout: 60000 }
	);
}
export async function publishNumbersPricingSheet(
	version: number,
	actor: string,
	database: PrismaClient = prisma
) {
	return database.$transaction(
		async (tx) => {
			await lock(tx);
			await tx.$queryRaw`SELECT id FROM categories WHERE parent_id IN (SELECT id FROM categories WHERE category_type='numbers_platform') ORDER BY id FOR UPDATE`;
			const view = await loadNumbersPricingView(tx);
			checkVersion(version, view.sheet.version);
			if (!view.history.length) throw new NumbersPricingError('Save your draft before publishing.');
			const next = structuredClone(view.sheet),
				changed = next.rows.filter(numbersRowChanged);
			for (const row of changed) {
				const q = view.quotes[row.id];
				if (!q || row.baseline.signature !== q.live.signature)
					throw new NumbersPricingError(
						'Live Numbers settings changed. Reload and review this draft.',
						409
					);
				if (
					row.mode === 'manual' &&
					(row.active || row.sale !== row.baseline.sale || row.mode !== row.baseline.mode) &&
					(row.sale < 1000 || !Number.isInteger(row.sale) || row.sale % 100 !== 0)
				)
					throw new NumbersPricingError(
						`${q.app} · ${q.country}: use at least ₦1,000, in ₦100 steps.`
					);
				if (row.active) {
					const e = numbersEconomics(row, q, view.fx);
					if (e.profit === null || e.profit + 1e-7 < q.minimumProfit)
						throw new NumbersPricingError(
							`${q.app} · ${q.country}: price does not cover the Numbers profit safeguard.`
						);
					const age = q.checkedAt ? Date.now() - Date.parse(q.checkedAt) : NaN;
					if (!Number.isFinite(age) || age < -60000 || age > 30 * 60000)
						throw new NumbersPricingError(
							`${q.app} · ${q.country}: supplier costs need a successful refresh first.`
						);
				}
			}
			for (const row of changed) {
				const tier = await tx.category.findUnique({
					where: { id: row.id },
					select: { metadata: true }
				});
				if (!tier)
					throw new NumbersPricingError('A number was removed. Reload before publishing.', 409);
				const md = object(tier.metadata);
				md.price_locked = row.mode === 'manual';
				if (row.mode === 'manual')
					md.pricing = {
						...object(md.pricing),
						currency: 'NGN',
						base_price: row.sale,
						updated_at: new Date().toISOString()
					};
				await tx.category.update({
					where: { id: row.id },
					data: { isActive: row.active, metadata: md as Prisma.InputJsonValue }
				});
			}
			next.version++;
			// Rebase applied rows to the actual written commercial settings. No cost/stock/routing changes.
			const refreshed = await loadNumbersPricingView(tx);
			for (const row of next.rows) {
				const q = refreshed.quotes[row.id];
				if (q) {
					row.baseline = q.live;
					if (row.mode === 'auto') row.sale = q.live.sale;
				}
			}
			await record(
				tx,
				next,
				actor,
				ACTIONS[1],
				changed.map((r) => r.id)
			);
			return next;
		},
		{ timeout: 60000 }
	);
}
