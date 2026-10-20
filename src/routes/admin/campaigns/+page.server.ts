import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { isOwnerAdmin } from '$lib/auth/owner';
import { dateToWatInput, watInputToDate } from '$lib/helpers/wat-datetime';
import {
	isCampaignLive,
	lagosMonthStart,
	referWinWarnings,
	validateCampaignSettings,
	type BigSpenderSettings,
	type ReferWinSettings
} from '$lib/helpers/promo-campaign-rules';
import {
	buildPromoCampaignReport,
	evaluateReferWin,
	getCampaignSettings,
	getReferWinMarginCheck,
	listBigSpenderTargets,
	releaseHeldReferWin,
	saveCampaignSettings,
	type ReferWinDecision
} from '$lib/services/promo-campaigns';

function summarize(decisions: ReferWinDecision[]) {
	const by = (status: ReferWinDecision['status']) => decisions.filter((d) => d.status === status);
	const amount = (rows: ReferWinDecision[]) => rows.reduce((sum, row) => sum + row.amount, 0);
	return {
		issueNow: { count: by('issue').length, amount: amount(by('issue')) },
		waiting: { count: by('waiting').length, amount: amount(by('waiting')) },
		dropped: { count: by('dropped_limit').length, amount: amount(by('dropped_limit')) },
		heldIdentity: { count: by('held_identity').length, amount: amount(by('held_identity')) },
		superExcluded: { count: by('super_excluded').length, amount: amount(by('super_excluded')) },
		issued: { count: by('issued').length, amount: amount(by('issued')) },
		notYet: by('not_yet').length
	};
}

function serializeDecision(row: ReferWinDecision) {
	return {
		referrerEmail: row.referrerEmail,
		friendUserId: row.friendUserId,
		friendEmail: row.friendEmail,
		isSuperReferrer: row.isSuperReferrer,
		status: row.status,
		settledCash: row.settledCash,
		pendingCash: row.pendingCash,
		amount: row.amount,
		when: row.when?.toISOString() ?? null,
		signals: row.signals
	};
}

function parseMonth(value: string | null): Date {
	const match = value?.match(/^(\d{4})-(\d{2})$/);
	if (!match) return new Date();
	// Noon WAT on the 15th sits safely inside the chosen month.
	return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 15, 11));
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!hasAdminPermission(locals.adminContext, 'admin:revenue:view')) {
		throw error(403, 'Forbidden');
	}
	const now = new Date();
	const { referWin, bigSpender } = await getCampaignSettings();
	const monthOf = parseMonth(url.searchParams.get('month'));
	const [margin, liveDecisions, illustrative, targets, referWinReport, bigSpenderReport] =
		await Promise.all([
			getReferWinMarginCheck(referWin),
			referWin.startsAt
				? evaluateReferWin({
						settings: referWin,
						now,
						launchForwardFrom: new Date(referWin.startsAt)
					})
				: Promise.resolve([] as ReferWinDecision[]),
			evaluateReferWin({
				settings: referWin,
				now,
				launchForwardFrom: null,
				illustrateExisting: true
			}),
			listBigSpenderTargets(bigSpender),
			buildPromoCampaignReport('refer_win', monthOf),
			buildPromoCampaignReport('bigspender', monthOf)
		]);
	const monthStart = lagosMonthStart(monthOf);
	return {
		isOwner: isOwnerAdmin(locals.user, locals.adminContext),
		month: dateToWatInput(monthStart).slice(0, 7),
		referWin: {
			settings: referWin,
			live: isCampaignLive(referWin, now),
			endsAtWat: dateToWatInput(referWin.endsAt ? new Date(referWin.endsAt) : null),
			startsAtWat: dateToWatInput(referWin.startsAt ? new Date(referWin.startsAt) : null),
			margin,
			warnings: referWinWarnings(referWin, margin),
			live_dry_run: {
				summary: summarize(liveDecisions),
				rows: liveDecisions.filter((row) => row.status !== 'not_yet').map(serializeDecision)
			},
			illustrative: {
				summary: summarize(illustrative),
				withSuper: summarize(
					illustrative.map((row) =>
						row.status === 'super_excluded' ? { ...row, status: 'issue' as const } : row
					)
				)
			},
			report: referWinReport
		},
		bigSpender: {
			settings: bigSpender,
			live: isCampaignLive(bigSpender, now),
			endsAtWat: dateToWatInput(bigSpender.endsAt ? new Date(bigSpender.endsAt) : null),
			startsAtWat: dateToWatInput(bigSpender.startsAt ? new Date(bigSpender.startsAt) : null),
			// Customers whose mark is above the threshold (had the ₦70k gift or already over it).
			targets: targets.map((row) => ({
				userId: row.userId,
				label: row.name || row.email || row.userId,
				spendNow: row.spendNow,
				targetNgn: row.targetNgn,
				toGo: Math.max(0, row.targetNgn - row.spendNow),
				hadSpendGift70k: row.hadSpendGift70k,
				alreadyGranted: row.alreadyGranted
			})),
			report: bigSpenderReport
		}
	};
};

type Ctx = Parameters<Actions[string]>[0];

function requireOwner(ctx: Ctx) {
	if (!isOwnerAdmin(ctx.locals.user, ctx.locals.adminContext) || !ctx.locals.user) {
		return fail(403, { success: false, error: 'Only the owner can change campaigns.' });
	}
	return null;
}

