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
	promoContactCandidates,
	readReply,
	type ReadReply
} from './rules';
import { mayMessage, normalizeUsername, type AutopilotSettings } from './settings';
import {
	ACTIVE_STATUSES,
	COMMITTED_STATUSES,
	newChannelRecord,
	type ChannelRecord,
	type RunState
} from './state';
import type { UserbotPort } from './userbot';

/**
 * One autopilot run (time-boxed). The quick "replies" run (every 1–3 minutes, only while there are
 * conversations) does steps 1–2; the full run (every 15 minutes) does everything:
 *   1. send anything the owner typed for an admin
 *   2. read admins' replies and act on them (rules first, Claude for the unclear ones, owner last)
 *   3. check paid posts went live; measure their views at 24h and 48h
 *   4. close deals nobody answered
 *   5. find new channels through the day; message a few new admins; send the owner a report
 * Money never moves here: payment always waits for the owner's tap in the bot.
 */

export type AutopilotMode = 'full' | 'replies';

/** Full runs keep the old 15-minute rhythm. */
export const FULL_RUN_MINUTES = [2, 17, 32, 47];

/**
 * Which run (if any) is due this minute. Quick runs only happen while there are conversations to
 * follow, so a quiet autopilot costs nothing between full runs.
 */
export function planAutopilotRun(input: {
	now: Date;
	settings: Pick<AutopilotSettings, 'enabled'>;
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
	/** 'replies': only steps 1–2, reading just the chats with unread messages. Default 'full'. */
	mode?: AutopilotMode;
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
	mode: AutopilotMode;
}

const HOUR = 3_600_000;
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

export function watDay(at: Date): string {
	return new Date(at.getTime() + HOUR).toISOString().slice(0, 10);
}

function watHour(at: Date): number {
	return new Date(at.getTime() + HOUR).getUTCHours();
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
	for (const rec of channels.filter((r) => ACTIVE_STATUSES.includes(r.status) && r.contact)) {
		if (!timeLeft()) break;
		if (unread && !unread.has(rec.contact!)) continue;
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

	async function handleReply(rec: ChannelRecord, text: string) {
		let reading: ReadReply = readReply(text);
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
			['contacted', 'negotiating'].includes(rec.status)
		) {
			rec.quotedNgn = reading.priceNgn;
			const remaining = settings.budgetNgn - committedSpend([...byName.values()]);
			const decision = decidePrice({
				quotedNgn: reading.priceNgn,
				maxNgn: rec.maxPriceNgn,
				remainingBudgetNgn: remaining,
				alreadyCountered: rec.countered
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
			} else {
				await send(rec, autopilotCopy.decline());
				rec.status = 'declined';
			}
			return;
		}
		if (reading.intent === 'payment_details' && rec.status === 'agreed') {
			rec.paymentDetails = reading.paymentDetails;
			// Re-check the channel and admin right before the owner decides.
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
			const paymentWarnings = checkPayment({
				details: rec.paymentDetails ?? '',
				adminName: rec.adminName ?? '',
				channelTitle: rec.title,
				sameAccountElsewhere
			});
			const lines = checked
				? checkLines(checked.facts, [...checked.warnings, ...paymentWarnings])
				: [
						"⚠ Couldn't re-check the channel just now",
						...checkLines(null, [...(rec.checks?.warnings ?? []), ...paymentWarnings])
					];
			const blockers = checked?.blockers ?? [];
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
			!['agreed', 'awaiting_payment', 'paid'].includes(rec.status)
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
	const target = Math.max(10, settings.dailyNewContacts * 2);
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
	let inspectedNow = 0;
	let searchesNow = 0;
	while (timeLeft() && disc.found < target && disc.inspected < 80 && inspectedNow < 10) {
		const next = state.candidates.shift();
		if (!next) {
			if (!settings.keywords.length || searchesNow >= 2) break;
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
		let reason: string | null = audience.blockers[0] ?? null;
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
	for (const rec of queue) {
		if (!timeLeft() || state.outreachCount >= settings.dailyNewContacts || remaining < 500) break;
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

	// 5c. Evening report.
	if (state.lastReportDay !== today && watHour(now) >= 18) {
		const all = [...byName.values()];
		const count = (s: ChannelRecord['status'][]) => all.filter((r) => s.includes(r.status)).length;
		const spent = all
			.filter((r) => ['paid', 'posted', 'done'].includes(r.status))
			.reduce((s, r) => s + (r.agreedNgn ?? 0), 0);
		await deps.notifyOwner(
			[
				`📋 Autopilot today${settings.testMode ? ' (TEST MODE)' : ''}`,
				`Talking to: ${count(['contacted', 'negotiating'])} · agreed: ${count(['agreed', 'awaiting_payment'])} · live posts: ${count(['paid', 'posted'])} · finished: ${count(['done'])}`,
				`Spent ${naira(spent)} of ${naira(settings.budgetNgn)} (committed ${naira(committedSpend(all))})`,
				`New admins messaged today: ${state.outreachCount}/${settings.dailyNewContacts}`,
				discoveryLine(disc),
				`Waiting on you: ${all.filter((r) => r.waitingOwner || r.status === 'awaiting_payment').length}`
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
