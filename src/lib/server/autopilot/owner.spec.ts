import { describe, expect, it, vi } from 'vitest';
import { handleOwnerUpdate, type OwnerDeps } from './owner';
import { AUTOPILOT_DEFAULTS, type AutopilotSettings } from './settings';
import { newChannelRecord, type ChannelRecord } from './state';

const OWNER = '555';

function setup(settings: Partial<AutopilotSettings> = {}, channels: ChannelRecord[] = []) {
	let current: AutopilotSettings = { ...AUTOPILOT_DEFAULTS, ownerChatId: OWNER, ...settings };
	const saved = new Map(channels.map((rec) => [rec.username, rec]));
	const sent: Array<{ chat: string; text: string }> = [];
	const edits: string[] = [];
	const answers: Array<string | undefined> = [];
	const deps: OwnerDeps = {
		getSettings: async () => current,
		saveSettings: async (next) => void (current = next),
		listChannels: async () => [...saved.values()].map((rec) => structuredClone(rec)),
		// Like the real store: refuse a save based on an older copy.
		saveChannel: async (rec) => {
			const current = saved.get(rec.username);
			if (current && current.rev !== rec.rev) return false;
			saved.set(rec.username, { ...structuredClone(rec), rev: rec.rev + 1 });
			rec.rev += 1;
			return true;
		},
		logAction: vi.fn(async () => {}),
		ensureCode: vi.fn(async () => 'TGAIRDRO10'),
		trackedLink: () => 'https://smm.fastaccs.com/platforms/x?utm_source=telegram',
		bookSpend: vi.fn(async () => {}),
		send: async (chat, text) => void sent.push({ chat, text }),
		edit: async (_chat, _id, text) => void edits.push(text),
		answer: async (_id, text) => void answers.push(text),
		now: () => new Date('2026-10-22T10:00:00Z')
	};
	return {
		deps,
		saved,
		sent,
		edits,
		answers,
		get settings() {
			return current;
		}
	};
}

const tap = (data: string, chat = OWNER) => ({
	callback_query: {
		id: 'cb1',
		data,
		message: { message_id: 9, chat: { id: chat }, text: 'card' }
	}
});
const say = (text: string, chat = OWNER, replyTo?: number) => ({
	message: {
		message_id: 1,
		chat: { id: chat },
		text,
		...(replyTo ? { reply_to_message: { message_id: replyTo } } : {})
	}
});

const awaiting = () =>
	newChannelRecord({
		username: 'airdrop_naija',
		contact: 'promo_boss',
		status: 'awaiting_payment',
		agreedNgn: 3_000,
		paymentDetails: 'Opay 8031234567 Musa'
	});

describe('connecting the owner', () => {
	it('binds only with the one-time code', async () => {
		const t = setup({ ownerChatId: null, bindCode: 'secret123' });
		await handleOwnerUpdate(say('/start wrong', '42'), t.deps);
		expect(t.settings.ownerChatId).toBeNull();
		await handleOwnerUpdate(say('/start secret123', '42'), t.deps);
		expect(t.settings.ownerChatId).toBe('42');
		expect(t.settings.bindCode).toBeNull();
	});

	it('explains an out-of-date link while nobody is connected', async () => {
		const t = setup({ ownerChatId: null, bindCode: 'current' });
		await handleOwnerUpdate(say('/start oldcode', '42'), t.deps);
		expect(t.settings.ownerChatId).toBeNull();
		expect(t.sent[0].text).toContain('out of date');
	});

	it('once connected, a stranger’s /start gets silence and the owner is told they are connected', async () => {
		const t = setup();
		await handleOwnerUpdate(say('/start whatever', '999'), t.deps);
		expect(t.sent).toHaveLength(0);
		await handleOwnerUpdate(say('/start'), t.deps);
		expect(t.sent[0].text).toContain('already connected');
	});

	it('ignores everyone else', async () => {
		const t = setup({ enabled: true });
		await handleOwnerUpdate(say('/pause', '999'), t.deps);
		expect(t.settings.enabled).toBe(true);
		expect(t.sent).toHaveLength(0);
	});
});