const num = (form: FormData, key: string, fallback: number) => {
	const raw = String(form.get(key) ?? '').replace(/[₦,\s]/g, '');
	if (raw === '') return fallback;
	const value = Number(raw);
	return Number.isFinite(value) ? Math.floor(value) : NaN;
};

function readCommon<T extends ReferWinSettings | BigSpenderSettings>(
	form: FormData,
	current: T
): T | string {
	const endsRaw = String(form.get('endsAt') ?? '').trim();
	const endsAt = endsRaw ? watInputToDate(endsRaw) : null;
	if (endsRaw && !endsAt) return 'Enter the end as a WAT date and time.';
	return {
		...current,
		rewardNgn: num(form, 'rewardNgn', current.rewardNgn),
		expiryDays: num(form, 'expiryDays', current.expiryDays),
		capPercent: num(form, 'capPercent', current.capPercent),
		allowAboveHalf: form.get('allowAboveHalf') === 'on',
		endsAt: endsAt?.toISOString() ?? null
	};
}

export const actions: Actions = {
	saveReferWin: async (ctx) => {
		const denied = requireOwner(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const { referWin } = await getCampaignSettings();
		const common = readCommon(form, referWin);
		if (typeof common === 'string') return fail(400, { success: false, error: common });
		const next: ReferWinSettings = {
			...common,
			qualifyingCashNgn: num(form, 'qualifyingCashNgn', referWin.qualifyingCashNgn),
			monthlyLimit: num(form, 'monthlyLimit', referWin.monthlyLimit),
			waitHours: num(form, 'waitHours', referWin.waitHours),
			includeSuper: form.get('includeSuper') === 'on'
		};
		const errors = validateCampaignSettings(next);
		if (errors.length) return fail(400, { success: false, error: errors.join(' ') });
		await saveCampaignSettings({
			kind: 'refer_win',
			settings: next,
			before: referWin,
			actorUserId: ctx.locals.user!.id,
			description: 'Refer & Win settings changed'
		});
		return { success: true, message: 'Refer & Win settings saved.' };
	},

	switchReferWin: async (ctx) => {
		const denied = requireOwner(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const turnOn = form.get('to') === 'on';
		const { referWin } = await getCampaignSettings();
		// Margin warnings are shown on the page but never block: the owner checks the numbers.
		if (turnOn && form.get('reviewedDryRun') !== 'on') {
			return fail(400, { success: false, error: 'Tick that you reviewed the dry run first.' });
		}
		await saveCampaignSettings({
			kind: 'refer_win',
			settings: {
				...referWin,
				enabled: turnOn,
				// Launch-forward: the first switch-on fixes the start; nothing before it counts.
				startsAt: turnOn ? (referWin.startsAt ?? new Date().toISOString()) : referWin.startsAt
			},
			before: referWin,
			actorUserId: ctx.locals.user!.id,
			description: turnOn ? 'Refer & Win switched ON' : 'Refer & Win switched OFF'
		});
		return { success: true, message: turnOn ? 'Refer & Win is on.' : 'Refer & Win is off.' };
	},

	releaseReferWin: async (ctx) => {
		const denied = requireOwner(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const result = await releaseHeldReferWin({
			friendUserId: String(form.get('friendUserId') || ''),
			actorUserId: ctx.locals.user!.id
		});
		return result.success
			? { success: true, message: 'Reward issued.' }
			: fail(400, { success: false, error: result.error });
	},

	saveBigSpender: async (ctx) => {
		const denied = requireOwner(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const { bigSpender } = await getCampaignSettings();
		const common = readCommon(form, bigSpender);
		if (typeof common === 'string') return fail(400, { success: false, error: common });
		const next: BigSpenderSettings = {
			...common,
			thresholdNgn: num(form, 'thresholdNgn', bigSpender.thresholdNgn),
			reminderDaysBefore: num(form, 'reminderDaysBefore', bigSpender.reminderDaysBefore),
			remindersEnabled: form.get('remindersEnabled') === 'on'
		};
		const errors = validateCampaignSettings(next);
		if (errors.length) return fail(400, { success: false, error: errors.join(' ') });
		await saveCampaignSettings({
			kind: 'bigspender',
			settings: next,
			before: bigSpender,
			actorUserId: ctx.locals.user!.id,
			description: 'BIGSPENDER settings changed'
		});
		return { success: true, message: 'BIGSPENDER settings saved.' };
	},

	switchBigSpender: async (ctx) => {
		const denied = requireOwner(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const turnOn = form.get('to') === 'on';
		if (turnOn && form.get('reviewedDryRun') !== 'on') {
			return fail(400, { success: false, error: 'Tick that you reviewed the dry run first.' });
		}
		const { bigSpender } = await getCampaignSettings();
		await saveCampaignSettings({
			kind: 'bigspender',
			settings: {
				...bigSpender,
				enabled: turnOn,
				startsAt: turnOn ? (bigSpender.startsAt ?? new Date().toISOString()) : bigSpender.startsAt
			},
			before: bigSpender,
			actorUserId: ctx.locals.user!.id,
			description: turnOn ? 'BIGSPENDER switched ON' : 'BIGSPENDER switched OFF'
		});
		return { success: true, message: turnOn ? 'BIGSPENDER is on.' : 'BIGSPENDER is off.' };
	}
};
