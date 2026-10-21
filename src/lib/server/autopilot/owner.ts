import { autopilotCopy, postCopy } from './rules';
import type { AutopilotSettings } from './settings';
import type { ChannelRecord } from './state';

/**
 * What the owner does in the bot: bind their chat, approve or refuse a payment (one tap), skip a
 * channel, answer an admin by replying to the bot's message, pause/resume, ask for status.
 * Only the bound owner chat is ever obeyed.
 */

export interface TelegramUpdate {
	message?: {
		message_id: number;
		chat: { id: number | string };
		text?: string;
		reply_to_message?: { message_id: number };
	};
	callback_query?: {
		id: string;
		data?: string;
		message?: { message_id: number; chat: { id: number | string }; text?: string };
	};
}

export interface OwnerDeps {
	getSettings(): Promise<AutopilotSettings>;
	saveSettings(settings: AutopilotSettings): Promise<void>;
	listChannels(): Promise<ChannelRecord[]>;
	saveChannel(rec: ChannelRecord, note?: string): Promise<boolean>;
	logAction(action: string, username: string, detail?: Record<string, unknown>): Promise<void>;
	ensureCode(
		username: string,
		settings: AutopilotSettings,
		existing: string | null
	): Promise<string>;
	trackedLink(username: string, settings: AutopilotSettings): string;
	bookSpend(username: string, amountNgn: number, settings: AutopilotSettings): Promise<void>;
	send(chatId: string, text: string): Promise<void>;
	edit(chatId: string, messageId: number, text: string): Promise<void>;
	answer(callbackId: string, text?: string): Promise<void>;
	now(): Date;
}

const BUSY = 'The autopilot was updating this deal. Please tap again.';
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

function statusText(channels: ChannelRecord[], settings: AutopilotSettings): string {
	const count = (s: ChannelRecord['status'][]) =>
		channels.filter((r) => s.includes(r.status)).length;
	const spent = channels
		.filter((r) => ['paid', 'posted', 'done'].includes(r.status))
		.reduce((s, r) => s + (r.agreedNgn ?? 0), 0);
	return [
		`Autopilot is ${settings.enabled ? 'ON' : 'OFF'}${settings.testMode ? ' (test mode)' : ''}.`,
		`Found: ${count(['discovered'])} · talking: ${count(['contacted', 'negotiating'])} · waiting on you: ${channels.filter((r) => r.waitingOwner || r.status === 'awaiting_payment').length}`,
		`Live posts: ${count(['paid', 'posted'])} · finished: ${count(['done'])}`,
		`Spent ${naira(spent)} of ${naira(settings.budgetNgn)}`
	].join('\n');
}

export async function handleOwnerUpdate(update: TelegramUpdate, deps: OwnerDeps): Promise<void> {
	const settings = await deps.getSettings();

	if (update.message) {
		const chatId = String(update.message.chat.id);
		const text = (update.message.text ?? '').trim();
		if (text.startsWith('/start')) {
			const code = text.split(/\s+/)[1] ?? '';
			if (settings.bindCode && code === settings.bindCode) {
				await deps.saveSettings({ ...settings, ownerChatId: chatId, bindCode: null });
				await deps.send(
					chatId,
					"✅ Connected. I'll send your approvals, alerts and the evening report here."
				);
			}
			return;
		}
		if (!settings.ownerChatId || chatId !== settings.ownerChatId) return; // strangers are ignored
		if (text === '/status')
			return deps.send(chatId, statusText(await deps.listChannels(), settings));
		if (text === '/pause') {
			await deps.saveSettings({ ...settings, enabled: false });
			return deps.send(chatId, '⏸ Paused. Nothing will be sent until you /resume.');
		}
		if (text === '/resume') {
			await deps.saveSettings({ ...settings, enabled: true });
			return deps.send(chatId, '▶️ Running again.');
		}
		const replyTo = update.message.reply_to_message?.message_id;
		if (replyTo && text) {
			const rec = (await deps.listChannels()).find((r) => r.ownerPromptId === replyTo);
			if (!rec)
				return deps.send(
					chatId,
					"I couldn't tell which channel that's for. Reply directly to my message about it."
				);
			rec.outbox = [...rec.outbox, text.slice(0, 1500)];
			rec.waitingOwner = false;
			if (!(await deps.saveChannel(rec, 'owner replied'))) {
				return deps.send(chatId, BUSY);
			}
			await deps.logAction('owner_reply', rec.username);
			return deps.send(chatId, `👍 I'll send that to @${rec.username} within 15 minutes.`);
		}
		return;
	}

	const query = update.callback_query;
	if (!query?.data || !query.message) return;
	const chatId = String(query.message.chat.id);
	if (!settings.ownerChatId || chatId !== settings.ownerChatId) {
		await deps.answer(query.id);
		return;
	}
	const [prefix, action, username] = query.data.split(':');
	if (prefix !== 'ap' || !username) return deps.answer(query.id);
	const rec = (await deps.listChannels()).find((r) => r.username === username);
	if (!rec) return deps.answer(query.id, 'That channel is no longer in the list.');
	const original = query.message.text ?? '';

	if (action === 'paid') {
		if (rec.status !== 'awaiting_payment') return deps.answer(query.id, 'Already handled.');
		const code = await deps.ensureCode(rec.username, settings, rec.code);
		const link = deps.trackedLink(rec.username, settings);
		rec.code = code;
		rec.link = link;
		rec.status = 'paid';
		rec.paidAt = deps.now().toISOString();
		rec.waitingOwner = false;
		rec.outbox = [
			...rec.outbox,
			autopilotCopy.paidWithPost(
				postCopy({ link, code, percent: settings.codePercent, days: settings.codeDays })
			)
		];
		// Store the approval first: a second tap, or a run saving at the same moment, then can't
		// book the spend twice or lose the post.
		if (!(await deps.saveChannel(rec, `owner approved and paid ${naira(rec.agreedNgn ?? 0)}`))) {
			return deps.answer(query.id, BUSY);
		}
		await deps.bookSpend(rec.username, rec.agreedNgn ?? 0, settings);
		await deps.logAction('owner_paid', rec.username, { amountNgn: rec.agreedNgn, code });
		await deps.answer(query.id, 'Approved ✅');
		return deps.edit(
			chatId,
			query.message.message_id,
			`${original}\n\n✅ Approved and paid. Sending them the post now; I'll tell you when it's live.`
		);
	}

	if (action === 'nopay') {
		if (!['awaiting_payment', 'agreed'].includes(rec.status))
			return deps.answer(query.id, 'Already handled.');
		rec.status = 'skipped';
		rec.waitingOwner = false;
		rec.outbox = [...rec.outbox, autopilotCopy.cancel()];
		if (!(await deps.saveChannel(rec, 'owner declined the payment'))) {
			return deps.answer(query.id, BUSY);
		}
		await deps.logAction('owner_declined', rec.username);
		await deps.answer(query.id, 'Not paying');
		return deps.edit(
			chatId,
			query.message.message_id,
			`${original}\n\n❌ Not paid. They've been told politely.`
		);
	}

	if (action === 'skip') {
		if (['paid', 'posted', 'done'].includes(rec.status))
			return deps.answer(query.id, 'Already paid; not skipping.');
		rec.status = 'skipped';
		rec.waitingOwner = false;
		if (!(await deps.saveChannel(rec, 'owner skipped'))) return deps.answer(query.id, BUSY);
		await deps.answer(query.id, 'Skipped');
		return deps.edit(chatId, query.message.message_id, `${original}\n\n⏭ Skipped.`);
	}

	return deps.answer(query.id);
}
