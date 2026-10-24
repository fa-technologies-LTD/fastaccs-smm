import { describe, expect, it, vi } from 'vitest';
import type { BotButton } from './bot';
import { discoveryLine, planAutopilotRun, runAutopilotOnce, type EngineDeps } from './engine';
import { TelegramSlowDown } from './errors';
import { AUTOPILOT_DEFAULTS, type AutopilotSettings } from './settings';
import { newChannelRecord, type ChannelRecord, type RunState } from './state';
import type { ChannelPost, UserbotPort } from './userbot';

const NOW = new Date('2026-10-22T10:00:00Z'); // 11:00 WAT, before the evening report
const HOUR = 3_600_000;

function fakeUserbot(overrides: Partial<UserbotPort> = {}) {
	const sent: Array<{ to: string; text: string }> = [];
	const inbox = new Map<string, ChannelPost[]>();
	const unread = new Set<string>();
	const bot: UserbotPort = {
		searchChannels: vi.fn(async () => []),
		channelInfo: vi.fn(async () => ({ title: '', about: '', members: 0, posts: [] })),
		recentPosts: vi.fn(async () => []),
		resolvePerson: vi.fn(async (username: string) => ({
			username,
			userId: '1',
			name: 'Musa Ibrahim',
			scam: false,
			fake: false
		})),
		postById: vi.fn(async (_username: string, id: number) => ({
			id,
			views: 0,
			date: NOW,
			text: ''
		})),
		sendMessage: vi.fn(async (to: string, text: string) => {
			sent.push({ to, text });
			return sent.length;
		}),
		incomingFrom: vi.fn(async (username: string, sinceId: number) =>
			(inbox.get(username) ?? []).filter((m) => m.id > sinceId)
		),
		unreadChats: vi.fn(async () => new Map([...unread].map((name) => [name, 1]))),
		markRead: vi.fn(async (username: string) => void unread.delete(username)),
		similarChannels: vi.fn(async () => []),
		linkedChannel: vi.fn(async () => null),
		searchGroups: vi.fn(async () => []),
		groupInfo: vi.fn(async () => {
			throw new Error('NOT_A_GROUP');
		}),
		joinGroup: vi.fn(async () => {}),
		groupMessages: vi.fn(async () => []),
		sendToGroup: vi.fn(async () => 1),
		close: vi.fn(async () => {}),
		...overrides
	};
	const reply = (from: string, id: number, text: string) => {
		inbox.set(from, [...(inbox.get(from) ?? []), { id, text, views: 0, date: NOW }]);
		unread.add(from);
	};
	return { bot, sent, reply };
}

function setup(
	channels: ChannelRecord[],
	settings: Partial<AutopilotSettings> = {},
	userbot = fakeUserbot()
) {
	const saved = new Map(channels.map((rec) => [rec.username, rec]));
	const actions: string[] = [];
	const owner: Array<{ text: string; rows?: BotButton[][] }> = [];
	let state: RunState = {
		lastDiscoveryDay: null,
		lastFullRunAt: null,
		lastPartnerPayoutDay: null,
		discovery: { day: null, inspected: 0, found: 0, searches: 0, reasons: {} },
		keywordCursor: 0,
		candidates: [],
		lastReportDay: null,
		outreachDay: null,
		outreachCount: 0,
		lastRunAt: null,
		lastError: null,
		pausedUntil: null
	};
	const deps: EngineDeps = {
		userbot: userbot.bot,
		settings: { ...AUTOPILOT_DEFAULTS, enabled: true, testMode: false, ...settings },
		store: {
			listChannels: async () => [...saved.values()],
			saveChannel: async (rec, note) => {
				if (note) rec.log = [...rec.log, note];
				saved.set(rec.username, rec);
				return true;
			},
			getRunState: async () => state,
			saveRunState: async (next) => void (state = next),
			logAction: async (action) => void actions.push(action)
		},
		now: NOW,
		notifyOwner: async (text, rows) => {
			owner.push({ text, rows });
			return 100 + owner.length;
		},
		deadline: Date.now() + 60_000,
		postFor: () => 'POST COPY https://smm.fastaccs.com/platforms/x'
	};
	return {
		deps,
		saved,
		actions,
		owner,
		userbot,
		get state() {
			return state;
		},
		set state(next: RunState) {
			state = next;
		}
	};
}

const contacted = (over: Partial<ChannelRecord> = {}) =>
	newChannelRecord({
		username: 'airdrop_naija',
		title: 'Airdrop Naija',
		contact: 'promo_boss',
		status: 'contacted',
		members: 8_000,
		avgViews: 1_600,
		maxPriceNgn: 4_000,
		contactedAt: NOW.toISOString(),
		...over
	});

