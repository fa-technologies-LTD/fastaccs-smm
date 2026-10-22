import type { BotButton } from './bot';
import { TelegramSlowDown } from './errors';
import type { ClaudeReading } from './llm';
import {
	autopilotCopy,
	channelQualifies,
	dealBrief,
	decidePrice,
	isOurPost,
	maxPriceFor,
	nigeriaScore,
	promoContactCandidates,
	readReply,
	typicalViews,
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
 * One autopilot run (every 15 minutes, time-boxed):
 *   1. send anything the owner typed for an admin
 *   2. read admins' replies and act on them (rules first, Claude for the unclear ones, owner last)
 *   3. check paid posts went live; measure their views at 24h and 48h
 *   4. close deals nobody answered
 *   5. once a day: find new channels; message a few new admins; send the owner a report
 * Money never moves here: payment always waits for the owner's tap in the bot.
 */

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
}

export interface RunSummary {
	sent: number;
	repliesRead: number;
	discovered: number;
	contacted: number;
	posted: number;
	escalated: number;
	errors: number;
	stoppedEarly: boolean;
}

const HOUR = 3_600_000;
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

export function watDay(at: Date): string {
	return new Date(at.getTime() + HOUR).toISOString().slice(0, 10);
}

function watHour(at: Date): number {
	return new Date(at.getTime() + HOUR).getUTCHours();
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
		stoppedEarly: false
	};
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

	// 2. Admins' replies.
	for (const rec of channels.filter((r) => ACTIVE_STATUSES.includes(r.status) && r.contact)) {
		if (!timeLeft()) break;
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
	}

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
			rec.status = 'awaiting_payment';
			await send(rec, autopilotCopy.paymentAck());
			// The owner's one-tap decision: the deal, what to expect, and who gets paid.
			const promptId = await deps.notifyOwner(
				dealBrief({
					username: rec.username,
					title: rec.title,
					members: rec.members,
					avgViews: rec.avgViews,
					priceNgn: rec.agreedNgn ?? 0,
					paymentDetails: rec.paymentDetails ?? '',
					post: deps.postFor(rec),
					targetCacNgn: 2_600
				}),
				[
					[
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
		const age = now.getTime() - new Date(rec.postedAt!).getTime();
		if (age < 24 * HOUR || (rec.views24h !== null && age < 48 * HOUR)) continue;
		attempted.add(rec.username);
		let posts: Awaited<ReturnType<UserbotPort['recentPosts']>>;
		try {
			posts = await userbot.recentPosts(rec.username, 40);
		} catch (error) {
			await failed(rec, 'count views', error);
			continue;
		}
		const views = posts.find((p) => p.id === rec.postId)?.views ?? 0;
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

	// 5a. Discovery, once a day, a few keywords at a time.
	if (state.lastDiscoveryDay !== today && timeLeft()) {
		const dayIndex = Math.floor(now.getTime() / (24 * HOUR));
		const keywords = settings.keywords.length
			? [0, 1, 2].map((i) => settings.keywords[(dayIndex * 3 + i) % settings.keywords.length])
			: [];
		let inspected = 0;
		for (const keyword of [...new Set(keywords)]) {
			if (!timeLeft() || inspected >= 12) break;
			let results: Awaited<ReturnType<UserbotPort['searchChannels']>> = [];
			try {
				results = await userbot.searchChannels(keyword);
			} catch (error) {
				if (error instanceof TelegramSlowDown) throw error;
				await store.logAction('search_error', keyword, {
					message: error instanceof Error ? error.message.slice(0, 120) : 'failed'
				});
			}
			for (const found of results) {
				if (!timeLeft() || inspected >= 12) break;
				const username = normalizeUsername(found.username);
				if (byName.has(username)) continue;
				inspected += 1;
				let info: Awaited<ReturnType<UserbotPort['channelInfo']>>;
				try {
					info = await userbot.channelInfo(username);
				} catch (error) {
					if (error instanceof TelegramSlowDown) throw error;
					const rec = newChannelRecord({
						username,
						title: found.title,
						keyword,
						status: 'skipped'
					});
					await store.saveChannel(rec, 'skipped: could not read the channel');
					byName.set(username, rec);
					continue;
				}
				const avgViews = typicalViews(info.posts);
				const lastPostAt = info.posts[0]?.date ?? null;
				const rec = newChannelRecord({
					username,
					title: found.title,
					members: info.members,
					avgViews,
					lastPostAt: lastPostAt?.toISOString() ?? null,
					keyword,
					nigeria: nigeriaScore(`${found.title}\n${info.about}`),
					maxPriceNgn: maxPriceFor(avgViews, settings)
				});
				const fit = channelQualifies(
					{ members: info.members, avgViews, lastPostAt, text: info.about },
					settings,
					now
				);
				if (fit.ok) {
					for (const candidate of promoContactCandidates(info.about, username)) {
						const person = await userbot.resolvePerson(candidate);
						if (person) {
							rec.contact = normalizeUsername(person.username);
							break;
						}
					}
				}
				if (!fit.ok || !rec.contact || rec.maxPriceNgn < 500) {
					rec.status = 'skipped';
					await store.saveChannel(
						rec,
						`skipped: ${!fit.ok ? fit.reason : rec.contact ? 'too small' : 'no promo contact'}`
					);
				} else {
					await store.saveChannel(rec, `found via "${keyword}"`);
					summary.discovered += 1;
				}
				byName.set(username, rec);
			}
		}
		state.lastDiscoveryDay = timeLeft() ? today : state.lastDiscoveryDay;
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
				`Waiting on you: ${all.filter((r) => r.waitingOwner || r.status === 'awaiting_payment').length}`
			].join('\n')
		);
		state.lastReportDay = today;
	}

	// Channels whose Telegram calls all worked this run start counting errors afresh.
	for (const username of attempted) {
		const rec = byName.get(username);
		if (rec && rec.errorCount > 0 && !erroredNow.has(username)) {
			rec.errorCount = 0;
			await store.saveChannel(rec);
		}
	}

	state.lastRunAt = now.toISOString();
	state.lastError = null;
	await store.saveRunState(state);
	summary.stoppedEarly = !timeLeft();
	return summary;
}
