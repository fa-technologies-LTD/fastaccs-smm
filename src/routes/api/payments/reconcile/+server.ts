import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reconcilePendingPayments } from '$lib/services/payment-reconciliation';

interface ReconcileRequestInput {
	dryRun?: unknown;
	backfill?: unknown;
	limit?: unknown;
	staleMinutes?: unknown;
	expireMinutes?: unknown;
	rounds?: unknown;
}

interface ReconcileExecutionInput {
	dryRun: boolean;
	backfill: boolean;
	limit: number;
	staleMinutes: number;
	expireMinutes: number;
	rounds: number;
}

interface ReconcileSummary {
	checked: number;
	paid: number;
	completed: number;
	failed: number;
	cancelled: number;
	keptPending: number;
	skipped: number;
	dryRun: boolean;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_STALE_MINUTES = 10;
const DEFAULT_EXPIRE_MINUTES = 120;
const DEFAULT_ROUNDS = 1;
const MAX_LIMIT = 500;
const MAX_ROUNDS = 20;

function parseBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
		if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	}
	return fallback;
}

function parsePositiveNumber(value: unknown, fallback: number): number {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string'
				? Number.parseFloat(value.trim())
				: Number.NaN;
	if (!Number.isFinite(parsed) || parsed < 0) {
		return fallback;
	}
	return parsed;
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string'
				? Number.parseInt(value.trim(), 10)
				: Number.NaN;
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(parsed, max);
}

function sumRound(into: ReconcileSummary, round: ReconcileSummary): void {
	into.checked += round.checked;
	into.paid += round.paid;
	into.completed += round.completed;
	into.failed += round.failed;
	into.cancelled += round.cancelled;
	into.keptPending += round.keptPending;
	into.skipped += round.skipped;
}

async function runReconciliation(input: ReconcileExecutionInput) {
	const roundsToRun = input.dryRun ? 1 : input.rounds;
	const staleMinutes = input.backfill ? 0 : input.staleMinutes;
	const expireMinutes = Math.max(input.expireMinutes, Math.max(staleMinutes, 1));
	const summary: ReconcileSummary = {
		checked: 0,
		paid: 0,
		completed: 0,
		failed: 0,
		cancelled: 0,
		keptPending: 0,
		skipped: 0,
		dryRun: input.dryRun
	};
	let roundsExecuted = 0;

	for (let i = 0; i < roundsToRun; i += 1) {
		const round = await reconcilePendingPayments({
			dryRun: input.dryRun,
			limit: input.limit,
			staleMinutes,
			expireMinutes
		});

		roundsExecuted += 1;
		sumRound(summary, round);

		const statusChanged = round.paid + round.completed + round.failed + round.cancelled;
		if (round.checked < input.limit || statusChanged === 0) {
			break;
		}
	}

	return {
		summary,
		roundsExecuted,
		options: {
			dryRun: input.dryRun,
			backfill: input.backfill,
			limit: input.limit,
			staleMinutes,
			expireMinutes,
			roundsRequested: roundsToRun
		}
	};
}

function parseRequestInput(input: ReconcileRequestInput, dryRunFallback: boolean): ReconcileExecutionInput {
	const dryRun = parseBoolean(input.dryRun, dryRunFallback);
	const backfill = parseBoolean(input.backfill, false);
	const limit = parsePositiveInt(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const staleMinutes = parsePositiveNumber(input.staleMinutes, DEFAULT_STALE_MINUTES);
	const expireMinutes = parsePositiveNumber(input.expireMinutes, DEFAULT_EXPIRE_MINUTES);
	const rounds = parsePositiveInt(input.rounds, DEFAULT_ROUNDS, MAX_ROUNDS);

	return {
		dryRun,
		backfill,
		limit,
		staleMinutes,
		expireMinutes,
		rounds
	};
}

function ensureAdmin(locals: App.Locals) {
	return Boolean(locals.user && locals.user.userType === 'ADMIN');
}

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		if (!ensureAdmin(locals)) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const parsed = parseRequestInput(
			{
				dryRun: url.searchParams.get('dryRun'),
				backfill: url.searchParams.get('backfill'),
				limit: url.searchParams.get('limit'),
				staleMinutes: url.searchParams.get('staleMinutes'),
				expireMinutes: url.searchParams.get('expireMinutes'),
				rounds: url.searchParams.get('rounds')
			},
			true
		);

		const result = await runReconciliation(parsed);
		return json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error('[payments.reconcile] get_error', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to reconcile payments'
			},
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		if (!ensureAdmin(locals)) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const body = (await request.json().catch(() => ({}))) as ReconcileRequestInput;
		const parsed = parseRequestInput(body, false);
		const result = await runReconciliation(parsed);

		return json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error('[payments.reconcile] post_error', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to reconcile payments'
			},
			{ status: 500 }
		);
	}
};