describe('the one-tap payment approval', () => {
	it('on Approve: makes the code, sends the post, books the spend', async () => {
		const t = setup({}, [awaiting()]);
		await handleOwnerUpdate(tap('ap:paid:airdrop_naija'), t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec.status).toBe('paid');
		expect(rec.code).toBe('TGAIRDRO10');
		expect(rec.outbox[0]).toContain('Payment sent');
		expect(rec.outbox[0]).toContain('TGAIRDRO10');
		expect(t.deps.bookSpend).toHaveBeenCalledWith('airdrop_naija', 3_000, expect.anything());
		expect(t.edits[0]).toContain('Approved and paid');
	});

	it('a second tap does nothing (no double booking)', async () => {
		const t = setup({}, [awaiting()]);
		await handleOwnerUpdate(tap('ap:paid:airdrop_naija'), t.deps);
		await handleOwnerUpdate(tap('ap:paid:airdrop_naija'), t.deps);
		expect(t.deps.bookSpend).toHaveBeenCalledTimes(1);
		expect(t.answers.at(-1)).toBe('Already handled.');
	});

	it('two taps at once book the spend only once', async () => {
		const t = setup({}, [awaiting()]);
		await Promise.all([
			handleOwnerUpdate(tap('ap:paid:airdrop_naija'), t.deps),
			handleOwnerUpdate(tap('ap:paid:airdrop_naija'), t.deps)
		]);
		expect(t.deps.bookSpend).toHaveBeenCalledTimes(1);
		expect(t.saved.get('airdrop_naija')!.outbox).toHaveLength(1);
	});

	it('a tap from another chat is ignored', async () => {
		const t = setup({}, [awaiting()]);
		await handleOwnerUpdate(tap('ap:paid:airdrop_naija', '999'), t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('awaiting_payment');
		expect(t.deps.bookSpend).not.toHaveBeenCalled();
	});

	it('on Don’t pay: cancels politely, books nothing', async () => {
		const t = setup({}, [awaiting()]);
		await handleOwnerUpdate(tap('ap:nopay:airdrop_naija'), t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec.status).toBe('skipped');
		expect(rec.outbox[0]).toContain('cancel');
		expect(t.deps.bookSpend).not.toHaveBeenCalled();
	});

	it('cannot skip a deal that is already paid', async () => {
		const t = setup({}, [{ ...awaiting(), status: 'paid' }]);
		await handleOwnerUpdate(tap('ap:skip:airdrop_naija'), t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('paid');
	});
});

describe('owner messages', () => {
	it('a reply to a channel prompt is queued for that admin', async () => {
		const rec = {
			...awaiting(),
			status: 'contacted' as const,
			ownerPromptId: 321,
			waitingOwner: true
		};
		const t = setup({}, [rec]);
		await handleOwnerUpdate(say('We sell X accounts, yes', OWNER, 321), t.deps);
		expect(t.saved.get('airdrop_naija')!.outbox).toEqual(['We sell X accounts, yes']);
		expect(t.saved.get('airdrop_naija')!.waitingOwner).toBe(false);
	});

	it('/pause and /resume', async () => {
		const t = setup({ enabled: true });
		await handleOwnerUpdate(say('/pause'), t.deps);
		expect(t.settings.enabled).toBe(false);
		await handleOwnerUpdate(say('/resume'), t.deps);
		expect(t.settings.enabled).toBe(true);
	});
});

describe('pay-per-sale partners', () => {
	const pending = () =>
		newChannelRecord({
			username: 'airdrop_naija',
			contact: 'promo_boss',
			status: 'partner_pending',
			quotedNgn: 9_000,
			paymentDetails: 'Opay 8031234567 Musa'
		});

	it('approving sends the post and their code, fixes the terms, and pays nothing', async () => {
		const t = setup({ partnerPercent: 10, partnerDays: 30, codeDays: 14 }, [pending()]);
		await handleOwnerUpdate(tap('ap:partner:airdrop_naija'), t.deps);
		const rec = t.saved.get('airdrop_naija')!;
		expect(rec).toMatchObject({
			deal: 'partner',
			status: 'paid',
			partnerPercent: 10,
			code: 'TGAIRDRO10'
		});
		expect(rec.partnerUntil).toBe('2026-11-21T10:00:00.000Z');
		expect(rec.outbox[0]).toContain('you earn 10% of every order that uses it until 21 November');
		expect(vi.mocked(t.deps.ensureCode).mock.calls[0][1]).toMatchObject({ codeDays: 30 });
		expect(t.deps.bookSpend).not.toHaveBeenCalled();
	});

	it('a payout tap books the money once and tells them', async () => {
		const rec = {
			...pending(),
			status: 'posted' as const,
			deal: 'partner' as const,
			partnerPaidUntil: '2026-10-12T09:00:00Z',
			partnerPayout: {
				from: '2026-10-12T09:00:00Z',
				to: '2026-10-24T10:30:00Z',
				orders: 4,
				salesNgn: 38_000,
				amountNgn: 3_800
			}
		};
		const t = setup({}, [rec]);
		await handleOwnerUpdate(tap('ap:ppaid:airdrop_naija'), t.deps);
		await handleOwnerUpdate(tap('ap:ppaid:airdrop_naija'), t.deps);
		const saved = t.saved.get('airdrop_naija')!;
		expect(saved.partnerEarnedNgn).toBe(3_800);
		expect(saved.partnerPaidUntil).toBe('2026-10-24T10:30:00Z');
		expect(saved.partnerPayout).toBeNull();
		expect(saved.outbox.at(-1)).toContain('Sent you ₦3,800 for 4 sales');
		expect(t.deps.bookSpend).toHaveBeenCalledTimes(1);
		expect(t.deps.bookSpend).toHaveBeenCalledWith('airdrop_naija', 3_800, expect.anything());
	});

	it('"Not now" carries the payout over without booking anything', async () => {
		const rec = {
			...pending(),
			status: 'posted' as const,
			deal: 'partner' as const,
			partnerPaidUntil: '2026-10-12T09:00:00Z',
			partnerPayout: {
				from: '2026-10-12T09:00:00Z',
				to: '2026-10-24T10:30:00Z',
				orders: 1,
				salesNgn: 5_000,
				amountNgn: 500
			}
		};
		const t = setup({}, [rec]);
		await handleOwnerUpdate(tap('ap:pskip:airdrop_naija'), t.deps);
		expect(t.saved.get('airdrop_naija')).toMatchObject({
			partnerPayout: null,
			partnerPaidUntil: '2026-10-12T09:00:00Z'
		});
		expect(t.deps.bookSpend).not.toHaveBeenCalled();
	});

	it('declining a partner tells them politely', async () => {
		const t = setup({}, [pending()]);
		await handleOwnerUpdate(tap('ap:nopartner:airdrop_naija'), t.deps);
		expect(t.saved.get('airdrop_naija')!.status).toBe('skipped');
		expect(t.saved.get('airdrop_naija')!.outbox[0]).toContain('cancel');
	});
});