describe('price replies', () => {
	it('says a price is within budget without promising payment, and tells the owner', async () => {
		const t = setup([contacted()]);
		t.userbot.reply('promo_boss', 5, 'Promo is 3.5k');
		await runAutopilotOnce(t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec.status).toBe('agreed');
		expect(rec.agreedNgn).toBe(3_500);
		expect(t.userbot.sent.at(-1)?.text).toContain('within our budget');
		expect(t.userbot.sent.at(-1)?.text).toContain("I'll get it approved");
		expect(t.owner[0].text).toContain('quoted ₦3,500');
	});

	it('counters once, then offers pay-per-sale', async () => {
		const t = setup([contacted()]);
		t.userbot.reply('promo_boss', 5, 'It is 5k');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('negotiating');
		expect(t.userbot.sent.at(-1)?.text).toContain('₦4,000');

		t.userbot.reply('promo_boss', 6, 'Last price 5,500');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('partner_offered'); // then the pay-per-sale offer;
	});

	it('never agrees past what is left of the budget', async () => {
		const spent = newChannelRecord({
			username: 'already_paid',
			status: 'paid',
			agreedNgn: 14_000,
			contact: 'x_admin'
		});
		const t = setup([
			contacted(),
			contacted({ username: 'second_one', contact: 'admin_two' }),
			spent
		]);
		t.userbot.reply('promo_boss', 5, '1.4k'); // ₦1,000 left: counter at ₦1,000
		t.userbot.reply('admin_two', 5, '3k'); // far above what's left: decline
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('negotiating');
		expect(t.userbot.sent.find((m) => m.to === 'promo_boss')?.text).toContain('₦1,000');
		expect(t.saved.get('second_one')!.status).toBe('partner_offered');
	});
});

/** A healthy Nigerian channel whose description names its ads contact. */
const healthyChannel = (contact = 'promo_boss') =>
	vi.fn(async () => ({
		title: 'Airdrop Naija',
		about: `Daily airdrops for Naija. Ads: @${contact}`,
		members: 8_000,
		posts: Array.from({ length: 12 }, (_, i) => ({
			id: i + 1,
			views: i % 2 ? 1_700 : 1_500,
			date: new Date(NOW.getTime() - (i + 1) * 8 * HOUR),
			text: i % 2 ? 'Claim this airdrop, withdraw to Opay' : 'New crypto drop',
			reactions: 40,
			forwards: 6
		}))
	}));

describe('payment: always the owner’s one-tap decision', () => {
	it('sends the owner a deal brief with Approve / Don’t pay, and pays nothing itself', async () => {
		const t = setup(
			[contacted({ status: 'agreed', agreedNgn: 3_000 })],
			{},
			fakeUserbot({ channelInfo: healthyChannel() })
		);
		t.userbot.reply('promo_boss', 7, 'Opay 8031234567 Musa Ibrahim');
		await runAutopilotOnce(t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec.status).toBe('awaiting_payment');
		expect(rec.paymentDetails).toContain('8031234567');
		const card = t.owner.at(-1)!;
		expect(card.text).toContain('Approve ₦3,000 for one post in Airdrop Naija');
		expect(card.text).toContain('Expect: roughly 16–48 visits');
		expect(card.text).toContain('Worth it if: it brings 2+ new buyers');
		expect(card.text).toContain('8031234567');
		expect(card.text).toContain('Checks:');
		expect(card.text).not.toContain('⚠');
		expect(card.rows?.[0].map((b) => b.data)).toEqual([
			'ap:paid:airdrop_naija',
			'ap:nopay:airdrop_naija'
		]);
		expect(rec.ownerPromptId).toBe(card ? 100 + t.owner.length : null);
		expect(t.actions).not.toContain('owner_paid');
	});

	it('hands money questions to the owner instead of letting Claude answer', async () => {
		const t = setup([contacted({ status: 'awaiting_payment', agreedNgn: 3_000 })]);
		t.deps.readWithClaude = async () => ({
			intent: 'question',
			priceNgn: null,
			draftReply: 'Yes, soon!'
		});
		t.userbot.reply('promo_boss', 8, 'Have you sent it?');
		await runAutopilotOnce(t.deps);
		expect(t.userbot.sent).toHaveLength(0);
		expect(t.saved.get('airdrop_naija')!.waitingOwner).toBe(true);
		expect(t.owner.at(-1)?.rows?.[0][0].data).toBe('ap:skip:airdrop_naija');
	});

	it('uses Claude’s reading of a messy price, still through the same limits', async () => {
		const t = setup([contacted()]);
		t.deps.readWithClaude = async () => ({ intent: 'price', priceNgn: 3_000, draftReply: null });
		t.userbot.reply('promo_boss', 9, 'three thousand for a pinned post boss');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('agreed');
		expect(t.saved.get('airdrop_naija')!.agreedNgn).toBe(3_000);
	});
});

describe('after the owner pays', () => {
	it('finds the post, then reports views at 48h', async () => {
		const paidAt = new Date(NOW.getTime() - 2 * HOUR).toISOString();
		const userbot = fakeUserbot({
			recentPosts: vi.fn(async () => [
				{ id: 77, views: 2_400, date: new Date(NOW.getTime() - HOUR), text: 'Code TGAIRDRO10' }
			]),
			postById: vi.fn(async () => ({
				id: 77,
				views: 2_400,
				date: new Date(NOW.getTime() - HOUR),
				text: 'Code TGAIRDRO10'
			}))
		});
		const t = setup(
			[contacted({ status: 'paid', agreedNgn: 3_000, code: 'TGAIRDRO10', paidAt })],
			{},
			userbot
		);
		await runAutopilotOnce(t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec.status).toBe('posted');
		expect(t.owner.at(-1)?.text).toContain('https://t.me/airdrop_naija/77');

		t.deps.now = new Date(NOW.getTime() + 25 * HOUR);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.views24h).toBe(2_400);

		t.deps.now = new Date(NOW.getTime() + 49 * HOUR);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('done');
		expect(t.owner.at(-1)?.text).toContain('₦1,250 per 1,000');
	});

	it('reminds the admin after a day without the post', async () => {
		const paidAt = new Date(NOW.getTime() - 25 * HOUR).toISOString();
		const t = setup([contacted({ status: 'paid', agreedNgn: 3_000, paidAt })]);
		await runAutopilotOnce(t.deps);
		expect(t.userbot.sent.at(-1)?.text).toContain('checking on our post');
		expect(t.saved.get('airdrop_naija')!.remindedAt).not.toBeNull();
	});
});

