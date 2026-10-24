import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';

/**
 * The 12-hour Boosting check sent to the owner: what was delivered, what failed and on which
 * supplier service, customer "nothing delivered" reports, retries paid from margin and whether
 * they worked, how much track record the services have built up, and supplier balances.
 * Reporting only: it never changes orders, routes or suppliers.
 */

const HOUR = 3_600_000;
/** In progress longer than this is called out as stuck. */
export const STUCK_AFTER_HOURS = 48;
/** Supplier balance (USD) below which the report warns. */
export const LOW_BALANCE_USD = 10;
/** The router drops a service below this success rate once it has this many results. */
const RELIABILITY_FLOOR = 0.8;
/** Orders usually start within hours; nothing at all after this long means the service isn't delivering. */
export const NOT_STARTED_AFTER_HOURS = 12;
const MIN_RESULTS_FOR_FLOOR = 3;

export interface BoostingHealthReport {
	windowHours: number;
	generatedAt: Date;
	orders: { newOrders: number; delivered: number; inProgress: number; manualReview: number };
	oldestInProgressHours: number | null;
	stuck: Array<{ service: string; provider: string | null; hours: number }>;
	manualReview: Array<{ service: string; reason: string | null; hours: number }>;
	failures: Array<{ service: string; provider: string; outcome: string; orders: number }>;
	noRoute: Array<{ offer: string; orders: number }>;
	/** Services with orders running 12h+ and nothing delivered (never counted as failures). */
	notDelivering: Array<{ service: string; provider: string; orders: number; oldestHours: number }>;
	/** On sale, but every supplier service behind it is switched off or was dropped for failing. */
	unroutableOffers: string[];
	complaints: {
		open: number;
		oldestOpenHours: number | null;
		openedInWindow: number;
		resolvedInWindow: number;
		openByType: Record<string, number>;
	};
	retries: {
		inWindow: number;
		deliveredAfterRetry: Array<{ offer: string; firstService: string; finalService: string }>;
		retryCostNgn: number;
		retryEnabledOffers: number;
	};
	learning: {
		liveServices: number;
		servicesWithResults: number;
		outcomesRecorded: number;
		outcomesInWindow: number;
		repeatedFailures: Array<{ service: string; provider: string; failures: number; score: number }>;
	};
	marginKeptNgn: number;
	suppliers: Array<{
		label: string;
		balance: number | null;
		currency: string | null;
		enabled: boolean;
		circuitOpen: boolean;
		pauseReason: string | null;
		balanceCheckedHoursAgo: number | null;
	}>;
}

const num = (value: unknown) => Number(value ?? 0);

/** "x|followers|Affordable" → "X followers · Affordable" (offer names alone can be just a tier). */
export function offerLabel(raw: string): string {
	const [platform, outcome, name] = raw.split('|');
	if (name === undefined) return raw;
	const what = `${platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1)} ${outcome.replace(/_/g, ' ')}`;
	return name.toLowerCase().includes(outcome.replace(/_/g, ' ').toLowerCase())
		? name
		: `${what} · ${name}`;
}
const hoursSince = (date: Date | null | undefined, now: Date) =>
	date ? Math.max(0, Math.round((now.getTime() - new Date(date).getTime()) / HOUR)) : null;

