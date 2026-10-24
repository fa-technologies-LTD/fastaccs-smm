import { GroupBlocked, GroupSlowmode, TelegramSlowDown } from './errors';
import { buyRequest, groupCopy, groupQualifies } from './group-rules';
import { normalizeUsername, type AutopilotSettings } from './settings';
import { newGroupRecord, type GroupRecord, type GroupRunState } from './state';
import type { UserbotPort } from './userbot';

/**
 * The group run (every 15 minutes, between full runs). In joined Nigerian groups it answers
 * people asking where to buy accounts, in public, with a tracked link; where a group's rules
 * invite promotion it posts an occasional promo; and it finds and joins a few new groups a day.
 * It never messages members privately: buyers who write to us are handled by the owner's team.
 */

export interface GroupDeps {
	userbot: UserbotPort;
	settings: AutopilotSettings;
	now: Date;
	deadline: number;
	listGroups(): Promise<GroupRecord[]>;
	saveGroup(rec: GroupRecord, note?: string): Promise<void>;
	getState(): Promise<GroupRunState>;
	saveState(state: GroupRunState): Promise<void>;
	logAction(action: string, group: string, detail?: Record<string, unknown>): Promise<void>;
	/** Tracked link for this group (to one platform's page, or another path such as /affiliate). */
	trackedLink(group: string, platformSlug?: string, path?: string): string;
	/** Site visits that came from this group's links since a time. */
	visitsSince(group: string, since: Date): Promise<number>;
}

export interface GroupRunSummary {
	mode: 'groups';
	replies: number;
	missed: number;
	posts: number;
	joined: number;
	inspected: number;
	blocked: number;
}

const HOUR = 3_600_000;
/** Per group: at most this many answers a day, at least this long apart. */
const REPLIES_PER_GROUP_PER_DAY = 4;
const MIN_GAP_BETWEEN_REPLIES = 30 * 60_000;
/** Only answer fresh requests; old ones have usually been answered by someone. */
const MAX_REQUEST_AGE = 2 * HOUR;
const PROMO_EVERY = 72 * HOUR;
const INSPECTIONS_PER_RUN = 8;
const SEARCHES_PER_RUN = 2;

const watDay = (at: Date) => new Date(at.getTime() + HOUR).toISOString().slice(0, 10);

