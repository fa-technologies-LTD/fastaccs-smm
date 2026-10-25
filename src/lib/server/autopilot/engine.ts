import type { BotButton } from './bot';
import { TelegramSlowDown } from './errors';
import type { ClaudeReading } from './llm';
import {
	autopilotCopy,
	checkAudience,
	checkContact,
	checkLines,
	checkPayment,
	dealBrief,
	decidePrice,
	isOurPost,
	maxPriceFor,
	mentionedUsernames,
	nigeriaScore,
	partnerBrief,
	partnerCommission,
	partnerPayoutBrief,
	promoContactCandidates,
	readReply,
	searchBlocker,
	type ReadReply
} from './rules';
import { mayMessage, normalizeUsername, type AutopilotSettings } from './settings';
import {
	ACTIVE_STATUSES,
	COMMITTED_STATUSES,
	newChannelRecord,
	type ChannelRecord,
	type OwnerPick,
	type RunState
} from './state';
import type { UserbotPort } from './userbot';

/**
 * One autopilot run (time-boxed). The quick "replies" run (every minute, only while there are
 * conversations) does steps 1–2; the full run (every 15 minutes) does everything:
 *   1. send anything the owner typed for an admin
 *   2. read admins' replies and act on them (rules first, Claude for the unclear ones, owner last)
 *   3. check paid posts went live; measure their views at 24h and 48h
 *   4. close deals nobody answered
 *   5. find new channels through the day; message a few new admins; send the owner a report
 * Money never moves here: payment always waits for the owner's tap in the bot.
 */

export type AutopilotMode = 'full' | 'replies' | 'groups';

/** How hard the search works: per full run, per day, and how many good channels a day is enough. */
export const SEARCH_LIMITS = { inspectionsPerRun: 12, searchesPerRun: 3, inspectionsPerDay: 100 };
export const goodChannelsPerDay = (dailyNewContacts: number) => Math.max(15, dailyNewContacts * 3);

/** Full runs keep the old 15-minute rhythm; group runs sit in between. */
export const FULL_RUN_MINUTES = [2, 17, 32, 47];
export const GROUP_RUN_MINUTES = [9, 24, 39, 54];

/**
 * Which run (if any) is due this minute. Quick runs only happen while there are conversations to
 * follow, so a quiet autopilot costs nothing between full runs.
 */
export function planAutopilotRun(input: {
	now: Date;
	settings: Pick<AutopilotSettings, 'enabled' | 'groupsEnabled'>;
	configured: boolean;
	state: Pick<RunState, 'lastFullRunAt' | 'pausedUntil'>;
	channels: Array<Pick<ChannelRecord, 'status' | 'contact' | 'outbox'>>;
}): AutopilotMode | null {
	const { now, settings, state } = input;
	if (FULL_RUN_MINUTES.includes(now.getUTCMinutes())) return 'full';
	if (!settings.enabled || !input.configured) return null;
	if (state.pausedUntil && new Date(state.pausedUntil) > now) return null;
	const lastFull = state.lastFullRunAt ? new Date(state.lastFullRunAt).getTime() : 0;
	if (now.getTime() - lastFull > 16 * 60_000) return 'full'; // just switched on, or a run was missed
	if (settings.groupsEnabled && GROUP_RUN_MINUTES.includes(now.getUTCMinutes())) return 'groups';
	const busy = input.channels.some(
		(rec) => rec.outbox.length > 0 || (ACTIVE_STATUSES.includes(rec.status) && rec.contact)
	);
	return busy ? 'replies' : null;
}

export interface EngineStore {
	listChannels(): Promise<ChannelRecord[]>;
	/** False when the record changed elsewhere since it was read (nothing is written). */
	saveChannel(rec: ChannelRecord, note?: string): Promise<boolean>;
	getRunState(): Promise<RunState>;
	saveRunState(state: RunState): Promise<void>;
	logAction(action: string, username: string, detail?: Record<string, unknown>): Promise<void>;
	/** Hand a group chat to the group run (owner picks that turn out to be groups). */
	queueGroup?(username: string, via: string): Promise<void>;
	/** Channels the owner asked to try, and clearing the ones a run handled. */
	getOwnerPicks?(): Promise<OwnerPick[]>;
	settleOwnerPicks?(done: string[], found: OwnerPick[]): Promise<void>;
}

export interface EngineDeps {
	userbot: UserbotPort;
	settings: AutopilotSettings;
	store: EngineStore;
	now: Date;
	/** Message the owner through the bot; returns the bot message id (null if the bot isn't set up). */
	notifyOwner(text: string, rows?: BotButton[][]): Promise<number | null>;
	readWithClaude?(text: string, title: string): Promise<ClaudeReading | null>;
	/** Stop starting new work after this time. */
	deadline: number;
	/** The post copy (with tracked link and code) a channel would publish. */
	postFor(rec: ChannelRecord): string;
	/** Sales made with a code between two times: paid orders, net of refunds. */
	partnerSales?(code: string, from: Date, to: Date): Promise<{ orders: number; salesNgn: number }>;
	/** 'replies': only steps 1–2, reading just the chats with unread messages. Default 'full'. */
	mode?: Exclude<AutopilotMode, 'groups'>;
	/** Today's group activity, for the evening report. */
	groupStats?(): Promise<{ watching: number; repliesToday: number; postsToday: number }>;
}

export interface RunSummary {
	sent: number;
	repliesRead: number;
	discovered: number;
	contacted: number;
	posted: number;
	escalated: number;
	errors: number;
	inspected: number;
	stoppedEarly: boolean;
	mode: Exclude<AutopilotMode, 'groups'>;
}