export async function buildBoostingHealthReport(
	database: PrismaClient = prisma,
	now: Date = new Date(),
	windowHours = 12
): Promise<BoostingHealthReport> {
	const since = new Date(now.getTime() - windowHours * HOUR);
	const stuckBefore = new Date(now.getTime() - STUCK_AFTER_HOURS * HOUR);
	const serviceName = Prisma.sql`CASE WHEN o.id IS NULL THEN COALESCE(ps.name, 'Unknown service')
		ELSE o.platform || '|' || o.outcome || '|' || o.customer_name END`;

	const [
		orderRows,
		openRows,
		reviewRows,
		failureRows,
		noRouteRows,
		complaintRows,
		retryRows,
		retryOffers,
		learningRows,
		repeatRows,
		marginRows,
		providers,
		notDeliveringRows,
		unroutableRows
	] = await Promise.all([
		database.$queryRaw<Array<{ new_orders: bigint; delivered: bigint }>>(Prisma.sql`
			SELECT COUNT(*) FILTER (WHERE created_at >= ${since}) AS new_orders,
				COUNT(*) FILTER (WHERE completed_at >= ${since}) AS delivered
			FROM boost_fulfillments WHERE fulfillment_mode = 'live'`),
		database.$queryRaw<
			Array<{ service: string; provider: string | null; started: Date | null; status: string }>
		>(Prisma.sql`
			SELECT ${serviceName} AS service, f.provider, COALESCE(f.submitted_at, f.created_at) AS started, f.status
			FROM boost_fulfillments f
			LEFT JOIN boost_customer_offers o ON o.id = f.offer_id
			LEFT JOIN boost_service_routes r ON r.id = f.selected_route_id
			LEFT JOIN boost_provider_services ps ON ps.id = r.provider_service_id
			WHERE f.fulfillment_mode = 'live' AND f.status IN ('queued', 'submitted', 'in_progress')
			ORDER BY started ASC`),
		database.$queryRaw<Array<{ service: string; reason: string | null; since: Date }>>(Prisma.sql`
			SELECT ${serviceName} AS service, f.last_safe_error_category AS reason, f.updated_at AS since
			FROM boost_fulfillments f
			LEFT JOIN boost_customer_offers o ON o.id = f.offer_id
			LEFT JOIN boost_service_routes r ON r.id = f.selected_route_id
			LEFT JOIN boost_provider_services ps ON ps.id = r.provider_service_id
			WHERE f.fulfillment_mode = 'live' AND f.status = 'manual_review'
			ORDER BY f.updated_at ASC LIMIT 10`),
		database.$queryRaw<
			Array<{ service: string; provider: string; outcome: string; orders: bigint }>
		>(Prisma.sql`
			SELECT COALESCE(ps.name, 'Unknown service') || ' #' || COALESCE(ps.service_id, '?') AS service,
				COALESCE(ps.provider, 'unknown') AS provider, a.outcome, COUNT(DISTINCT a.fulfillment_id) AS orders
			FROM boost_attempts a
			LEFT JOIN boost_service_routes r ON r.id = a.route_id
			LEFT JOIN boost_provider_services ps ON ps.id = r.provider_service_id
			WHERE a.created_at >= ${since}
				AND ((a.type = 'status_poll' AND a.outcome IN ('cancelled', 'partial', 'failed', 'refunded'))
					OR (a.type = 'submission' AND a.outcome = 'provider_rejected'))
			GROUP BY 1, 2, 3 ORDER BY orders DESC LIMIT 10`),
		database.$queryRaw<Array<{ offer: string; orders: bigint }>>(Prisma.sql`
			SELECT COALESCE(o.customer_name, 'Unknown offer') AS offer, COUNT(DISTINCT a.fulfillment_id) AS orders
			FROM boost_attempts a
			JOIN boost_fulfillments f ON f.id = a.fulfillment_id
			LEFT JOIN boost_customer_offers o ON o.id = f.offer_id
			WHERE a.created_at >= ${since} AND a.type = 'route_decision' AND a.outcome = 'no_safe_route'
			GROUP BY 1 ORDER BY orders DESC LIMIT 5`),
		database.$queryRaw<
			Array<{ type: string; created_at: Date; resolved_at: Date | null }>
		>(Prisma.sql`
			SELECT type, created_at, resolved_at FROM boost_complaints
			WHERE resolved_at IS NULL OR resolved_at >= ${since} OR created_at >= ${since}`),
		// Each send logs "started" then "accepted"; every accepted send after an order's first is a
		// retry (a send the supplier rejected cost nothing, so it doesn't count).
		database.$queryRaw<
			Array<{
				fulfillment_id: string;
				created_at: Date;
				cost_usd: Prisma.Decimal | null;
				fx: Prisma.Decimal | null;
				status: string;
				completed_at: Date | null;
				offer: string;
				first_service: string | null;
				final_service: string | null;
			}>
		>(Prisma.sql`
			WITH subs AS (
				SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.fulfillment_id ORDER BY a.created_at) AS n
				FROM boost_attempts a WHERE a.type = 'submission' AND a.outcome = 'accepted'
			), firsts AS (
				SELECT DISTINCT ON (fulfillment_id) fulfillment_id, route_id FROM subs ORDER BY fulfillment_id, created_at
			)
			SELECT s.fulfillment_id, s.created_at, s.supplier_cost_usd AS cost_usd, f.fx_ngn_per_usd AS fx,
				f.status, f.completed_at, COALESCE(o.customer_name, 'Unknown offer') AS offer,
				fps.name || ' #' || fps.service_id AS first_service,
				lps.name || ' #' || lps.service_id AS final_service
			FROM subs s
			JOIN boost_fulfillments f ON f.id = s.fulfillment_id
			LEFT JOIN boost_customer_offers o ON o.id = f.offer_id
			LEFT JOIN firsts fr ON fr.fulfillment_id = s.fulfillment_id
			LEFT JOIN boost_service_routes frr ON frr.id = fr.route_id
			LEFT JOIN boost_provider_services fps ON fps.id = frr.provider_service_id
			LEFT JOIN boost_service_routes lr ON lr.id = f.selected_route_id
			LEFT JOIN boost_provider_services lps ON lps.id = lr.provider_service_id
			WHERE s.n > 1 AND (s.created_at >= ${since} OR f.completed_at >= ${since})`),
		database.boostCustomerOffer.count({
			where: { status: 'live', attemptCap: { gt: 1 } }
		}),
		database.$queryRaw<
			Array<{ live: bigint; with_results: bigint; outcomes: bigint; outcomes_window: bigint }>
		>(Prisma.sql`
			SELECT COUNT(*) FILTER (WHERE r.state = 'enabled') AS live,
				COUNT(*) FILTER (WHERE r.state = 'enabled' AND r.reliability_observations > 0) AS with_results,
				COALESCE(SUM(r.reliability_observations), 0) AS outcomes,
				(SELECT COUNT(DISTINCT a.fulfillment_id) FROM boost_attempts a
					WHERE a.created_at >= ${since} AND a.type = 'status_poll'
						AND a.outcome IN ('completed', 'cancelled', 'partial', 'failed', 'refunded')) AS outcomes_window
			FROM boost_service_routes r`),
		database.$queryRaw<
			Array<{ service: string; provider: string; failures: number; score: Prisma.Decimal }>
		>(Prisma.sql`
			SELECT ps.name || ' #' || ps.service_id AS service, ps.provider, r.consecutive_failures AS failures,
				r.reliability_score AS score
			FROM boost_service_routes r JOIN boost_provider_services ps ON ps.id = r.provider_service_id
			WHERE r.state = 'enabled' AND r.consecutive_failures >= 2
			ORDER BY r.consecutive_failures DESC LIMIT 8`),
		database.$queryRaw<Array<{ margin: Prisma.Decimal | null }>>(Prisma.sql`
			SELECT SUM(final_margin_ngn) AS margin FROM boost_fulfillments
			WHERE fulfillment_mode = 'live' AND completed_at >= ${since}`),
		database.boostProviderState.findMany({
			select: {
				provider: true,
				label: true,
				balance: true,
				currency: true,
				enabled: true,
				circuitOpen: true,
				pauseReason: true,
				lastBalanceSuccessAt: true
			},
			orderBy: { label: 'asc' }
		}),
		database.$queryRaw<
			Array<{ service: string; provider: string; orders: bigint; oldest: Date }>
		>(Prisma.sql`
			SELECT ps.name || ' #' || ps.service_id AS service, ps.provider, COUNT(*) AS orders,
				MIN(COALESCE(f.submitted_at, f.created_at)) AS oldest
			FROM boost_fulfillments f
			JOIN boost_service_routes r ON r.id = f.selected_route_id
			JOIN boost_provider_services ps ON ps.id = r.provider_service_id
			WHERE f.fulfillment_mode = 'live' AND f.status IN ('submitted', 'in_progress')
				AND COALESCE(f.submitted_at, f.created_at) < ${new Date(now.getTime() - NOT_STARTED_AFTER_HOURS * HOUR)}
				AND (f.remains IS NULL OR f.remains >= f.quantity)
			GROUP BY 1, 2 ORDER BY orders DESC LIMIT 5`),
		database.$queryRaw<Array<{ offer: string }>>(Prisma.sql`
			SELECT o.platform || '|' || o.outcome || '|' || o.customer_name AS offer
			FROM boost_customer_offers o
			WHERE o.status = 'live' AND NOT EXISTS (
				SELECT 1 FROM boost_service_routes r
				WHERE r.offer_id = o.id AND r.state = 'enabled'
					AND NOT (r.reliability_observations >= ${MIN_RESULTS_FOR_FLOOR} AND r.reliability_score < ${RELIABILITY_FLOOR})
					AND (o.routing_policy <> 'locked' OR r.id = o.locked_route_id))
			ORDER BY o.display_order LIMIT 8`)
	]);

	const labels = new Map(providers.map((p) => [p.provider, p.label]));
	const supplier = (id: string | null) => (id ? (labels.get(id) ?? id) : null);
	const open = openRows.map((row) => ({
		...row,
		service: offerLabel(row.service),
		hours: hoursSince(row.started, now) ?? 0
	}));
	const openComplaints = complaintRows.filter((c) => !c.resolved_at);
	const openByType: Record<string, number> = {};
	for (const complaint of openComplaints)
		openByType[complaint.type] = (openByType[complaint.type] ?? 0) + 1;
	const retriesInWindow = retryRows.filter((row) => new Date(row.created_at) >= since);

	return {
		windowHours,
		generatedAt: now,
		orders: {
			newOrders: num(orderRows[0]?.new_orders),
			delivered: num(orderRows[0]?.delivered),
			inProgress: open.length,
			manualReview: reviewRows.length
		},
		oldestInProgressHours: open[0]?.hours ?? null,
		stuck: open
			.filter((row) => row.started && new Date(row.started) < stuckBefore)
			.slice(0, 5)
			.map((row) => ({ service: row.service, provider: supplier(row.provider), hours: row.hours })),
		manualReview: reviewRows.map((row) => ({
			service: offerLabel(row.service),
			reason: row.reason,
			hours: hoursSince(row.since, now) ?? 0
		})),
		failures: failureRows.map((row) => ({
			...row,
			provider: supplier(row.provider) ?? row.provider,
			orders: num(row.orders)
		})),
		noRoute: noRouteRows.map((row) => ({ offer: row.offer, orders: num(row.orders) })),
		notDelivering: notDeliveringRows.map((row) => ({
			service: row.service,
			provider: supplier(row.provider) ?? row.provider,
			orders: num(row.orders),
			oldestHours: hoursSince(row.oldest, now) ?? 0
		})),
		unroutableOffers: unroutableRows.map((row) => offerLabel(row.offer)),
		complaints: {
			open: openComplaints.length,
			oldestOpenHours: openComplaints.length
				? Math.max(...openComplaints.map((c) => hoursSince(c.created_at, now) ?? 0))
				: null,
			openedInWindow: complaintRows.filter((c) => new Date(c.created_at) >= since).length,
			resolvedInWindow: complaintRows.filter(
				(c) => c.resolved_at && new Date(c.resolved_at) >= since
			).length,
			openByType
		},
		retries: {
			inWindow: retriesInWindow.length,
			deliveredAfterRetry: retryRows
				.filter(
					(row) =>
						row.status === 'completed' && row.completed_at && new Date(row.completed_at) >= since
				)
				.map((row) => ({
					offer: row.offer,
					firstService: row.first_service ?? 'unknown',
					finalService: row.final_service ?? 'unknown'
				})),
			retryCostNgn: Math.round(
				retriesInWindow.reduce((sum, row) => sum + num(row.cost_usd) * num(row.fx), 0)
			),
			retryEnabledOffers: retryOffers
		},
		learning: {
			liveServices: num(learningRows[0]?.live),
			servicesWithResults: num(learningRows[0]?.with_results),
			outcomesRecorded: num(learningRows[0]?.outcomes),
			outcomesInWindow: num(learningRows[0]?.outcomes_window),
			repeatedFailures: repeatRows.map((row) => ({
				service: row.service,
				provider: supplier(row.provider) ?? row.provider,
				failures: num(row.failures),
				score: Math.round(num(row.score) * 100)
			}))
		},
		marginKeptNgn: Math.round(num(marginRows[0]?.margin)),
		suppliers: providers.map((p) => ({
			label: p.label,
			balance: p.balance === null ? null : Number(p.balance),
			currency: p.currency,
			enabled: p.enabled,
			circuitOpen: p.circuitOpen,
			pauseReason: p.pauseReason,
			balanceCheckedHoursAgo: hoursSince(p.lastBalanceSuccessAt, now)
		}))
	};
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const age = (hours: number) =>
	hours >= 48 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
const REASONS: Record<string, string> = {
	admin_link_requested: 'customer link needs checking',
	missing_supplier_reference: 'supplier order number missing',
	status_check_failed: "couldn't get status from supplier"
};
const COMPLAINTS: Record<string, string> = {
	nothing_delivered: 'nothing delivered',
	delivery_stopped: 'delivery stopped',
	dropped: 'dropped after delivery'
};

/** Plain text for Telegram (no formatting codes), with the things to act on marked ⚠. */
export function formatBoostingHealthReport(report: BoostingHealthReport): string {
	const when = report.generatedAt.toLocaleString('en-GB', {
		day: 'numeric',
		month: 'short',
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'Africa/Lagos'
	});
	const r = report;
	const lines: string[] = [`🔧 Boosting check · ${when} WAT · last ${r.windowHours} hours`, ''];

	lines.push(
		`Orders: ${r.orders.newOrders} new · ${r.orders.delivered} delivered`,
		`Right now: ${r.orders.inProgress} in progress${r.oldestInProgressHours !== null ? ` (oldest ${age(r.oldestInProgressHours)})` : ''} · ${r.orders.manualReview} waiting for review`
	);
	for (const s of r.stuck)
		lines.push(`⚠ Stuck ${age(s.hours)}: ${s.service}${s.provider ? ` (${s.provider})` : ''}`);
	for (const m of r.manualReview)
		lines.push(
			`⚠ Review (${age(m.hours)}): ${m.service}: ${m.reason ? (REASONS[m.reason] ?? m.reason.replace(/_/g, ' ')) : 'no reason given'}`
		);

	lines.push('', 'Failures:');
	if (!r.failures.length && !r.noRoute.length && !r.notDelivering.length)
		lines.push('None in this period.');
	for (const d of r.notDelivering)
		lines.push(
			`⚠ ${d.service} (${d.provider}): ${d.orders} order${d.orders === 1 ? '' : 's'} with nothing delivered after ${NOT_STARTED_AFTER_HOURS}+ hours (oldest ${age(d.oldestHours)}). These don't count as failures in its track record yet.`
		);
	for (const f of r.failures)
		lines.push(`⚠ ${f.service} (${f.provider}): ${f.orders} ${f.outcome.replace(/_/g, ' ')}`);
	for (const n of r.noRoute)
		lines.push(
			`⚠ No supplier could take ${n.orders} order${n.orders === 1 ? '' : 's'} for ${n.offer}`
		);

	for (const offer of r.unroutableOffers)
		lines.push(`⚠ On sale but no usable supplier: ${offer} (add a service or hide it)`);

	const c = r.complaints;
	lines.push('', 'Customer reports:');
	if (!c.open && !c.openedInWindow && !c.resolvedInWindow) lines.push('None.');
	else {
		const types = Object.entries(c.openByType)
			.map(([type, count]) => `${count} ${COMPLAINTS[type] ?? type}`)
			.join(', ');
		lines.push(
			`${c.open ? '⚠ ' : ''}${c.open} open${types ? ` (${types})` : ''}${c.oldestOpenHours !== null ? `, oldest ${age(c.oldestOpenHours)}` : ''} · ${c.openedInWindow} new · ${c.resolvedInWindow} resolved`
		);
	}

	const t = r.retries;
	lines.push(
		'',
		`Retries paid from margin: ${t.inWindow} (cost ${naira(t.retryCostNgn)}) · ${t.deliveredAfterRetry.length} delivered after a retry`
	);
	for (const d of t.deliveredAfterRetry)
		lines.push(`✅ ${d.offer}: ${d.firstService} failed → ${d.finalService} delivered`);
	lines.push(`Services that allow a retry: ${t.retryEnabledOffers}`);

	const l = r.learning;
	lines.push(
		'',
		`Track record: ${l.servicesWithResults} of ${l.liveServices} live services have results · ${l.outcomesRecorded} outcomes recorded (${l.outcomesInWindow} new)`
	);
	for (const f of l.repeatedFailures)
		lines.push(
			`⚠ ${f.service} (${f.provider}) failed ${f.failures} times in a row · success ${f.score}%`
		);

	lines.push('', `Margin kept on delivered orders: ${naira(r.marginKeptNgn)}`, '', 'Suppliers:');
	for (const s of r.suppliers) {
		const low = s.balance !== null && s.currency === 'USD' && s.balance < LOW_BALANCE_USD;
		const state = !s.enabled
			? ' · switched off'
			: s.circuitOpen
				? ` · paused after failures${s.pauseReason ? ` (${s.pauseReason})` : ''}`
				: '';
		const balance =
			s.balance === null
				? 'balance unknown'
				: `${s.currency === 'USD' ? '$' : ''}${s.balance.toFixed(2)}`;
		const stale =
			s.balanceCheckedHoursAgo !== null && s.balanceCheckedHoursAgo > 12
				? ` (checked ${age(s.balanceCheckedHoursAgo)} ago)`
				: '';
		lines.push(
			`${low || state ? '⚠' : '✅'} ${s.label}: ${balance}${low ? ' (low)' : ''}${stale}${state}`
		);
	}
	lines.push('', 'Details: Admin → Boosting orders');
	return lines.join('\n').slice(0, 4000);
}