describe('outreach and discovery', () => {
	it('in test mode only messages test contacts', async () => {
		const real = newChannelRecord({ username: 'real_channel', contact: 'real_admin', nigeria: 2 });
		const mine = newChannelRecord({ username: 'my_test', contact: 'owner_test' });
		const t = setup([real, mine], { testMode: true, testContacts: ['owner_test'] });
		await runAutopilotOnce(t.deps);
		expect(t.userbot.sent.map((m) => m.to)).toEqual(['owner_test']);
		expect(t.saved.get('real_channel')!.status).toBe('discovered');
		expect(t.saved.get('my_test')!.status).toBe('contacted');
	});

	it('stops at the daily limit of new admins', async () => {
		const channels = ['aaaa', 'bbbb', 'cccc'].map((u) =>
			newChannelRecord({ username: u, contact: `${u}_admin` })
		);
		const t = setup(channels, { dailyNewContacts: 2 });
		await runAutopilotOnce(t.deps);
		expect(t.userbot.sent).toHaveLength(2);
		await runAutopilotOnce(t.deps);
		expect(t.userbot.sent).toHaveLength(2);
	});

	it('keeps a qualifying channel with a promo contact, skips the rest', async () => {
		const posts = Array.from({ length: 12 }, (_, i) => ({
			id: i + 1,
			views: 1_200,
			date: new Date(NOW.getTime() - (i + 1) * HOUR),
			text: 'Naija post'
		}));
		const userbot = fakeUserbot({
			searchChannels: vi.fn(async () => [
				{ username: 'GoodChannel', title: 'Naija Airdrops', id: '1' },
				{ username: 'quiet_channel', title: 'Quiet', id: '2' }
			]),
			channelInfo: vi.fn(async (username: string) =>
				username === 'goodchannel'
					? {
							title: 'Naija Airdrops',
							about: 'Naija airdrops daily. For promo DM @ads_guy',
							members: 6_000,
							posts
						}
					: {
							title: 'Quiet',
							about: '',
							members: 6_000,
							posts: posts.map((p) => ({ ...p, views: 40 }))
						}
			)
		});
		const t = setup([], { testMode: true, testContacts: [] }, userbot);
		t.state = { ...t.state, lastDiscoveryDay: null };
		const summary = await runAutopilotOnce(t.deps);
		expect(summary.discovered).toBe(1);
		expect(t.saved.get('goodchannel')).toMatchObject({
			status: 'discovered',
			contact: 'ads_guy',
			maxPriceNgn: 3_000
		});
		expect(t.saved.get('quiet_channel')!.status).toBe('skipped');
		expect(t.userbot.sent).toHaveLength(0); // test mode: nobody real is messaged
	});

	it('marks a channel no_reply after three silent days', async () => {
		const t = setup([
			contacted({ contactedAt: new Date(NOW.getTime() - 73 * HOUR).toISOString() })
		]);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('no_reply');
	});
});

describe('one broken channel never stops the rest', () => {
	it('a deleted channel is set aside after three failed runs; others keep going', async () => {
		const userbot = fakeUserbot();
		userbot.bot.incomingFrom = vi.fn(async (username: string) => {
			if (username === 'gone_admin') throw new Error('USERNAME_NOT_OCCUPIED');
			return username === 'promo_boss' ? [{ id: 5, text: 'Promo is 3k', views: 0, date: NOW }] : [];
		});
		const broken = contacted({ username: 'gone_channel', contact: 'gone_admin' });
		const t = setup([broken, contacted()], {}, userbot);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('agreed');
		expect(t.saved.get('gone_channel')!.errorCount).toBe(1);
		expect(t.saved.get('gone_channel')!.status).toBe('contacted');
		await runAutopilotOnce(t.deps);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('gone_channel')!.status).toBe('skipped');
		expect(t.actions.filter((a) => a === 'channel_error')).toHaveLength(3);
	});

	it('a paid channel that keeps failing goes to the owner instead of being dropped', async () => {
		const userbot = fakeUserbot({
			recentPosts: vi.fn(async () => {
				throw new Error('CHANNEL_PRIVATE');
			})
		});
		const paidAt = new Date(NOW.getTime() - 2 * HOUR).toISOString();
		const t = setup([contacted({ status: 'paid', agreedNgn: 3_000, paidAt })], {}, userbot);
		for (let i = 0; i < 3; i += 1) await runAutopilotOnce(t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec.status).toBe('paid');
		expect(rec.waitingOwner).toBe(true);
		expect(t.owner.at(-1)?.text).toContain('Telegram keeps failing');
	});

	it('a failed answer leaves the deal as it was, to retry next run', async () => {
		const userbot = fakeUserbot();
		userbot.bot.sendMessage = vi.fn(async () => {
			throw new Error('USER_IS_BLOCKED');
		});
		const t = setup([contacted()], {}, userbot);
		userbot.reply('promo_boss', 5, 'Promo is 3k');
		await runAutopilotOnce(t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec.status).toBe('contacted');
		expect(rec.lastInboundId).toBe(0);
		expect(rec.errorCount).toBe(1);
	});

	it('an unreadable channel found in search is skipped, the search carries on', async () => {
		const posts = Array.from({ length: 12 }, (_, i) => ({
			id: i + 1,
			views: 1_200,
			date: new Date(NOW.getTime() - (i + 1) * HOUR),
			text: 'Naija post'
		}));
		const userbot = fakeUserbot({
			searchChannels: vi.fn(async () => [
				{ username: 'private_one', title: 'Private', id: '1' },
				{ username: 'good_one', title: 'Naija Airdrops', id: '2' }
			]),
			channelInfo: vi.fn(async (username: string) => {
				if (username === 'private_one') throw new Error('CHANNEL_PRIVATE');
				return { title: 'Naija Airdrops', about: 'Lagos. ads: @ads_guy', members: 6_000, posts };
			})
		});
		const t = setup([], { testMode: true, testContacts: [] }, userbot);
		t.state = { ...t.state, lastDiscoveryDay: null };
		const summary = await runAutopilotOnce(t.deps);
		expect(t.saved.get('private_one')!.status).toBe('skipped');
		expect(summary.discovered).toBe(1);
	});

	it('a clean run clears the error count', async () => {
		const t = setup([contacted({ errorCount: 2 })]);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.errorCount).toBe(0);
	});

	it('"slow down" from Telegram stops the whole run', async () => {
		const userbot = fakeUserbot({
			incomingFrom: vi.fn(async () => {
				throw new TelegramSlowDown(600);
			})
		});
		const t = setup([contacted()], {}, userbot);
		await expect(runAutopilotOnce(t.deps)).rejects.toBeInstanceOf(TelegramSlowDown);
	});
});

