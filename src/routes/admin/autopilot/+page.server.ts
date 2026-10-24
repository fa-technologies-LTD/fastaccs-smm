import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { isOwnerAdmin } from '$lib/auth/owner';
import { prisma } from '$lib/prisma';
import {
	botConfigured,
	botSetWebhook,
	botUsername,
	botWebhookInfo,
	type WebhookHealth
} from '$lib/server/autopilot/bot';
import { committedSpend, discoveryLine, spentSoFar, watDay } from '$lib/server/autopilot/engine';
import { parseChannelList } from '$lib/server/autopilot/rules';
import { botWebhookSecret } from '$lib/server/autopilot/job';
import { claudeConfigured } from '$lib/server/autopilot/llm';
import { SITE_URL } from '$lib/server/autopilot/money';
import {
	AUTOPILOT_MODELS,
	MAX_KEYWORDS,
	normalizeUsername,
	type AutopilotModel
} from '$lib/server/autopilot/settings';
import {
	addOwnerPicks,
	getAutopilotSettings,
	getChannel,
	getGroupRunState,
	getOwnerPicks,
	getRunState,
	listGroups,
	listChannels,
	newChannelRecord,
	saveAutopilotSettings,
	saveChannel
} from '$lib/server/autopilot/state';
import { userbotConfigured } from '$lib/server/autopilot/userbot';

const STATUS_ORDER = [
	'awaiting_payment',
	'agreed',
	'negotiating',
	'contacted',
	'paid',
	'posted',
	'discovered',
	'done',
	'declined',
	'refused',
	'no_reply',
	'skipped'
];

const WEBHOOK_URL = `${SITE_URL}/api/telegram/bot`;

async function bindLinkFor(code: string | null): Promise<string | null> {
	if (!code || !botConfigured()) return null;
	const username = await botUsername().catch(() => null);
	return username ? `https://t.me/${username}?start=${code}` : null;
}

/** Can Telegram reach the site? (Telegram's own delivery report.) */
async function webhookStatus(): Promise<
	(WebhookHealth & { pointsHere: boolean; recentError: boolean }) | null
> {
	if (!botConfigured()) return null;
	const info = await botWebhookInfo().catch(() => null);
	if (!info) return null;
	const recent =
		Boolean(info.lastErrorAt) && Date.now() - new Date(info.lastErrorAt!).getTime() < 3_600_000;
	return { ...info, pointsHere: info.url === WEBHOOK_URL, recentError: recent };
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!hasAdminPermission(locals.adminContext, 'admin:revenue:view')) throw error(403, 'Forbidden');
	const isOwner = isOwnerAdmin(locals.user, locals.adminContext);
	const [settings, state, channels, actions, picks, groups, groupState] = await Promise.all([
		getAutopilotSettings(),
		getRunState(),
		listChannels(),
		prisma.marketingAction.findMany({
			where: { channelKey: 'telegram' },
			orderBy: { createdAt: 'desc' },
			take: 30,
			select: { createdAt: true, action: true, placementKey: true }
		}),
		getOwnerPicks(),
		listGroups(),
		getGroupRunState()
	]);
	const spent = spentSoFar(channels);
	return {
		isOwner,
		settings: { ...settings, bindCode: null },
		// Until the owner's chat is connected, keep showing their link (owner only).
		bindLink: isOwner && !settings.ownerChatId ? await bindLinkFor(settings.bindCode) : null,
		webhook: isOwner ? await webhookStatus() : null,
		picksQueued: picks.map((p) => p.username),
		groups: {
			today:
				groupState.day === watDay(new Date())
					? {
							replies: groupState.repliesToday,
							posts: groupState.postsToday,
							joins: groupState.joinsToday
						}
					: { replies: 0, posts: 0, joins: 0 },
			lastRunAt: groupState.lastRunAt,
			queued: groupState.candidates.length,
			rows: groups
				.sort(
					(a, b) =>
						['joined', 'blocked', 'found', 'skipped'].indexOf(a.status) -
							['joined', 'blocked', 'found', 'skipped'].indexOf(b.status) || b.replies - a.replies
				)
				.slice(0, 150)
				.map((g) => ({
					username: g.username,
					title: g.title,
					members: g.members,
					status: g.status,
					reason: g.reason,
					adsAllowed: g.adsAllowed,
					replies: g.replies,
					missed: g.missed,
					promoPosts: g.promoPosts,
					promoStopped: g.promoStopped,
					lastNote: g.log.at(-1) ?? ''
				}))
		},
		ready: {
			bot: botConfigured(),
			telegramAccount: userbotConfigured(),
			claude: claudeConfigured(),
			ownerConnected: Boolean(settings.ownerChatId)
		},
		state: {
			lastRunAt: state.lastRunAt,
			lastFullRunAt: state.lastFullRunAt,
			lastError: state.lastError,
			pausedUntil: state.pausedUntil
		},
		search: {
			line: discoveryLine(
				state.discovery.day === watDay(new Date())
					? state.discovery
					: { day: null, inspected: 0, found: 0, searches: 0, reasons: {} }
			),
			queued: state.candidates.length
		},
		money: { spent, committed: committedSpend(channels), budget: settings.budgetNgn },
		channels: channels
			.sort(
				(a, b) =>
					STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.avgViews - a.avgViews
			)
			.slice(0, 200)
			.map((r) => ({
				username: r.username,
				title: r.title,
				status: r.status,
				waitingOwner: r.waitingOwner,
				members: r.members,
				avgViews: r.avgViews,
				maxPriceNgn: r.maxPriceNgn,
				quotedNgn: r.quotedNgn,
				agreedNgn: r.agreedNgn,
				code: r.code,
				views48h: r.views48h,
				checked: Boolean(r.checks),
				deal: r.deal,
				partnerPercent: r.partnerPercent,
				partnerUntil: r.partnerUntil,
				partnerEarnedNgn: r.partnerEarnedNgn,
				payoutWaiting: Boolean(r.partnerPayout),
				warnings: r.checks?.warnings ?? [],
				lastNote: r.log.at(-1) ?? ''
			})),
		actions: actions.map((a) => ({
			at: a.createdAt.toISOString(),
			action: a.action,
			channel: a.placementKey
		})),
		models: [...AUTOPILOT_MODELS]
	};
};

