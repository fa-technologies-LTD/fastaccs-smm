import { describe, expect, it, vi } from 'vitest';
import type { BotButton } from './bot';
import { runAutopilotOnce, type EngineDeps } from './engine';
import { AUTOPILOT_DEFAULTS, type AutopilotSettings } from './settings';
import { newChannelRecord, type ChannelRecord, type RunState } from './state';
import type { ChannelPost, UserbotPort } from './userbot';

const NOW = new Date('2026-10-22T10:00:00Z'); // 11:00 WAT, before the evening report
const HOUR = 3_600_000;

function fakeUserbot(overrides: Partial<UserbotPort> = {}) {
	const sent: Array<{ to: string; text: string }> = [];
	const inbox = new Map<string, ChannelPost[]>();
	const bot: UserbotPort = {
		searchChannels: vi.fn(async () => []),
		channelInfo: vi.fn(async () => ({ about: '', members: 0, posts: [] })),
		recentPosts: vi.fn(async () => []),
		resolvePerson: vi.fn(async (username: string) => ({ username, userId: '1' })),
		sendMessage: vi.fn(async (to: string, text: string) => {
			sent.push({ to, text });
			return sent.length;
		}),
		incomingFrom: vi.fn(async (username: string, sinceId: number) =>
			(inbox.get(username) ?? []).filter((m) => m.id > sinceId)
		),
		close: vi.fn(async () => {}),
		...overrides
	};
	const reply = (from: string, id: number, text: string) =>
		inbox.set(from, [...(inbox.get(from) ?? []), { id, text, views: 0, date: NOW }]);
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
		lastDiscoveryDay: '2026-10-22', // skip discovery unless a test resets it
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
			saveChannel: async (rec) => {
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

	it('counters once, then declines', async () => {
		const t = setup([contacted()]);
		t.userbot.reply('promo_boss', 5, 'It is 5k');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('negotiating');
		expect(t.userbot.sent.at(-1)?.text).toContain('₦4,000');

		t.userbot.reply('promo_boss', 6, 'Last price 5,500');
		await runAutopilotOnce(t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('declined');
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
		expect(t.saved.get('second_one')!.status).toBe('declined');
	});
});

describe('payment: always the owner’s one-tap decision', () => {
	it('sends the owner a deal brief with Approve / Don’t pay, and pays nothing itself', async () => {
		const t = setup([contacted({ status: 'agreed', agreedNgn: 3_000 })]);
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
			])
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
			text: 'post'
		}));
		const userbot = fakeUserbot({
			searchChannels: vi.fn(async () => [
				{ username: 'GoodChannel', title: 'Naija Airdrops', id: '1' },
				{ username: 'quiet_channel', title: 'Quiet', id: '2' }
			]),
			channelInfo: vi.fn(async (username: string) =>
				username === 'goodchannel'
					? { about: 'For promo DM @ads_guy', members: 6_000, posts }
					: { about: '', members: 6_000, posts: posts.map((p) => ({ ...p, views: 40 })) }
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