describe('quick reply checks between full runs', () => {
	it('reads only chats with unread messages, answers, marks them read, and does nothing else', async () => {
		const quiet = contacted({ username: 'quiet_one', contact: 'quiet_admin' });
		const newcomer = newChannelRecord({ username: 'new_channel', contact: 'new_admin' });
		const t = setup([contacted(), quiet, newcomer]);
		t.userbot.reply('promo_boss', 5, 'Promo is 3k');
		t.deps.mode = 'replies';
		const summary = await runAutopilotOnce(t.deps);
		expect(summary.mode).toBe('replies');
		expect(t.saved.get('airdrop_naija')!.status).toBe('agreed');
		expect(t.userbot.bot.incomingFrom).toHaveBeenCalledTimes(1); // not quiet_admin
		expect(t.userbot.bot.markRead).toHaveBeenCalledWith('promo_boss');
		expect(t.saved.get('new_channel')!.status).toBe('discovered'); // no outreach
		expect(t.userbot.bot.searchChannels).not.toHaveBeenCalled(); // no search
		expect(t.state.lastFullRunAt).toBeNull();
	});

	it('sends what the owner queued (like the post after Approve) straight away', async () => {
		const t = setup([contacted({ status: 'paid', outbox: ['THE POST'] })]);
		t.deps.mode = 'replies';
		await runAutopilotOnce(t.deps);
		expect(t.userbot.sent).toEqual([{ to: 'promo_boss', text: 'THE POST' }]);
	});
});

describe('when to run', () => {
	const at = (iso: string) => new Date(iso);
	const base = {
		settings: { enabled: true, groupsEnabled: true },
		configured: true,
		state: { lastFullRunAt: '2026-10-23T12:02:00Z', pausedUntil: null },
		channels: [] as Array<Pick<ChannelRecord, 'status' | 'contact' | 'outbox'>>
	};
	const talking = [{ status: 'contacted' as const, contact: 'promo_boss', outbox: [] }];

	it('full run at :02, :17, :32 and :47, even when switched off (it then just reports "off")', () => {
		expect(planAutopilotRun({ ...base, now: at('2026-10-23T12:17:00Z') })).toBe('full');
		expect(
			planAutopilotRun({
				...base,
				settings: { enabled: false, groupsEnabled: true },
				now: at('2026-10-23T12:32:00Z')
			})
		).toBe('full');
	});

	it('group runs at :09, :24, :39 and :54 when group chats are on', () => {
		expect(planAutopilotRun({ ...base, now: at('2026-10-23T12:09:00Z') })).toBe('groups');
		expect(
			planAutopilotRun({
				...base,
				settings: { enabled: true, groupsEnabled: false },
				now: at('2026-10-23T12:09:00Z')
			})
		).toBeNull();
	});

	it('quick checks in between only while there are conversations', () => {
		expect(planAutopilotRun({ ...base, now: at('2026-10-23T12:05:00Z') })).toBeNull();
		expect(planAutopilotRun({ ...base, channels: talking, now: at('2026-10-23T12:05:00Z') })).toBe(
			'replies'
		);
		expect(
			planAutopilotRun({
				...base,
				channels: [{ status: 'discovered', contact: 'x', outbox: ['hi'] }],
				now: at('2026-10-23T12:05:00Z')
			})
		).toBe('replies');
	});

	it('a full run right after switching on, and nothing while Telegram asked us to wait', () => {
		expect(
			planAutopilotRun({
				...base,
				state: { lastFullRunAt: null, pausedUntil: null },
				now: at('2026-10-23T12:05:00Z')
			})
		).toBe('full');
		expect(
			planAutopilotRun({
				...base,
				channels: talking,
				state: { ...base.state, pausedUntil: '2026-10-23T13:00:00Z' },
				now: at('2026-10-23T12:05:00Z')
			})
		).toBeNull();
		expect(
			planAutopilotRun({
				...base,
				channels: talking,
				configured: false,
				now: at('2026-10-23T12:05:00Z')
			})
		).toBeNull();
	});
});

