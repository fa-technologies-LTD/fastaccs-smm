import { prisma } from '$lib/prisma';
import type { ReportWindow } from './window';

/**
 * Placement-level results: spend per channel / campaign / placement (zone) joined with the orders
 * whose last tracked click came from that same placement. This is what decides which zones to
 * block or scale. Revenue is net of refunds; only paid orders count.
 */

export interface PlacementRow {
	channelKey: string;
	campaignKey: string;
	placementKey: string;
	spendNgn: number;
	impressions: number;
	clicks: number;
	buyers: number;
	orders: number;
	revenueNgn: number;
}

const key = (channel: string, campaign: string, placement: string) =>
	`${channel}\u0000${campaign}\u0000${placement}`;

/**
 * LAST-TOUCH, PAID-WINDOW view: spend booked/imported on business days in the window vs canonical
 * sales (paid, not refunded, not owner self-offloads) paid in the same window whose last ad click
 * came from that placement. Only buyers who accepted ad cookies carry a last touch, so cost per
 * buyer here is an upper bound. Revenue is net of refunds and BEFORE supplier costs and fees: it is
 * not profit.
 */
export async function getPlacementReport(window: ReportWindow): Promise<PlacementRow[]> {
	const [spend, sales] = await Promise.all([
		prisma.$queryRaw<
			Array<{
				channel_key: string;
				campaign_key: string;
				placement_key: string;
				spend_ngn: unknown;
				impressions: unknown;
				clicks: unknown;
			}>
		>`
			SELECT channel_key, campaign_key, placement_key, sum(spend_ngn) AS spend_ngn,
				sum(impressions) AS impressions, sum(clicks) AS clicks
			FROM marketing_spend_daily
			WHERE day >= ${window.sinceDay}::date AND day <= ${window.untilDay}::date
			GROUP BY channel_key, campaign_key, placement_key`,
		prisma.$queryRaw<
			Array<{
				channel_key: string;
				campaign_key: string;
				placement_key: string;
				buyers: unknown;
				orders: unknown;
				revenue_ngn: unknown;
			}>
		>`
			SELECT
				lower(analytics_metadata->'attribution'->'last'->>'source') AS channel_key,
				coalesce(analytics_metadata->'attribution'->'last'->>'campaign', '') AS campaign_key,
				coalesce(analytics_metadata->'attribution'->'last'->>'content', '') AS placement_key,
				count(DISTINCT user_id) AS buyers,
				count(*) AS orders,
				sum(total_amount - coalesce(refunded_amount, 0)) AS revenue_ngn
			FROM orders
			WHERE coalesce(paid_at, created_at) >= ${window.sinceUtc}
				AND coalesce(paid_at, created_at) < ${window.untilUtc}
				AND (status IN ('paid', 'completed') OR payment_status = 'paid')
				AND status <> 'refunded' AND payment_status <> 'refunded' AND delivery_status <> 'refunded'
				AND (payment_channel IS NULL OR payment_channel <> 'manual_release')
				AND coalesce(analytics_metadata->'attribution'->'last'->>'source', '') <> ''
			GROUP BY 1, 2, 3`
	]);

	const rows = new Map<string, PlacementRow>();
	const ensure = (channelKey: string, campaignKey: string, placementKey: string) => {
		const id = key(channelKey, campaignKey, placementKey);
		let row = rows.get(id);
		if (!row) {
			row = {
				channelKey,
				campaignKey,
				placementKey,
				spendNgn: 0,
				impressions: 0,
				clicks: 0,
				buyers: 0,
				orders: 0,
				revenueNgn: 0
			};
			rows.set(id, row);
		}
		return row;
	};

	for (const item of spend) {
		const row = ensure(item.channel_key, item.campaign_key, item.placement_key);
		row.spendNgn += Number(item.spend_ngn) || 0;
		row.impressions += Number(item.impressions) || 0;
		row.clicks += Number(item.clicks) || 0;
	}
	for (const item of sales) {
		const row = ensure(item.channel_key, item.campaign_key, item.placement_key);
		row.buyers += Number(item.buyers) || 0;
		row.orders += Number(item.orders) || 0;
		row.revenueNgn += Number(item.revenue_ngn) || 0;
	}

	return [...rows.values()].sort((a, b) => b.spendNgn - a.spendNgn || b.revenueNgn - a.revenueNgn);
}

export interface HeldPostback {
	orderId: string;
	orderNumber: string;
	channelKey: string;
	netNgn: number;
	lastResult: string;
	attempts: number;
	paidAt: string | null;
}

export async function listHeldPostbacks(limit = 50): Promise<HeldPostback[]> {
	const rows = await prisma.$queryRaw<
		Array<{
			id: string;
			order_number: string;
			channel_key: string | null;
			net_ngn: unknown;
			last_result: string | null;
			attempts: unknown;
			paid_at: Date | null;
		}>
	>`
		SELECT id, order_number,
			analytics_metadata->>'adPostbackChannel' AS channel_key,
			total_amount - coalesce(refunded_amount, 0) AS net_ngn,
			analytics_metadata->>'adPostbackLastResult' AS last_result,
			analytics_metadata->>'adPostbackAttempts' AS attempts,
			paid_at
		FROM orders
		WHERE analytics_metadata->>'adPostbackState' = 'held'
		ORDER BY coalesce(paid_at, created_at) DESC
		LIMIT ${Math.max(1, Math.min(limit, 200))}`;
	return rows.map((row) => ({
		orderId: row.id,
		orderNumber: row.order_number,
		channelKey: row.channel_key ?? '',
		netNgn: Number(row.net_ngn) || 0,
		lastResult: row.last_result ?? '',
		attempts: Number(row.attempts) || 0,
		paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null
	}));
}

export async function recordMarketingAction(input: {
	channelKey: string;
	campaignKey?: string;
	placementKey?: string;
	action: string;
	reason?: string;
	detail?: Record<string, unknown>;
	actor: string;
}): Promise<void> {
	await prisma.$executeRaw`
		INSERT INTO marketing_actions (channel_key, campaign_key, placement_key, action, reason, detail, actor)
		VALUES (${input.channelKey}, ${input.campaignKey ?? ''}, ${input.placementKey ?? ''},
			${input.action}, ${input.reason ?? null}, ${JSON.stringify(input.detail ?? {})}::jsonb,
			${input.actor})`;
}