const HOUR = 3_600_000;
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

export function watDay(at: Date): string {
	return new Date(at.getTime() + HOUR).toISOString().slice(0, 10);
}

function watHour(at: Date): number {
	return new Date(at.getTime() + HOUR).getUTCHours();
}

/** 0 = Sunday … 1 = Monday (WAT). */
function watWeekday(at: Date): number {
	return new Date(at.getTime() + HOUR).getUTCDay();
}

/** Upfront fees paid plus partner payouts made. */
export function spentSoFar(channels: ChannelRecord[]): number {
	return channels.reduce(
		(sum, r) =>
			sum +
			(r.deal !== 'partner' && ['paid', 'posted', 'done'].includes(r.status)
				? (r.agreedNgn ?? 0)
				: 0) +
			(r.partnerEarnedNgn ?? 0),
		0
	);
}

/** "Search today: looked at 34, 6 good · skipped: few views 12, not Nigerian 9, ..." */
export function discoveryLine(disc: RunState['discovery']): string {
	const reasons = Object.entries(disc.reasons)
		.sort((a, b) => b[1] - a[1])
		.map(([reason, count]) => `${reason} ${count}`)
		.join(', ');
	return `Search today: looked at ${disc.inspected}, ${disc.found} good${reasons ? ` · skipped: ${reasons}` : ''}`;
}

export function committedSpend(channels: ChannelRecord[]): number {
	return channels
		.filter((rec) => COMMITTED_STATUSES.includes(rec.status))
		.reduce((sum, rec) => sum + (rec.agreedNgn ?? 0), 0);
}