export async function runGroupsOnce(deps: GroupDeps): Promise<GroupRunSummary> {
	const { userbot, settings, now } = deps;
	const timeLeft = () => Date.now() < deps.deadline;
	const summary: GroupRunSummary = {
		mode: 'groups',
		replies: 0,
		missed: 0,
		posts: 0,
		joined: 0,
		inspected: 0,
		blocked: 0
	};
	const state = await deps.getState();
	const today = watDay(now);
	if (state.day !== today) {
		Object.assign(state, {
			day: today,
			joinsToday: 0,
			repliesToday: 0,
			postsToday: 0,
			searchesToday: 0
		});
	}
	const groups = await deps.listGroups();
	const byName = new Map(groups.map((g) => [g.username, g]));

	/** Telegram says we can't post here (any more), or asks us to slow down in this group. */
	const handlePostError = async (group: GroupRecord, error: unknown): Promise<'stop' | 'skip'> => {
		if (error instanceof TelegramSlowDown) throw error;
		if (error instanceof GroupSlowmode) {
			group.slowUntil = new Date(now.getTime() + error.seconds * 1000).toISOString();
			return 'skip';
		}
		if (error instanceof GroupBlocked) {
			group.status = 'blocked';
			group.reason = error.reason;
			summary.blocked += 1;
			await deps.saveGroup(group, `can't post: ${error.reason}`);
			await deps.logAction('group_blocked', group.username, { reason: error.reason });
			return 'stop';
		}
		await deps.logAction('group_error', group.username, {
			message: error instanceof Error ? error.message.slice(0, 120) : 'failed'
		});
		return 'skip';
	};
	const slowed = (group: GroupRecord) =>
		Boolean(group.slowUntil && new Date(group.slowUntil).getTime() > now.getTime());

	// 1. Listen in joined groups and answer people asking where to buy.
	for (const group of groups.filter((g) => g.status === 'joined')) {
		if (!timeLeft()) break;
		let messages: Awaited<ReturnType<UserbotPort['groupMessages']>>;
		try {
			messages = await userbot.groupMessages(group.username, group.lastSeenId);
		} catch (error) {
			if ((await handlePostError(group, error)) === 'stop') continue;
			continue;
		}
		if (!messages.length) continue;
		group.lastSeenId = Math.max(group.lastSeenId, ...messages.map((m) => m.id));
		if (group.repliesDay !== today) {
			group.repliesDay = today;
			group.repliesToday = 0;
		}
		group.answered = group.answered.filter(
			(a) => now.getTime() - new Date(a.at).getTime() < 7 * 24 * HOUR
		);
		let note: string | undefined;
		for (const message of messages) {
			if (now.getTime() - message.date.getTime() > MAX_REQUEST_AGE) continue;
			const platform = buyRequest(message.text);
			if (!platform) continue;
			if (group.answered.some((a) => a.id === message.senderId)) continue;
			const tooSoon =
				group.lastReplyAt &&
				now.getTime() - new Date(group.lastReplyAt).getTime() < MIN_GAP_BETWEEN_REPLIES;
			if (
				state.repliesToday >= settings.groupRepliesPerDay ||
				group.repliesToday >= REPLIES_PER_GROUP_PER_DAY ||
				tooSoon ||
				slowed(group) ||
				!timeLeft()
			) {
				group.missed += 1;
				summary.missed += 1;
				continue;
			}
			try {
				await userbot.sendToGroup(
					group.username,
					groupCopy.reply(platform.name, deps.trackedLink(group.username, platform.slug)),
					message.id
				);
			} catch (error) {
				if ((await handlePostError(group, error)) === 'stop') break;
				group.missed += 1;
				summary.missed += 1;
				continue;
			}
			group.replies += 1;
			group.repliesToday += 1;
			group.lastReplyAt = now.toISOString();
			group.answered.push({ id: message.senderId, at: now.toISOString() });
			state.repliesToday += 1;
			summary.replies += 1;
			note = `answered a ${platform.name} request`;
			await deps.logAction('group_reply', group.username, { platform: platform.name });
		}
		if (group.status === 'joined') await deps.saveGroup(group, note);
	}

	// 2. Occasional promos, only where the group's rules invite them. Three posts with no visits
	// at all and we stop posting there.
	for (const group of groups.filter(
		(g) => g.status === 'joined' && g.adsAllowed && !g.promoStopped
	)) {
		if (!timeLeft() || state.postsToday >= settings.groupPostsPerDay) break;
		if (group.lastPromoAt && now.getTime() - new Date(group.lastPromoAt).getTime() < PROMO_EVERY)
			continue;
		if (slowed(group)) continue;
		if (group.promoPosts >= 3) {
			const visits = await deps.visitsSince(
				group.username,
				new Date(group.joinedAt ?? group.discoveredAt)
			);
			if (visits === 0) {
				group.promoStopped = true;
				await deps.saveGroup(group, 'stopped promos: no visits after 3 posts');
				continue;
			}
		}
		try {
			await userbot.sendToGroup(
				group.username,
				groupCopy.promo(
					deps.trackedLink(group.username),
					deps.trackedLink(group.username, undefined, '/affiliate')
				)
			);
		} catch (error) {
			await handlePostError(group, error);
			if (group.status === 'joined') await deps.saveGroup(group);
			continue;
		}
		group.promoPosts += 1;
		group.lastPromoAt = now.toISOString();
		state.postsToday += 1;
		summary.posts += 1;
		await deps.logAction('group_promo', group.username);
		await deps.saveGroup(group, 'posted a promo');
	}

	// 3. Find and join a few new groups a day: the owner's picks first, then search words.
	const queued = new Set(state.candidates.map((c) => c.username));
	let searches = 0;
	while (
		timeLeft() &&
		state.joinsToday < settings.groupJoinsPerDay &&
		summary.inspected < INSPECTIONS_PER_RUN
	) {
		const next = state.candidates.shift();
		if (!next) {
			if (
				!settings.groupKeywords.length ||
				searches >= SEARCHES_PER_RUN ||
				state.searchesToday >= settings.groupKeywords.length
			)
				break;
			const keyword = settings.groupKeywords[state.keywordCursor % settings.groupKeywords.length];
			state.keywordCursor += 1;
			state.searchesToday += 1;
			searches += 1;
			try {
				for (const found of await userbot.searchGroups(keyword)) {
					const username = normalizeUsername(found.username);
					if (byName.has(username) || queued.has(username)) continue;
					queued.add(username);
					state.candidates.push({ username, via: `search "${keyword}"` });
				}
				state.candidates = state.candidates.slice(-200);
			} catch (error) {
				if (error instanceof TelegramSlowDown) throw error;
			}
			continue;
		}
		const username = normalizeUsername(next.username);
		queued.delete(username);
		if (byName.has(username)) continue;
		summary.inspected += 1;
		let info: Awaited<ReturnType<UserbotPort['groupInfo']>>;
		try {
			info = await userbot.groupInfo(username);
		} catch (error) {
			if (error instanceof TelegramSlowDown) throw error;
			const rec = newGroupRecord({
				username,
				via: next.via,
				status: 'skipped',
				reason: 'not a public group'
			});
			await deps.saveGroup(rec, 'skipped: not a public group');
			byName.set(username, rec);
			continue;
		}
		const fit = groupQualifies(info, now, { ownerPick: next.ownerPick });
		const rec = newGroupRecord({
			username,
			title: info.title,
			members: info.members,
			via: next.via,
			adsAllowed: fit.rules.adsAllowed
		});
		byName.set(username, rec);
		if (!fit.ok) {
			rec.status = 'skipped';
			rec.reason = fit.reason ?? null;
			await deps.saveGroup(rec, `skipped: ${fit.reason}`);
			continue;
		}
		if (!info.joined) {
			try {
				await userbot.joinGroup(username);
			} catch (error) {
				if (error instanceof TelegramSlowDown) throw error;
				rec.status = 'blocked';
				rec.reason = error instanceof GroupBlocked ? error.reason : "couldn't join";
				await deps.saveGroup(rec, `couldn't join: ${rec.reason}`);
				continue;
			}
			state.joinsToday += 1;
		}
		// Start listening from now: older requests have had their answers.
		rec.status = 'joined';
		rec.joinedAt = now.toISOString();
		rec.lastSeenId = Math.max(0, ...info.messages.map((m) => m.id));
		summary.joined += 1;
		await deps.saveGroup(
			rec,
			`joined (${next.via})${fit.rules.adsAllowed ? ' · promos allowed' : ''}`
		);
		await deps.logAction('group_joined', username, { members: info.members, via: next.via });
	}

	state.lastRunAt = now.toISOString();
	state.lastError = null;
	await deps.saveState(state);
	return summary;
}
