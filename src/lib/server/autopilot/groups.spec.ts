import { describe, expect, it, vi } from 'vitest';
import { GroupBlocked, GroupSlowmode } from './errors';
import { runGroupsOnce, type GroupDeps } from './groups';
import { AUTOPILOT_DEFAULTS } from './settings';
import { newGroupRecord, type GroupRecord, type GroupRunState } from './state';
import type { GroupMessage, UserbotPort } from './userbot';

const NOW = new Date('2026-10-24T12:00:00Z');
const MIN = 60_000;

function setup(groups: GroupRecord[], messages: Record<string, GroupMessage[]> = {}) {
	const saved = new Map(groups.map((g) => [g.username, g]));
	const sent: Array<{ group: string; text: string; replyTo?: number }> = [];
	let state: GroupRunState = {
		day: null,
		joinsToday: 0,
		repliesToday: 0,
		postsToday: 0,
		searchesToday: 0,
		keywordCursor: 0,
		candidates: [],
		lastRunAt: null,
		lastError: null
	};
	const userbot = {
		groupMessages: vi.fn(async (username: string, sinceId: number) =>
			(messages[username] ?? []).filter((m) => m.id > sinceId)
		),
		sendToGroup: vi.fn(async (group: string, text: string, replyTo?: number) => {
			sent.push({ group, text, replyTo });
			return sent.length;
		}),
		searchGroups: vi.fn(async () => []),
		groupInfo: vi.fn(async () => {
			throw new Error('NOT_A_GROUP');
		}),
		joinGroup: vi.fn(async () => {})
	} as unknown as UserbotPort;
	const actions: string[] = [];
	const deps: GroupDeps = {
		userbot,
		settings: { ...AUTOPILOT_DEFAULTS, groupKeywords: [] },
		now: NOW,
		deadline: Date.now() + 60_000,
		listGroups: async () => [...saved.values()],
		saveGroup: async (rec) => void saved.set(rec.username, rec),
		getState: async () => state,
		saveState: async (next) => void (state = next),
		logAction: async (action) => void actions.push(action),
		trackedLink: (group, slug, path) =>
			`https://smm.fastaccs.com${path ?? `/platforms/${slug ?? ''}`}?g=${group}`,
		visitsSince: vi.fn(async () => 0)
	};
	return {
		deps,
		saved,
		sent,
		actions,
		userbot,
		get state() {
			return state;
		},
		set state(next: GroupRunState) {
			state = next;
		}
	};
}

const joined = (username: string, over: Partial<GroupRecord> = {}) =>
	newGroupRecord({
		username,
		title: username,
		status: 'joined',
		members: 3_000,
		lastSeenId: 10,
		...over
	});
const msg = (id: number, text: string, senderId = `u${id}`, minutesAgo = 5): GroupMessage => ({
	id,
	text,
	senderId,
	date: new Date(NOW.getTime() - minutesAgo * MIN)
});