describe('finding channels through the day', () => {
	const posts = (views: number, text = 'Naija post') =>
		Array.from({ length: 12 }, (_, i) => ({
			id: i + 1,
			views,
			date: new Date(NOW.getTime() - (i + 1) * HOUR),
			text
		}));

	it('follows a good channel to its similar channels and the channels it promotes', async () => {
		const userbot = fakeUserbot({
			searchChannels: vi.fn(async () => [{ username: 'seed_ng', title: 'Seed', id: '1' }]),
			similarChannels: vi.fn(async (username: string) =>
				username === 'seed_ng' ? [{ username: 'sister_ng', title: 'Sister', id: '2' }] : []
			),
			channelInfo: vi.fn(async (username: string) => ({
				title: username,
				about: `Naija crypto. Ads: @${username}_ads`,
				members: 8_000,
				posts: posts(
					1_500,
					username === 'seed_ng' ? 'Naija: join our partner @promoted_ng' : 'Naija post'
				)
			}))
		});
		const t = setup([], { testMode: true, testContacts: [] }, userbot);
		const summary = await runAutopilotOnce(t.deps);
		expect(summary.discovered).toBe(3);
		expect(t.saved.get('sister_ng')).toMatchObject({
			status: 'discovered',
			keyword: 'via @seed_ng'
		});
		expect(t.saved.get('promoted_ng')).toMatchObject({
			status: 'discovered',
			contact: 'promoted_ng_ads'
		});
	});

	it('passes over channels with no sign of Nigeria, and says why', async () => {
		const userbot = fakeUserbot({
			searchChannels: vi.fn(async () => [{ username: 'global_crypto', title: 'Global', id: '1' }]),
			channelInfo: vi.fn(async () => ({
				title: 'Global Crypto',
				about: 'Ads: @global_ads',
				members: 8_000,
				posts: posts(1_500, 'Crypto signals')
			}))
		});
		const t = setup([], {}, userbot);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('global_crypto')!.status).toBe('skipped');
		expect(t.state.discovery.reasons).toEqual({ 'not Nigerian': 1 });
		expect(discoveryLine(t.state.discovery)).toBe(
			'Search today: looked at 1, 0 good · skipped: not Nigerian 1'
		);
	});

	it('tries three search words per run, rotating, and each word only once a day', async () => {
		const t = setup([], { keywords: ['a1', 'b2', 'c3', 'd4'] });
		await runAutopilotOnce(t.deps);
		expect(t.userbot.bot.searchChannels).toHaveBeenCalledTimes(3);
		await runAutopilotOnce(t.deps);
		expect(t.userbot.bot.searchChannels).toHaveBeenCalledTimes(4); // d4 only; the rest done today
		expect(vi.mocked(t.userbot.bot.searchChannels).mock.calls.map((c) => c[0])).toEqual([
			'a1',
			'b2',
			'c3',
			'd4'
		]);
		t.deps.now = new Date(NOW.getTime() + 24 * HOUR); // next day carries on from where it stopped
		await runAutopilotOnce(t.deps);
		expect(vi.mocked(t.userbot.bot.searchChannels).mock.calls.at(-3)?.[0]).toBe('a1');
	});

	it('stops looking once it has enough good channels for the day', async () => {
		const userbot = fakeUserbot({
			searchChannels: vi.fn(async (keyword: string) =>
				Array.from({ length: 20 }, (_, i) => ({
					username: `${keyword}_ng${i}`,
					title: 'x',
					id: `${i}`
				}))
			),
			channelInfo: vi.fn(async (username: string) => ({
				title: username,
				about: `Naija. Ads: @${username}_ads`,
				members: 8_000,
				posts: posts(1_500)
			}))
		});
		const t = setup([], { dailyNewContacts: 2, testMode: true }, userbot);
		for (let i = 0; i < 3; i += 1) await runAutopilotOnce(t.deps);
		expect(t.state.discovery.found).toBe(15); // target: max(15, 3 × daily contacts)
	});
});