type Ctx = Parameters<Actions[string]>[0];
const ownerOnly = (ctx: Ctx) =>
	isOwnerAdmin(ctx.locals.user, ctx.locals.adminContext) && ctx.locals.user
		? null
		: fail(403, { error: 'Only the owner can change the autopilot.' });

const num = (form: FormData, key: string, fallback: number) => {
	const n = Number(String(form.get(key) ?? '').replace(/[₦,\s]/g, ''));
	return Number.isFinite(n) && String(form.get(key) ?? '').trim() !== '' ? Math.floor(n) : fallback;
};
const lines = (value: FormDataEntryValue | null) =>
	String(value ?? '')
		.split(/[\n,]/)
		.map((s) => s.trim())
		.filter(Boolean);

export const actions: Actions = {
	saveRules: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const s = await getAutopilotSettings();
		const model = String(form.get('llmModel') ?? s.llmModel) as AutopilotModel;
		await saveAutopilotSettings({
			...s,
			budgetNgn: Math.max(0, num(form, 'budgetNgn', s.budgetNgn)),
			maxPerPostNgn: Math.max(500, num(form, 'maxPerPostNgn', s.maxPerPostNgn)),
			maxPer1kViewsNgn: Math.max(100, num(form, 'maxPer1kViewsNgn', s.maxPer1kViewsNgn)),
			minAvgViews: Math.max(50, num(form, 'minAvgViews', s.minAvgViews)),
			dailyNewContacts: Math.min(
				15,
				Math.max(0, num(form, 'dailyNewContacts', s.dailyNewContacts))
			),
			keywords: lines(form.get('keywords')).slice(0, MAX_KEYWORDS),
			testContacts: lines(form.get('testContacts')).map(normalizeUsername),
			codePercent: Math.min(30, Math.max(0, num(form, 'codePercent', s.codePercent))),
			codeDays: Math.min(60, Math.max(1, num(form, 'codeDays', s.codeDays))),
			partnerEnabled: form.get('partnerEnabled') === 'on',
			partnerPercent: Math.min(30, Math.max(1, num(form, 'partnerPercent', s.partnerPercent))),
			partnerDays: Math.min(90, Math.max(7, num(form, 'partnerDays', s.partnerDays))),
			groupsEnabled: form.get('groupsEnabled') === 'on',
			groupRepliesPerDay: Math.min(
				30,
				Math.max(0, num(form, 'groupRepliesPerDay', s.groupRepliesPerDay))
			),
			groupJoinsPerDay: Math.min(8, Math.max(0, num(form, 'groupJoinsPerDay', s.groupJoinsPerDay))),
			groupPostsPerDay: Math.min(
				10,
				Math.max(0, num(form, 'groupPostsPerDay', s.groupPostsPerDay))
			),
			groupKeywords: lines(form.get('groupKeywords')).slice(0, MAX_KEYWORDS),
			llmModel: (AUTOPILOT_MODELS as readonly string[]).includes(model) ? model : s.llmModel
		});
		return { message: 'Rules saved.' };
	},

	toggle: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const s = await getAutopilotSettings();
		const field = String(form.get('field'));
		if (field === 'enabled') {
			const turnOn = !s.enabled;
			if (turnOn && !s.ownerChatId)
				return fail(400, { error: 'Connect your bot first, so approvals can reach you.' });
			await saveAutopilotSettings({ ...s, enabled: turnOn });
			return { message: turnOn ? 'Autopilot is on.' : 'Autopilot is off.' };
		}
		if (field === 'testMode') {
			await saveAutopilotSettings({ ...s, testMode: !s.testMode });
			return {
				message: !s.testMode
					? 'Test mode on: only your test contacts get messages.'
					: 'Test mode off: real admins can be messaged.'
			};
		}
		return fail(400, { error: 'Unknown switch.' });
	},

	connectBot: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const secret = botWebhookSecret();
		if (!botConfigured() || !secret)
			return fail(400, { error: 'Add TELEGRAM_BOT_TOKEN in Vercel first.' });
		// Telegram can only reach the live site, so the webhook always points there.
		await botSetWebhook(WEBHOOK_URL, secret);
		const s = await getAutopilotSettings();
		// Pressing again keeps the same link until it's used (an older link must keep working).
		const bindCode =
			s.bindCode && !s.ownerChatId ? s.bindCode : randomBytes(9).toString('base64url');
		if (bindCode !== s.bindCode) await saveAutopilotSettings({ ...s, bindCode });
		return {
			message: s.ownerChatId
				? 'Bot reconnected. To move approvals to a different chat, open the link below there and press Start.'
				: 'Bot connected to the site. Open the link below on your phone and press Start.',
			bindLink: await bindLinkFor(bindCode)
		};
	},

	tryChannels: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const usernames = parseChannelList(String(form.get('channels') ?? ''));
		if (!usernames.length)
			return fail(400, { error: 'Paste channel links (t.me/…) or @usernames.' });
		const added = await addOwnerPicks(usernames.slice(0, 50));
		return {
			message: `${added} channel${added === 1 ? '' : 's'} queued. They're checked on the next full run (within 15 minutes) and your bot gets a summary.`
		};
	},

	addChannel: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const username = normalizeUsername(form.get('username'));
		const contact = normalizeUsername(form.get('contact'));
		if (!/^[a-z][a-z0-9_]{3,31}$/.test(username) || !/^[a-z][a-z0-9_]{3,31}$/.test(contact)) {
			return fail(400, { error: 'Enter the channel and the admin as @usernames.' });
		}
		if (await getChannel(username))
			return fail(400, { error: 'That channel is already in the list.' });
		const s = await getAutopilotSettings();
		await saveChannel(
			newChannelRecord({
				username,
				title: String(form.get('title') ?? '').trim() || username,
				contact,
				manual: true,
				avgViews: Math.max(0, num(form, 'avgViews', 0)),
				maxPriceNgn: Math.min(s.maxPerPostNgn, Math.max(500, num(form, 'maxPriceNgn', 1_000)))
			}),
			'added by owner'
		);
		return { message: `@${username} added. It will be messaged on the next run.` };
	},

	skip: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const rec = await getChannel(String(form.get('username') ?? ''));
		if (!rec) return fail(404, { error: 'Not found.' });
		if (['paid', 'posted', 'done'].includes(rec.status))
			return fail(400, { error: 'Already paid.' });
		const saved = await saveChannel(
			{ ...rec, status: 'skipped', waitingOwner: false },
			'owner skipped (admin page)'
		);
		if (!saved) return fail(409, { error: 'The autopilot was updating this channel. Try again.' });
		return { message: `@${rec.username} skipped.` };
	}
};