describe('answering people who ask to buy', () => {
	it('replies in the group, to the message, with a tracked link to the right page', async () => {
		const t = setup([joined('naija_hub')], {
			naija_hub: [
				msg(11, 'gm all'),
				msg(12, 'Who sells twitter accounts?'),
				msg(13, 'Need IG account abeg')
			]
		});
		const summary = await runGroupsOnce(t.deps);
		expect(summary.replies).toBe(1); // the second request is within 30 minutes of the first
		expect(t.sent[0]).toMatchObject({ group: 'naija_hub', replyTo: 12 });
		expect(t.sent[0].text).toContain('ready <b>X (Twitter)</b> accounts');
		expect(t.sent[0].text).toContain(
			'<a href="https://smm.fastaccs.com/platforms/x?g=naija_hub">Get X (Twitter) accounts</a>'
		);
		expect(t.sent[0].text).toContain('Code <b>WELCOME10</b> = 10% off');
		expect(t.saved.get('naija_hub')).toMatchObject({ lastSeenId: 13, replies: 1, missed: 1 });
	});

	it('ignores old requests and people already answered this week', async () => {
		const t = setup(
			[
				joined('naija_hub', {
					answered: [{ id: 'u12', at: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() }]
				})
			],
			{
				naija_hub: [
					msg(11, 'Who sells twitter accounts?', 'u11', 180),
					msg(12, 'who sells IG accounts?', 'u12')
				]
			}
		);
		await runGroupsOnce(t.deps);
		expect(t.sent).toHaveLength(0);
	});

	it('respects the daily limit across groups', async () => {
		const groups = ['a_grp', 'b_grp', 'c_grp'].map((u) => joined(u));
		const t = setup(groups, {
			a_grp: [msg(11, 'Who sells twitter accounts?')],
			b_grp: [msg(11, 'Who sells twitter accounts?')],
			c_grp: [msg(11, 'Who sells twitter accounts?')]
		});
		t.deps.settings = { ...t.deps.settings, groupRepliesPerDay: 2 };
		const summary = await runGroupsOnce(t.deps);
		expect(summary).toMatchObject({ replies: 2, missed: 1 });
	});

	it('stops using a group that bans us, and waits out slow mode', async () => {
		const t = setup([joined('strict_grp'), joined('slow_grp')], {
			strict_grp: [msg(11, 'Who sells twitter accounts?')],
			slow_grp: [msg(11, 'Who sells twitter accounts?')]
		});
		vi.mocked(t.userbot.sendToGroup).mockImplementation(async (group: string) => {
			if (group === 'strict_grp') throw new GroupBlocked('chat write forbidden');
			throw new GroupSlowmode(600);
		});
		await runGroupsOnce(t.deps);
		expect(t.saved.get('strict_grp')).toMatchObject({
			status: 'blocked',
			reason: 'chat write forbidden'
		});
		expect(t.saved.get('slow_grp')!.slowUntil).toBe(
			new Date(NOW.getTime() + 600_000).toISOString()
		);
	});
});

describe('promos where the rules invite them', () => {
	it('posts at most every 3 days, within the daily limit, and stops after 3 posts with no visits', async () => {
		const t = setup([
			joined('market_a', { adsAllowed: true }),
			joined('market_b', {
				adsAllowed: true,
				lastPromoAt: new Date(NOW.getTime() - 24 * 3_600_000).toISOString()
			}),
			joined('market_c', { adsAllowed: true, promoPosts: 3 }),
			joined('chat_only')
		]);
		const summary = await runGroupsOnce(t.deps);
		expect(summary.posts).toBe(1);
		expect(t.sent.map((m) => m.group)).toEqual(['market_a']);
		expect(t.sent[0].text).toContain('📢 Updates: @FASTACCOUNT_SMM');
		expect(t.sent[0].text).toContain(
			'<a href="https://smm.fastaccs.com/platforms/?g=market_a">Shop now at smm.fastaccs.com</a>'
		);
		expect(t.sent[0].text).toContain(
			'<a href="https://smm.fastaccs.com/affiliate?g=market_a">Earn by referring friends</a>'
		);
		expect(t.sent[0].text).toContain('\n\n🎁 First order?');
		expect(t.saved.get('market_c')!.promoStopped).toBe(true);
	});
});

describe('finding and joining groups', () => {
	it('joins active Nigerian groups a few a day and starts listening from now', async () => {
		const t = setup([]);
		t.state = {
			...t.state,
			candidates: [
				{ username: 'hustle_hub', via: 'search "naija hustle"' },
				{ username: 'tiny', via: 'x' }
			]
		};
		vi.mocked(t.userbot.groupInfo).mockImplementation(async (username: string) => ({
			title: username,
			about: username === 'hustle_hub' ? 'Naija hustlers. Post your business!' : '',
			members: username === 'hustle_hub' ? 5_000 : 50,
			pinned: '',
			joined: false,
			messages: Array.from({ length: 15 }, (_, i) => ({
				id: 100 + i,
				senderId: `u${i}`,
				date: new Date(NOW.getTime() - i * 20 * MIN),
				text: 'Naija hustle'
			}))
		}));
		const summary = await runGroupsOnce(t.deps);
		expect(summary.joined).toBe(1);
		expect(t.userbot.joinGroup).toHaveBeenCalledWith('hustle_hub');
		expect(t.saved.get('hustle_hub')).toMatchObject({
			status: 'joined',
			adsAllowed: true,
			lastSeenId: 114
		});
		expect(t.saved.get('tiny')).toMatchObject({ status: 'skipped', reason: 'small group' });
	});
});