describe('checks before we message or pay anyone', () => {
	it('puts warnings on the card: unknown admin, bought-looking views, a payee who is someone else', async () => {
		const userbot = fakeUserbot({
			channelInfo: vi.fn(async () => ({
				title: 'Airdrop Naija',
				about: 'Naija airdrops. Ads: @someone_else',
				members: 8_000,
				posts: Array.from({ length: 12 }, (_, i) => ({
					id: i + 1,
					views: 1_600,
					date: new Date(NOW.getTime() - (i + 1) * 8 * HOUR),
					text: 'Naija airdrop',
					reactions: 0,
					forwards: 0
				}))
			}))
		});
		const other = newChannelRecord({
			username: 'other_channel',
			status: 'paid',
			paymentDetails: 'GTB 0123456789 Ada Obi'
		});
		const t = setup([contacted({ status: 'agreed', agreedNgn: 3_000 }), other], {}, userbot);
		t.userbot.reply('promo_boss', 7, 'GTB 0123456789 Ada Obi');
		await runAutopilotOnce(t.deps);
		const card = t.owner.at(-1)!.text;
		expect(card).toContain("@promo_boss is not named in the channel's description");
		expect(card).toContain('Almost no reactions or shares');
		expect(card).toContain('Views are suspiciously even');
		expect(card).toContain(
			"The account name doesn't match the admin's Telegram name (Musa Ibrahim)"
		);
		expect(card).toContain('The same account number was given for @other_channel');
		expect(t.owner.at(-1)!.rows?.[0]).toHaveLength(2); // warnings: the owner still decides
	});

	it('an admin Telegram labels as a scam gets a DO NOT PAY card with no Approve button', async () => {
		const userbot = fakeUserbot({
			channelInfo: healthyChannel(),
			resolvePerson: vi.fn(async (username: string) => ({
				username,
				userId: '1',
				name: 'Musa Ibrahim',
				scam: true,
				fake: false
			}))
		});
		const t = setup([contacted({ status: 'agreed', agreedNgn: 3_000 })], {}, userbot);
		t.userbot.reply('promo_boss', 7, 'Opay 8031234567 Musa Ibrahim');
		await runAutopilotOnce(t.deps);
		const card = t.owner.at(-1)!;
		expect(card.text).toMatch(/^⛔ DO NOT PAY: Telegram labels @promo_boss as SCAM/);
		expect(card.rows?.[0].map((b) => b.data)).toEqual(['ap:nopay:airdrop_naija']);
	});

	it('checks a hand-added channel before the first message', async () => {
		const manual = (username: string, contact: string) =>
			newChannelRecord({ username, contact, manual: true, maxPriceNgn: 1_000 });
		const userbot = fakeUserbot({
			channelInfo: vi.fn(async (username: string) => {
				if (username === 'typo_channel') throw new Error('USERNAME_NOT_OCCUPIED');
				return healthyChannel(username === 'scam_channel' ? 'scammer' : 'good_admin')();
			}),
			resolvePerson: vi.fn(async (username: string) => ({
				username,
				userId: '1',
				name: 'X',
				scam: username === 'scammer',
				fake: false
			}))
		});
		const t = setup(
			[
				manual('typo_channel', 'any_admin'),
				manual('scam_channel', 'scammer'),
				manual('good_channel', 'good_admin')
			],
			{},
			userbot
		);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('typo_channel')!.status).toBe('skipped');
		expect(t.saved.get('scam_channel')!.status).toBe('skipped');
		expect(t.saved.get('good_channel')!.status).toBe('contacted');
		expect(t.saved.get('good_channel')!.checks?.warnings).toEqual([]);
		expect(t.userbot.sent.map((m) => m.to)).toEqual(['good_admin']);
		expect(t.owner.map((m) => m.text).join('\n')).toContain("I couldn't open @typo_channel");
		expect(t.owner.map((m) => m.text).join('\n')).toContain('Telegram labels @scammer as SCAM');
	});

	it('never picks an ads contact Telegram labels as a scam when searching', async () => {
		const userbot = fakeUserbot({
			searchChannels: vi.fn(async () => [{ username: 'naija_drops', title: 'x', id: '1' }]),
			channelInfo: healthyChannel('fake_admin'),
			resolvePerson: vi.fn(async (username: string) => ({
				username,
				userId: '1',
				name: 'X',
				scam: false,
				fake: username === 'fake_admin'
			}))
		});
		const t = setup([], {}, userbot);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('naija_drops')!.status).toBe('skipped');
		expect(t.state.discovery.reasons).toEqual({ 'admin labelled scam by Telegram': 1 });
	});

	it('spots a paid post that was deleted and tells the owner', async () => {
		const postedAt = new Date(NOW.getTime() - 5 * HOUR).toISOString();
		const userbot = fakeUserbot({ postById: vi.fn(async () => null) });
		const t = setup(
			[contacted({ status: 'posted', agreedNgn: 3_000, postId: 77, postedAt })],
			{},
			userbot
		);
		await runAutopilotOnce(t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec.status).toBe('done');
		expect(rec.checks?.warnings).toContain('Deleted our paid post after about 5h');
		expect(t.owner.at(-1)?.text).toContain('deleted our post about 5h after it went up');
		expect(t.actions).toContain('post_deleted');
	});
});

describe('one seller, several channels', () => {
	const seller = (username: string, over: Partial<ChannelRecord> = {}) =>
		newChannelRecord({
			username,
			contact: 'tgowner999',
			nigeria: 2,
			avgViews: 1_500,
			members: 20_000,
			checks: {
				at: NOW.toISOString(),
				warnings: [],
				facts: {
					avgViews: 1_500,
					viewShare: 7.5,
					engagementPer1k: 20,
					postsLastWeek: 10,
					nigerianPosts: 8,
					nichePosts: 8,
					sponsoredPosts: 1,
					postsChecked: 12
				}
			},
			...over
		});

	it('messages the seller about one channel only', async () => {
		const t = setup([seller('chan_a'), seller('chan_b'), seller('chan_c')]);
		await runAutopilotOnce(t.deps);
		expect(t.userbot.sent).toHaveLength(1);
		await runAutopilotOnce(t.deps);
		expect(t.userbot.sent).toHaveLength(1); // still talking about the first one
	});

	it("one reply is applied to one deal, never to all of the seller's channels", async () => {
		const t = setup([
			seller('chan_a', { status: 'contacted', maxPriceNgn: 4_000 }),
			seller('chan_b', { status: 'contacted', maxPriceNgn: 4_000 })
		]);
		t.userbot.reply('tgowner999', 5, '3k');
		await runAutopilotOnce(t.deps);
		const statuses = ['chan_a', 'chan_b'].map((u) => t.saved.get(u)!.status).sort();
		expect(statuses).toEqual(['agreed', 'contacted']);
	});

	it('skips found channels whose members look bought or whose posts are not Nigerian', async () => {
		const bought = seller('bought_members', {
			contact: 'a_admin',
			members: 856_047,
			checks: {
				at: NOW.toISOString(),
				warnings: [],
				facts: {
					avgViews: 592,
					viewShare: 0.1,
					engagementPer1k: 7,
					postsLastWeek: 12,
					nigerianPosts: 0,
					nichePosts: 8,
					sponsoredPosts: 1,
					postsChecked: 12
				}
			}
		});
		const t = setup([bought]);
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('bought_members')!.status).toBe('skipped');
		expect(t.saved.get('bought_members')!.log.at(-1)).toContain('members look bought');
		expect(t.userbot.sent).toHaveLength(0);
	});
});