export async function runAutopilotOnce(deps: EngineDeps): Promise<RunSummary> {
	const { userbot, settings, store, now } = deps;
	const summary: RunSummary = {
		sent: 0,
		repliesRead: 0,
		discovered: 0,
		contacted: 0,
		posted: 0,
		escalated: 0,
		errors: 0,
		inspected: 0,
		stoppedEarly: false,
		mode: deps.mode ?? 'full'
	};
	const quick = summary.mode === 'replies';
	const timeLeft = () => Date.now() < deps.deadline;
	const channels = await store.listChannels();
	const byName = new Map(channels.map((rec) => [rec.username, rec]));
	const state = await deps.store.getRunState();

	const send = async (rec: ChannelRecord, text: string) => {
		if (!rec.contact || !mayMessage(settings, rec.contact)) {
			await store.logAction('blocked_by_test_mode', rec.username, { text });
			return false;
		}
		await userbot.sendMessage(rec.contact, text);
		summary.sent += 1;
		return true;
	};

	const escalate = async (rec: ChannelRecord, why: string, text: string) => {
		rec.waitingOwner = true;
		summary.escalated += 1;
		const promptId = await deps.notifyOwner(
			`❓ @${rec.username} (${rec.title}) — ${why}\n\nAdmin wrote:\n${text.slice(0, 1200)}\n\nReply to this message to answer them, or skip the channel.`,
			[[{ text: '⏭ Skip channel', data: `ap:skip:${rec.username}` }]]
		);
		rec.ownerPromptId = promptId ?? rec.ownerPromptId;
	};

	const MONEY_STATUSES: ChannelRecord['status'][] = [
		'partner_pending',
		'agreed',
		'awaiting_payment',
		'paid',
		'posted'
	];

	/**
	 * One channel's Telegram error (deleted, renamed, private, blocked us...) never stops the run.
	 * Three in a row: a channel with money involved goes to the owner, any other is set aside.
	 * Only "slow down" errors stop the whole run. The count resets after a run in which every
	 * Telegram call for that channel worked.
	 */
	const attempted = new Set<string>();
	const erroredNow = new Set<string>();
	const failed = async (rec: ChannelRecord, step: string, error: unknown) => {
		if (error instanceof TelegramSlowDown) throw error;
		const message = error instanceof Error ? error.message.slice(0, 120) : 'failed';
		if (!erroredNow.has(rec.username)) rec.errorCount += 1; // once per run
		erroredNow.add(rec.username);
		summary.errors += 1;
		await store.logAction('channel_error', rec.username, { step, message });
		if (rec.errorCount >= 3) {
			if (!MONEY_STATUSES.includes(rec.status)) rec.status = 'skipped';
			else if (!rec.waitingOwner) {
				await escalate(
					rec,
					`Telegram keeps failing for this channel (${message})`,
					rec.lastAdminText ?? '(no reply)'
				);
			}
		}
		await store.saveChannel(rec, `error (${step}): ${message}`);
	};

	/**
	 * Fresh checks on a channel and its admin. Only admin problems (not a person, Telegram's SCAM or
	 * FAKE label) block; audience problems become warnings for the owner (they may know the channel).
	 */
	const vet = async (rec: ChannelRecord) => {
		const info = await userbot.channelInfo(rec.username);
		const audience = checkAudience({ ...info, title: info.title || rec.title }, settings, now);
		const person = rec.contact ? await userbot.resolvePerson(rec.contact) : null;
		const contact = checkContact({ contact: rec.contact ?? '', person, about: info.about });
		rec.title = info.title || rec.title;
		rec.members = info.members;
		rec.avgViews = audience.facts.avgViews;
		rec.adminName = person?.name ?? rec.adminName;
		const warnings = [
			...audience.blockers.map((b) => `Fails our usual channel check: ${b}`),
			...audience.warnings,
			...contact.warnings
		];
		rec.checks = { at: now.toISOString(), warnings, facts: audience.facts };
		return { blockers: contact.blockers, warnings, facts: audience.facts };
	};

	// 1. Owner's typed replies.
	for (const rec of channels.filter((r) => r.outbox.length > 0)) {
		if (!timeLeft()) break;
		attempted.add(rec.username);
		// Claim the messages before sending, so a clash with the owner's bot can't send one twice.
		const pending = [...rec.outbox];
		rec.outbox = [];
		if (!(await store.saveChannel(rec, `sending ${pending.length} queued message(s)`))) continue;
		for (const [i, text] of pending.entries()) {
			try {
				await send(rec, text);
			} catch (error) {
				rec.outbox = pending.slice(i); // try the rest next run
				await failed(rec, 'send', error);
				break;
			}
		}
	}

	// 2. Admins' replies. The quick run asks Telegram once which chats have unread messages and
	// reads only those; the full run checks every conversation (in case one was read on the phone).
	let unread: Map<string, number> | null = null;
	if (quick) {
		try {
			unread = await userbot.unreadChats();
		} catch (error) {
			if (error instanceof TelegramSlowDown) throw error;
			unread = null; // fall back to checking every conversation
		}
	}
	const readContacts = new Set<string>();
	for (const rec of channels.filter((r) => ACTIVE_STATUSES.includes(r.status) && r.contact)) {
		if (!timeLeft()) break;
		if (unread && !unread.has(rec.contact!)) continue;
		// One chat per person: their messages belong to one deal, never to several at once.
		if (readContacts.has(rec.contact!)) continue;
		readContacts.add(rec.contact!);
		attempted.add(rec.username);
		let incoming: Awaited<ReturnType<UserbotPort['incomingFrom']>>;
		try {
			incoming = await userbot.incomingFrom(rec.contact!, rec.lastInboundId);
		} catch (error) {
			await failed(rec, 'read replies', error);
			continue;
		}
		if (incoming.length === 0) continue;
		// If answering fails part-way, put the deal back as it was so the reply is retried next run.
		const before = structuredClone(rec);
		summary.repliesRead += incoming.length;
		rec.lastInboundId = Math.max(rec.lastInboundId, ...incoming.map((m) => m.id));
		const text = incoming
			.map((m) => m.text)
			.filter(Boolean)
			.join('\n');
		rec.lastAdminText = text.slice(0, 2000);
		try {
			await handleReply(rec, text);
		} catch (error) {
			Object.assign(rec, before);
			await failed(rec, 'answer reply', error);
			continue;
		}
		await store.saveChannel(rec, `reply: ${text.slice(0, 80)}`);
		await userbot.markRead(rec.contact!).catch((error) => {
			if (error instanceof TelegramSlowDown) throw error;
		});
	}

	// Steps 3–5 belong to the full run only.
	if (quick) return finish();

	/** Fresh channel/admin checks plus payee checks, as ✅/⚠ lines for the owner's card. */
	async function cardChecks(rec: ChannelRecord): Promise<{ lines: string[]; blockers: string[] }> {
		let checked: Awaited<ReturnType<typeof vet>> | null = null;
		try {
			checked = await vet(rec);
		} catch (error) {
			if (error instanceof TelegramSlowDown) throw error;
		}
		const account = rec.paymentDetails?.match(/\b\d{10}\b/)?.[0];
		const sameAccountElsewhere = account
			? [...byName.values()]
					.filter(
						(other) => other.username !== rec.username && other.paymentDetails?.includes(account)
					)
					.map((other) => other.username)
			: [];
		const sameSeller = [...byName.values()]
			.filter((other) => other.username !== rec.username && other.contact === rec.contact)
			.map((other) => `@${other.username}`);
		const paymentWarnings = checkPayment({
			details: rec.paymentDetails ?? '',
			adminName: rec.adminName ?? '',
			channelTitle: rec.title,
			sameAccountElsewhere
		});
		if (sameSeller.length) {
			paymentWarnings.push(
				`@${rec.contact} also sells posts for ${sameSeller.join(', ')}: one seller, several channels (their audiences may overlap)`
			);
		}
		const lines = checked
			? checkLines(checked.facts, [...checked.warnings, ...paymentWarnings])
			: [
					"⚠ Couldn't re-check the channel just now",
					...checkLines(null, [...(rec.checks?.warnings ?? []), ...paymentWarnings])
				];
		return { lines, blockers: checked?.blockers ?? [] };
	}

	async function handleReply(rec: ChannelRecord, text: string) {
		let reading: ReadReply = readReply(text);
		// A rate card whose cheapest option is still far above our limit is simply too expensive:
		// handle it as that price (so the pay-per-sale offer goes out). If the cheapest option fits,
		// it isn't clear which package they mean, so it stays with the owner.
		const options = reading.priceOptions ?? [];
		if (
			reading.intent === 'unclear' &&
			options.length > 1 &&
			options[0] > rec.maxPriceNgn * 1.5 &&
			['contacted', 'negotiating', 'partner_offered'].includes(rec.status)
		) {
			reading = { intent: 'price', priceNgn: options[0], paymentDetails: null };
		}
		let draft: string | null = null;
		if ((reading.intent === 'unclear' || reading.intent === 'question') && deps.readWithClaude) {
			const claude = await deps.readWithClaude(text, rec.title).catch(() => null);
			if (claude) {
				reading = {
					intent: claude.intent,
					priceNgn: claude.priceNgn,
					paymentDetails: claude.intent === 'payment_details' ? text.slice(0, 300) : null
				};
				draft = claude.draftReply;
			}
		}
		await store.logAction(`reply_${reading.intent}`, rec.username, { priceNgn: reading.priceNgn });

		if (
			reading.intent === 'price' &&
			reading.priceNgn &&
			['contacted', 'negotiating', 'partner_offered'].includes(rec.status)
		) {
			rec.quotedNgn = reading.priceNgn;
			const remaining = settings.budgetNgn - committedSpend([...byName.values()]);
			const decision = decidePrice({
				quotedNgn: reading.priceNgn,
				maxNgn: rec.maxPriceNgn,
				remainingBudgetNgn: remaining,
				// After the pay-per-sale offer we don't counter again.
				alreadyCountered: rec.countered || rec.status === 'partner_offered'
			});
			if (decision.action === 'accept') {
				// Within the owner's limits, but not a commitment: the owner approves every payment.
				await send(rec, autopilotCopy.withinBudget(decision.priceNgn));
				rec.status = 'agreed';
				rec.agreedNgn = decision.priceNgn;
				await deps.notifyOwner(
					`📝 @${rec.username} quoted ${naira(decision.priceNgn)} (within your limits). Getting their account details; your approval card comes next.`
				);
			} else if (decision.action === 'counter') {
				await send(rec, autopilotCopy.counter(rec.title, decision.priceNgn));
				rec.status = 'negotiating';
				rec.countered = true;
			} else if (rec.status === 'partner_offered') {
				await send(rec, autopilotCopy.partnerStillTooHigh());
			} else if (settings.partnerEnabled) {
				// Too expensive for a paid post: offer a share of sales instead of walking away.
				await send(rec, autopilotCopy.partnerOffer(settings.partnerPercent, settings.partnerDays));
				rec.status = 'partner_offered';
				await store.logAction('partner_offered', rec.username, { quotedNgn: rec.quotedNgn });
			} else {
				await send(rec, autopilotCopy.decline());
				rec.status = 'declined';
			}
			return;
		}
		if (reading.intent === 'accept' && rec.status === 'contacted' && !rec.quotedNgn) {
			// "ok" to our intro: they're happy to talk but gave no price yet.
			await send(rec, autopilotCopy.askPrice());
			return;
		}
		if (reading.intent === 'accept' && rec.status === 'partner_offered') {
			rec.partnerAccepted = true;
			await send(rec, autopilotCopy.partnerAskDetails());
			return;
		}
		if (reading.intent === 'payment_details' && rec.status === 'partner_offered') {
			// Bank details after the offer mean yes.
			rec.paymentDetails = reading.paymentDetails;
			rec.partnerAccepted = true;
			const { lines, blockers } = await cardChecks(rec);
			rec.status = 'partner_pending';
			await send(rec, autopilotCopy.paymentAck());
			const promptId = await deps.notifyOwner(
				partnerBrief({
					username: rec.username,
					title: rec.title,
					members: rec.members,
					avgViews: rec.avgViews,
					quotedNgn: rec.quotedNgn,
					maxPriceNgn: rec.maxPriceNgn,
					percent: settings.partnerPercent,
					days: settings.partnerDays,
					paymentDetails: rec.paymentDetails ?? '',
					checks: lines,
					blockers
				}),
				[
					blockers.length
						? [{ text: '❌ No', data: `ap:nopartner:${rec.username}` }]
						: [
								{ text: '✅ Approve partner', data: `ap:partner:${rec.username}` },
								{ text: '❌ No', data: `ap:nopartner:${rec.username}` }
							]
				]
			);
			rec.ownerPromptId = promptId ?? rec.ownerPromptId;
			return;
		}
		if (reading.intent === 'payment_details' && rec.status === 'agreed') {
			rec.paymentDetails = reading.paymentDetails;
			// Re-check the channel and admin right before the owner decides.
			const { lines, blockers } = await cardChecks(rec);
			rec.status = 'awaiting_payment';
			await send(rec, autopilotCopy.paymentAck());
			// The owner's one-tap decision: the deal, what to expect, the checks, and who gets paid.
			const promptId = await deps.notifyOwner(
				dealBrief({
					username: rec.username,
					title: rec.title,
					members: rec.members,
					avgViews: rec.avgViews,
					priceNgn: rec.agreedNgn ?? 0,
					paymentDetails: rec.paymentDetails ?? '',
					post: deps.postFor(rec),
					targetCacNgn: 2_600,
					checks: lines,
					blockers
				}),
				[
					blockers.length
						? [{ text: "❌ Don't pay", data: `ap:nopay:${rec.username}` }]
						: [
								{
									text: `✅ Approve: I've paid ${naira(rec.agreedNgn ?? 0)}`,
									data: `ap:paid:${rec.username}`
								},
								{ text: "❌ Don't pay", data: `ap:nopay:${rec.username}` }
							]
				]
			);
			rec.ownerPromptId = promptId ?? rec.ownerPromptId;
			return;
		}
		if (reading.intent === 'posted' && rec.status === 'paid') {
			await checkPost(rec);
			return;
		}
		if (reading.intent === 'refuse') {
			rec.status = 'refused';
			return;
		}
		if (
			reading.intent === 'question' &&
			draft &&
			!['agreed', 'awaiting_payment', 'paid', 'partner_offered', 'partner_pending'].includes(
				rec.status
			)
		) {
			await send(rec, draft);
			return;
		}
		await escalate(
			rec,
			reading.intent === 'question' ? 'they asked a question' : "I couldn't read this reply",
			text
		);
	}

	// 3. Paid posts: live yet? Then views at 24h and 48h.
	async function checkPost(rec: ChannelRecord) {
		const posts = await userbot.recentPosts(rec.username, 20);
		const paidAt = rec.paidAt ? new Date(rec.paidAt).getTime() - HOUR : 0;
		const ours = posts.find((p) => isOurPost(p.text, rec.code) && p.date.getTime() >= paidAt);
		if (!ours) return false;
		rec.status = 'posted';
		rec.postId = ours.id;
		rec.postedAt = ours.date.toISOString();
		summary.posted += 1;
		await deps.notifyOwner(
			`📢 The post is live in @${rec.username}: https://t.me/${rec.username}/${ours.id}`
		);
		await store.logAction('post_live', rec.username, { postId: ours.id });
		return true;
	}

	for (const rec of channels.filter((r) => r.status === 'paid')) {
		if (!timeLeft()) break;
		attempted.add(rec.username);
		let live: boolean;
		try {
			live = await checkPost(rec);
		} catch (error) {
			await failed(rec, 'check post', error);
			continue;
		}
		const sincePaid = rec.paidAt ? now.getTime() - new Date(rec.paidAt).getTime() : 0;
		if (!live && sincePaid > 24 * HOUR && !rec.remindedAt) {
			rec.remindedAt = now.toISOString(); // once, even if the reminder can't be delivered
			await send(rec, autopilotCopy.postReminder()).catch((error) =>
				failed(rec, 'reminder', error)
			);
		} else if (!live && sincePaid > 72 * HOUR && !rec.notPostedAlerted) {
			rec.notPostedAlerted = true;
			await escalate(
				rec,
				'paid 3 days ago but the post is still not up',
				rec.lastAdminText ?? '(no reply)'
			);
		}
		await store.saveChannel(rec, live ? 'post found' : undefined);
	}

	for (const rec of channels.filter((r) => r.status === 'posted' && r.postId && r.postedAt)) {
		if (!timeLeft()) break;
		// Checked every full run: a common trick is to delete a paid post after a few hours.
		const age = now.getTime() - new Date(rec.postedAt!).getTime();
		attempted.add(rec.username);
		let post: Awaited<ReturnType<UserbotPort['postById']>>;
		try {
			post = await userbot.postById(rec.username, rec.postId!);
		} catch (error) {
			await failed(rec, 'check post', error);
			continue;
		}
		if (!post) {
			const hours = Math.max(1, Math.round(age / HOUR));
			rec.status = 'done';
			rec.views48h = rec.views48h ?? rec.views24h ?? 0;
			rec.checks = {
				at: now.toISOString(),
				warnings: [...(rec.checks?.warnings ?? []), `Deleted our paid post after about ${hours}h`],
				facts: rec.checks?.facts ?? null
			};
			const promptId = await deps.notifyOwner(
				`🚩 @${rec.username} deleted our post about ${hours}h after it went up (paid ${naira(rec.agreedNgn ?? 0)}). Reply to this message to ask them to repost. They won't be booked again.`
			);
			rec.ownerPromptId = promptId ?? rec.ownerPromptId;
			await store.logAction('post_deleted', rec.username, { hours });
			await store.saveChannel(rec, `post deleted after ~${hours}h`);
			continue;
		}
		if (age < 24 * HOUR || (rec.views24h !== null && age < 48 * HOUR)) continue;
		const views = post.views;
		if (rec.views24h === null) {
			rec.views24h = views;
		} else {
			rec.views48h = views;
			rec.status = 'done';
			const perK = views > 0 ? (rec.agreedNgn ?? 0) / (views / 1000) : 0;
			await deps.notifyOwner(
				`📊 @${rec.username}: ${naira(rec.agreedNgn ?? 0)} → ${views.toLocaleString()} views in 48h (${naira(perK)} per 1,000). Code ${rec.code}. Buyers show in Admin → Marketing.`
			);
		}
		await store.saveChannel(rec, `views ${views}`);
	}

	// 4. No reply after 3 days.
	for (const rec of channels.filter((r) => r.status === 'contacted' && r.contactedAt)) {
		if (now.getTime() - new Date(rec.contactedAt!).getTime() > 72 * HOUR) {
			rec.status = 'no_reply';
			await store.saveChannel(rec, 'no reply in 3 days');
		}
	}

	const today = watDay(now);

	// 5a. Discovery, through the day until there are enough good channels. Each good Nigerian
	// channel leads to more (Telegram's similar channels and the channels it promotes); search
	// words fill the queue when it runs dry.
	const disc =
		state.discovery.day === today
			? state.discovery
			: { day: today, inspected: 0, found: 0, searches: 0, reasons: {} as Record<string, number> };
	state.discovery = disc;
	state.lastDiscoveryDay = today;
	const target = goodChannelsPerDay(settings.dailyNewContacts);
	const queued = new Set(state.candidates.map((c) => c.username));
	const enqueue = (usernames: string[], via: string) => {
		for (const raw of usernames) {
			const username = normalizeUsername(raw);
			if (!username || byName.has(username) || queued.has(username)) continue;
			queued.add(username);
			state.candidates.push({ username, via });
		}
		state.candidates = state.candidates.slice(-300);
	};
	const skip = (reason: string) => {
		disc.reasons[reason] = (disc.reasons[reason] ?? 0) + 1;
	};
	// Channels the owner asked to try come first, whatever today's search has found. They are the
	// owner's choice, so the audience checks become warnings; the ads contact still has to be named
	// in the channel's own description, and Telegram's SCAM/FAKE labels still rule a contact out.
	const picks = (await store.getOwnerPicks?.()) ?? [];
	if (picks.length && timeLeft()) {
		const done: string[] = [];
		const found: OwnerPick[] = [];
		const ready: string[] = [];
		const noContact: string[] = [];
		const unusable: string[] = [];
		const busy: string[] = [];
		const notes: string[] = [];
		for (const pick of picks.slice(0, 8)) {
			if (!timeLeft()) break;
			const username = normalizeUsername(pick.username);
			done.push(pick.username);
			const existing = byName.get(username);
			if (existing && !['discovered', 'skipped'].includes(existing.status)) {
				busy.push(`@${username} (${existing.status.replace(/_/g, ' ')})`);
				continue;
			}
			let info: Awaited<ReturnType<UserbotPort['channelInfo']>>;
			try {
				info = await userbot.channelInfo(username);
			} catch (error) {
				if (error instanceof TelegramSlowDown) throw error;
				const linked = await userbot.linkedChannel(username).catch((linkError) => {
					if (linkError instanceof TelegramSlowDown) throw linkError;
					return null;
				});
				const isGroup = await userbot
					.groupInfo(username)
					.then(() => true)
					.catch((groupError) => {
						if (groupError instanceof TelegramSlowDown) throw groupError;
						return false;
					});
				if (isGroup) {
					await store.queueGroup?.(username, 'your list');
					notes.push(
						`@${username} is a group chat: I'll join it and answer people asking to buy there`
					);
				}
				if (linked && linked !== username) {
					found.push({ username: linked, via: `channel of @${username}` });
					notes.push(`@${username} also has a channel, @${linked}: I'll try it next`);
				} else if (!isGroup) {
					unusable.push(
						`@${username} (not a public channel: a private group, a person or a typo?)`
					);
				}
				continue;
			}
			const title = info.title || username;
			const audience = checkAudience({ ...info, title }, settings, now);
			const rec = newChannelRecord({
				...(existing ?? {}),
				username,
				title,
				members: info.members,
				avgViews: audience.facts.avgViews,
				lastPostAt: info.posts[0]?.date.toISOString() ?? null,
				keyword: pick.via,
				nigeria: nigeriaScore([title, info.about, ...info.posts.map((p) => p.text)].join('\n')),
				maxPriceNgn: maxPriceFor(audience.facts.avgViews, settings),
				manual: true,
				status: 'discovered',
				contact: null,
				checks: {
					at: now.toISOString(),
					warnings: [
						...audience.blockers.map((b) => `Fails our usual channel check: ${b}`),
						...audience.warnings
					],
					facts: audience.facts
				}
			});
			for (const candidate of promoContactCandidates(info.about, username)) {
				const person = await userbot.resolvePerson(candidate);
				if (!person || person.scam || person.fake) continue;
				rec.contact = normalizeUsername(person.username);
				rec.adminName = person.name;
				break;
			}
			if (!audience.blockers.length) {
				const similar = await userbot.similarChannels(username).catch((error) => {
					if (error instanceof TelegramSlowDown) throw error;
					return [];
				});
				enqueue(
					[
						...similar.map((c) => c.username),
						...mentionedUsernames(
							info.posts.map((p) => p.text),
							username
						)
					],
					`via @${username}`
				);
			}
			const warnings = rec.checks?.warnings.length ?? 0;
			if (!rec.contact) {
				rec.status = 'skipped';
				noContact.push(`@${username}`);
				await store.saveChannel(rec, 'your pick: no ads contact in its description');
			} else if (rec.maxPriceNgn < 500) {
				rec.status = 'skipped';
				unusable.push(`@${username} (only ~${audience.facts.avgViews} views per post)`);
				await store.saveChannel(rec, 'your pick: too small');
			} else {
				ready.push(`@${username}${warnings ? ` (⚠ ${warnings})` : ''}`);
				await store.saveChannel(rec, `your pick: ready, admin @${rec.contact}`);
			}
			byName.set(username, rec);
		}
		await store.settleOwnerPicks?.(done, found);
		const sellers = new Map<string, number>();
		for (const rec of byName.values())
			if (rec.manual && rec.status === 'discovered' && rec.contact)
				sellers.set(rec.contact, (sellers.get(rec.contact) ?? 0) + 1);
		const multi = [...sellers.entries()].filter(([, count]) => count > 1);
		await deps.notifyOwner(
			[
				'📋 Your channels to try:',
				ready.length ? `✅ Ready to message: ${ready.join(', ')}` : null,
				noContact.length
					? `❓ No ads contact in their description: ${noContact.join(', ')}. If you know the admin, use "Add a channel yourself".`
					: null,
				unusable.length ? `⛔ Couldn't use: ${unusable.join('; ')}` : null,
				busy.length ? `Already in progress: ${busy.join(', ')}` : null,
				...notes.map((note) => `ℹ️ ${note}`),
				...multi.map(
					([contact, count]) =>
						`ℹ️ @${contact} sells posts for ${count} of these; I'll talk to them about one at a time.`
				),
				ready.length && settings.testMode
					? 'Test mode is on: nothing goes to them until you leave test mode.'
					: null
			]
				.filter(Boolean)
				.join('\n')
		);
	}

	let inspectedNow = 0;
	let searchesNow = 0;
	while (
		timeLeft() &&
		disc.found < target &&
		disc.inspected < SEARCH_LIMITS.inspectionsPerDay &&
		inspectedNow < SEARCH_LIMITS.inspectionsPerRun
	) {
		const next = state.candidates.shift();
		if (!next) {
			if (!settings.keywords.length || searchesNow >= SEARCH_LIMITS.searchesPerRun) break;
			if (disc.searches >= settings.keywords.length) break; // every word tried today
			const keyword = settings.keywords[state.keywordCursor % settings.keywords.length];
			state.keywordCursor += 1;
			disc.searches += 1;
			searchesNow += 1;
			try {
				const results = await userbot.searchChannels(keyword);
				enqueue(
					results.map((r) => r.username),
					`search "${keyword}"`
				);
			} catch (error) {
				if (error instanceof TelegramSlowDown) throw error;
				await store.logAction('search_error', keyword, {
					message: error instanceof Error ? error.message.slice(0, 120) : 'failed'
				});
			}
			continue;
		}
		const username = normalizeUsername(next.username);
		queued.delete(username);
		if (byName.has(username)) continue;
		inspectedNow += 1;
		disc.inspected += 1;
		summary.inspected += 1;
		let info: Awaited<ReturnType<UserbotPort['channelInfo']>>;
		try {
			info = await userbot.channelInfo(username);
		} catch (error) {
			if (error instanceof TelegramSlowDown) throw error;
			skip('not a readable channel');
			const rec = newChannelRecord({ username, keyword: next.via, status: 'skipped' });
			await store.saveChannel(rec, 'skipped: not a readable channel');
			byName.set(username, rec);
			continue;
		}
		const title = info.title || username;
		const audience = checkAudience({ ...info, title }, settings, now);
		const rec = newChannelRecord({
			username,
			title,
			members: info.members,
			avgViews: audience.facts.avgViews,
			lastPostAt: info.posts[0]?.date.toISOString() ?? null,
			keyword: next.via,
			nigeria: nigeriaScore([title, info.about, ...info.posts.map((p) => p.text)].join('\n')),
			maxPriceNgn: maxPriceFor(audience.facts.avgViews, settings),
			checks: { at: now.toISOString(), warnings: audience.warnings, facts: audience.facts }
		});
		let reason: string | null = audience.blockers[0] ?? searchBlocker(audience.facts, info.members);
		if (!reason) {
			// A good Nigerian channel: look at its neighbours next, then find who sells its posts.
			const similar = await userbot.similarChannels(username).catch((error) => {
				if (error instanceof TelegramSlowDown) throw error;
				return [];
			});
			enqueue(
				[
					...similar.map((c) => c.username),
					...mentionedUsernames(
						info.posts.map((p) => p.text),
						username
					)
				],
				`via @${username}`
			);
			// The contact must be named in the channel's own description (only its admins can edit
			// that) and must not carry Telegram's SCAM or FAKE label.
			let flagged = false;
			for (const candidate of promoContactCandidates(info.about, username)) {
				const person = await userbot.resolvePerson(candidate);
				if (!person) continue;
				if (person.scam || person.fake) {
					flagged = true;
					continue;
				}
				rec.contact = normalizeUsername(person.username);
				rec.adminName = person.name;
				break;
			}
			if (!rec.contact) reason = flagged ? 'admin labelled scam by Telegram' : 'no promo contact';
			else if (rec.maxPriceNgn < 500) reason = 'too small';
		}
		if (reason) {
			skip(reason);
			rec.status = 'skipped';
			await store.saveChannel(rec, `skipped: ${reason}`);
		} else {
			disc.found += 1;
			summary.discovered += 1;
			await store.saveChannel(rec, `found ${next.via}`);
		}
		byName.set(username, rec);
	}

	// 5b. Outreach: a few new admins a day, best channels first, never past the budget.
	if (state.outreachDay !== today) {
		state.outreachDay = today;
		state.outreachCount = 0;
	}
	const remaining = settings.budgetNgn - committedSpend([...byName.values()]);
	const queue = [...byName.values()]
		.filter((r) => r.status === 'discovered' && r.contact && mayMessage(settings, r.contact))
		.sort((a, b) => b.nigeria - a.nigeria || b.avgViews - a.avgViews);
	const busyContacts = new Set(
		[...byName.values()]
			.filter((r) => r.contact && [...ACTIVE_STATUSES, 'posted'].includes(r.status))
			.map((r) => r.contact!)
	);
	for (const rec of queue) {
		if (!timeLeft() || state.outreachCount >= settings.dailyNewContacts || remaining < 500) break;
		// The same person often sells posts for several channels: one deal with them at a time.
		if (busyContacts.has(rec.contact!)) continue;
		const bar =
			!rec.manual && rec.checks?.facts ? searchBlocker(rec.checks.facts, rec.members) : null;
		if (bar) {
			rec.status = 'skipped';
			await store.saveChannel(rec, `skipped: ${bar}`);
			continue;
		}
		attempted.add(rec.username);
		// Channels the owner added by hand get the same checks before the first message.
		if (rec.manual && !rec.checks) {
			let checked: Awaited<ReturnType<typeof vet>>;
			try {
				checked = await vet(rec);
			} catch (error) {
				if (error instanceof TelegramSlowDown) throw error;
				rec.status = 'skipped';
				await store.saveChannel(rec, 'skipped: could not open the channel');
				await deps.notifyOwner(
					`⛔ I couldn't open @${rec.username} on Telegram (deleted, private or a typo?), so I didn't message @${rec.contact}.`
				);
				continue;
			}
			if (checked.blockers.length) {
				rec.status = 'skipped';
				await store.saveChannel(rec, `skipped: ${checked.blockers.join('; ')}`);
				await deps.notifyOwner(
					`⛔ I didn't message @${rec.contact} about @${rec.username}: ${checked.blockers.join('; ')}.`
				);
				continue;
			}
		}
		let introduced = false;
		try {
			introduced = await send(rec, autopilotCopy.intro(rec.title));
		} catch (error) {
			await failed(rec, 'intro', error);
			continue;
		}
		if (introduced) {
			busyContacts.add(rec.contact!);
			rec.status = 'contacted';
			rec.contactedAt = now.toISOString();
			state.outreachCount += 1;
			summary.contacted += 1;
			await store.saveChannel(rec, 'intro sent');
			await store.logAction('contacted', rec.username, {
				avgViews: rec.avgViews,
				maxPriceNgn: rec.maxPriceNgn
			});
		}
	}

	// 5c. Partner payouts: each Monday from 10:00 WAT, one card per partner for their sales since
	// the last payout. Sales count once they are two days old, so refunds come off first. The owner
	// pays and taps; "Not now" carries the amount over to the next week.
	if (
		deps.partnerSales &&
		state.lastPartnerPayoutDay !== today &&
		watWeekday(now) === 1 &&
		watHour(now) >= 10
	) {
		for (const rec of [...byName.values()].filter(
			(r) => r.deal === 'partner' && r.code && r.partnerUntil && !r.partnerPayout
		)) {
			if (!timeLeft()) break;
			const until = new Date(rec.partnerUntil!).getTime();
			const from = new Date(rec.partnerPaidUntil ?? rec.paidAt ?? now.toISOString());
			const to = new Date(Math.min(now.getTime() - 48 * HOUR, until));
			if (to <= from) continue;
			const sales = await deps.partnerSales(rec.code!, from, to);
			const percent = rec.partnerPercent ?? settings.partnerPercent;
			const amount = partnerCommission(sales.salesNgn, percent);
			const finished = to.getTime() >= until;
			if (amount === 0 && finished) {
				rec.partnerPaidUntil = rec.partnerUntil;
				await store.saveChannel(rec, 'partner deal ended');
				continue;
			}
			if (amount < 100 && !finished) continue; // too small for a transfer: carry over
			rec.partnerPayout = {
				from: from.toISOString(),
				to: to.toISOString(),
				orders: sales.orders,
				salesNgn: Math.round(sales.salesNgn),
				amountNgn: amount
			};
			const promptId = await deps.notifyOwner(
				partnerPayoutBrief({
					username: rec.username,
					title: rec.title,
					code: rec.code!,
					from: rec.partnerPayout.from,
					to: rec.partnerPayout.to,
					orders: sales.orders,
					salesNgn: rec.partnerPayout.salesNgn,
					percent,
					amountNgn: amount,
					paymentDetails: rec.paymentDetails ?? '(no bank details on file)'
				}),
				[
					[
						{ text: `✅ I've paid ${naira(amount)}`, data: `ap:ppaid:${rec.username}` },
						{ text: '⏭ Not now', data: `ap:pskip:${rec.username}` }
					]
				]
			);
			rec.ownerPromptId = promptId ?? rec.ownerPromptId;
			await store.saveChannel(rec, `payout card: ${naira(amount)} for ${sales.orders} orders`);
		}
		state.lastPartnerPayoutDay = today;
	}

	// 5d. Evening report.
	if (state.lastReportDay !== today && watHour(now) >= 18) {
		const all = [...byName.values()];
		const count = (s: ChannelRecord['status'][]) => all.filter((r) => s.includes(r.status)).length;
		const spent = spentSoFar(all);
		const partners = all.filter((r) => r.deal === 'partner' && r.partnerUntil);
		await deps.notifyOwner(
			[
				`📋 Autopilot today${settings.testMode ? ' (TEST MODE)' : ''}`,
				`Talking to: ${count(['contacted', 'negotiating'])} · agreed: ${count(['agreed', 'awaiting_payment'])} · live posts: ${count(['paid', 'posted'])} · finished: ${count(['done'])}`,
				`Spent ${naira(spent)} of ${naira(settings.budgetNgn)} (committed ${naira(committedSpend(all))})`,
				`New admins messaged today: ${state.outreachCount}/${settings.dailyNewContacts}`,
				`Pay-per-sale: ${count(['partner_offered'])} offered · ${count(['partner_pending'])} waiting for you · ${partners.length} partners (paid ${naira(partners.reduce((sum, r) => sum + r.partnerEarnedNgn, 0))})`,
				discoveryLine(disc),
				...(deps.groupStats
					? [
							await deps
								.groupStats()
								.then(
									(g) =>
										`Groups: watching ${g.watching} · answered ${g.repliesToday} buyer${g.repliesToday === 1 ? '' : 's'} today · ${g.postsToday} promo post${g.postsToday === 1 ? '' : 's'}`
								)
						]
					: []),
				`Waiting on you: ${all.filter((r) => r.waitingOwner || ['awaiting_payment', 'partner_pending'].includes(r.status) || r.partnerPayout).length}`
			].join('\n')
		);
		state.lastReportDay = today;
	}

	return finish();

	async function finish(): Promise<RunSummary> {
		// Channels whose Telegram calls all worked this run start counting errors afresh.
		for (const username of attempted) {
			const rec = byName.get(username);
			if (rec && rec.errorCount > 0 && !erroredNow.has(username)) {
				rec.errorCount = 0;
				await store.saveChannel(rec);
			}
		}
		state.lastRunAt = now.toISOString();
		if (!quick) state.lastFullRunAt = now.toISOString();
		state.lastError = null;
		await store.saveRunState(state);
		summary.stoppedEarly = !timeLeft();
		return summary;
	}
}