describe('channels the owner asks to try', () => {
	const ngPosts = (views: number) =>
		Array.from({ length: 12 }, (_, i) => ({
			id: i + 1,
			views: i % 2 ? views + 100 : views - 100,
			date: new Date(NOW.getTime() - (i + 1) * 8 * HOUR),
			text: 'Naija airdrop, withdraw to Opay',
			reactions: 30,
			forwards: 4
		}));

	function withPicks(t: ReturnType<typeof setup>, usernames: string[]) {
		let picks = usernames.map((username) => ({ username, via: 'your list' }));
		t.deps.store.getOwnerPicks = async () => picks;
		t.deps.store.settleOwnerPicks = async (done, found) => {
			picks = [...found, ...picks.filter((p) => !done.includes(p.username))];
		};
		return () => picks;
	}

	it('checks each pick, finds the ads contact, follows group chats to their channel, and sums up', async () => {
		const userbot = fakeUserbot({
			channelInfo: vi.fn(async (username: string) => {
				if (username === 'naija_chat' || username === 'nowhere') throw new Error('NOT_A_CHANNEL');
				if (username === 'no_contact_ng')
					return { title: 'No Contact', about: 'Naija drops', members: 5_000, posts: ngPosts(900) };
				return {
					title: username,
					about: `Naija. Ads: @${username}_ads`,
					members: 900_000,
					posts: ngPosts(1_500)
				};
			}),
			linkedChannel: vi.fn(async (username: string) =>
				username === 'naija_chat' ? 'naija_main' : null
			)
		});
		const t = setup([], {}, userbot);
		const remaining = withPicks(t, ['good_ng', 'no_contact_ng', 'naija_chat', 'nowhere']);
		await runAutopilotOnce(t.deps);
		const good = t.saved.get('good_ng')!;
		expect(good).toMatchObject({ status: 'contacted', manual: true, contact: 'good_ng_ads' }); // messaged
		expect(good.checks?.warnings.join(' ')).toContain('members see a post'); // bought members: warned, not skipped
		expect(t.saved.get('no_contact_ng')!.status).toBe('skipped');
		expect(remaining()).toEqual([{ username: 'naija_main', via: 'channel of @naija_chat' }]);
		const summary = t.owner.find((m) => m.text.startsWith('📋 Your channels to try'))!.text;
		expect(summary).toContain('✅ Ready to message: @good_ng (⚠ 1)');
		expect(summary).toContain('❓ No ads contact in their description: @no_contact_ng');
		expect(summary).toContain("ℹ️ @naija_chat also has a channel, @naija_main: I'll try it next");
		expect(summary).toContain("⛔ Couldn't use: @nowhere (not a public channel");
	});

	it('picking channels the search had set aside lets them through, still one deal per seller', async () => {
		const seller = (username: string) =>
			newChannelRecord({ username, contact: 'tgowner999', status: 'discovered', members: 850_000 });
		const userbot = fakeUserbot({
			channelInfo: vi.fn(async (username: string) => ({
				title: username,
				about: 'Naija news. Promo: @tgowner999',
				members: 850_000,
				posts: ngPosts(1_500)
			}))
		});
		const t = setup([seller('chan_a'), seller('chan_b')], {}, userbot);
		withPicks(t, ['chan_a', 'chan_b']);
		await runAutopilotOnce(t.deps);
		expect(['chan_a', 'chan_b'].map((u) => t.saved.get(u)!.manual)).toEqual([true, true]);
		expect(t.userbot.sent.map((m) => m.to)).toEqual(['tgowner999']); // one at a time
		expect(t.owner.at(-1)!.text).toContain('@tgowner999 sells posts for 2 of these');
	});

	it('leaves channels already in a deal alone', async () => {
		const t = setup([contacted()]);
		withPicks(t, ['airdrop_naija']);
		await runAutopilotOnce(t.deps);
		expect(t.owner.at(-1)!.text).toContain('Already in progress: @airdrop_naija (contacted)');
	});
});

describe('pay-per-sale offer for admins we can’t afford', () => {
	it('offers a share of sales instead of walking away, then asks for bank details on yes', async () => {
		const t = setup([contacted({ maxPriceNgn: 4_000 })]);
		t.userbot.reply('promo_boss', 5, 'Promo is 9k');
		await runAutopilotOnce(t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec.status).toBe('partner_offered');
		expect(t.userbot.sent.at(-1)?.text).toContain('earn 10% of every sale your readers make');
		expect(t.actions).toContain('partner_offered');

		t.userbot.reply('promo_boss', 6, 'Ok, that works');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.partnerAccepted).toBe(true);
		expect(t.userbot.sent.at(-1)?.text).toContain('send the bank details for your weekly payouts');
	});

	it('bank details after the offer bring the owner a partner card (nothing paid)', async () => {
		const t = setup(
			[contacted({ status: 'partner_offered', quotedNgn: 9_000, maxPriceNgn: 4_000 })],
			{},
			fakeUserbot({ channelInfo: healthyChannel() })
		);
		t.userbot.reply('promo_boss', 7, 'Opay 8031234567 Musa Ibrahim');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('partner_pending');
		const card = t.owner.at(-1)!;
		expect(card.text).toContain('🤝 Approve a pay-per-sale partner: Airdrop Naija');
		expect(card.text).toContain('They asked ₦9,000, above our limit of ₦4,000');
		expect(card.text).toContain('Nothing is paid now');
		expect(card.rows?.[0].map((b) => b.data)).toEqual([
			'ap:partner:airdrop_naija',
			'ap:nopartner:airdrop_naija'
		]);
	});

	it('a lower price after the offer goes the normal way; still too high gets a polite note', async () => {
		const t = setup([
			contacted({ status: 'partner_offered', maxPriceNgn: 4_000 }),
			contacted({
				username: 'other_ch',
				contact: 'other_admin',
				status: 'partner_offered',
				maxPriceNgn: 4_000
			})
		]);
		t.userbot.reply('promo_boss', 8, 'Ok 3.5k then');
		t.userbot.reply('other_admin', 8, 'Make it 7k');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('agreed');
		expect(t.saved.get('other_ch')!.status).toBe('partner_offered');
		expect(t.userbot.sent.find((m) => m.to === 'other_admin')?.text).toContain(
			'still above our budget'
		);
	});

	it('a rate card far above our limit gets the offer; one with an option that fits goes to the owner', async () => {
		const t = setup([
			contacted({ maxPriceNgn: 5_000 }),
			contacted({ username: 'cheap_card', contact: 'cheap_admin', maxPriceNgn: 5_000 })
		]);
		t.userbot.reply('promo_boss', 5, 'Our rates: N50k to X only, N100k to all platforms');
		t.userbot.reply('cheap_admin', 5, 'Rates: N4,000 for 12 hours, N7,000 for 24 hours');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')).toMatchObject({
			status: 'partner_offered',
			quotedNgn: 50_000
		});
		expect(t.saved.get('cheap_card')!.waitingOwner).toBe(true);
	});

	it('with the offer switched off, too expensive is declined as before', async () => {
		const t = setup([contacted({ maxPriceNgn: 4_000 })], { partnerEnabled: false });
		t.userbot.reply('promo_boss', 5, '9k');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('declined');
	});
});

describe('weekly partner payouts', () => {
	const MONDAY = new Date('2026-10-26T10:30:00Z'); // 11:30 WAT
	const partner = (over: Partial<ChannelRecord> = {}) =>
		contacted({
			status: 'posted',
			deal: 'partner',
			code: 'TGAIRDRO10',
			partnerPercent: 10,
			paidAt: '2026-10-12T09:00:00Z',
			partnerPaidUntil: '2026-10-12T09:00:00Z',
			partnerUntil: '2026-11-11T09:00:00Z',
			paymentDetails: 'Opay 8031234567 Musa Ibrahim',
			...over
		});

	it('on Monday sends one card per partner for sales up to two days ago', async () => {
		const t = setup([partner()]);
		const sales = vi.fn(async () => ({ orders: 4, salesNgn: 38_000 }));
		t.deps.partnerSales = sales;
		t.deps.now = MONDAY;
		await runAutopilotOnce(t.deps);
		expect(sales).toHaveBeenCalledWith(
			'TGAIRDRO10',
			new Date('2026-10-12T09:00:00Z'),
			new Date(MONDAY.getTime() - 48 * HOUR)
		);
		const card = t.owner.find((m) => m.text.startsWith('💰 Partner payout'))!;
		expect(card.text).toContain('4 orders with code TGAIRDRO10');
		expect(card.text).toContain('₦38,000 in sales');
		expect(card.text).toContain('Their 10%: ₦3,800');
		expect(card.rows?.[0].map((b) => b.data)).toEqual([
			'ap:ppaid:airdrop_naija',
			'ap:pskip:airdrop_naija'
		]);
		expect(t.saved.get('airdrop_naija')!.partnerPayout?.amountNgn).toBe(3_800);

		await runAutopilotOnce(t.deps); // same day: no second card
		expect(t.owner.filter((m) => m.text.startsWith('💰 Partner payout'))).toHaveLength(1);
	});

	it('not on other days, and tiny amounts wait for next week', async () => {
		const t = setup([partner()]);
		t.deps.partnerSales = vi.fn(async () => ({ orders: 1, salesNgn: 900 }));
		await runAutopilotOnce(t.deps); // Thursday
		expect(t.deps.partnerSales).not.toHaveBeenCalled();
		t.deps.now = MONDAY;
		await runAutopilotOnce(t.deps); // ₦90: carried over
		expect(t.owner.some((m) => m.text.startsWith('💰'))).toBe(false);
	});

	it('closes a finished partner deal with no sales', async () => {
		const t = setup([partner({ partnerUntil: '2026-10-20T09:00:00Z' })]);
		t.deps.partnerSales = vi.fn(async () => ({ orders: 0, salesNgn: 0 }));
		t.deps.now = MONDAY;
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.partnerPaidUntil).toBe('2026-10-20T09:00:00Z');
	});
});
