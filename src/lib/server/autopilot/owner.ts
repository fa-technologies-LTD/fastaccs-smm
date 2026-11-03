import { spentSoFar } from './engine';
import type { AutopilotSettings } from './settings';
import type { ChannelRecord } from './state';

/**
 * What the owner does in the bot: bind their chat, manage legacy deals, pause/resume,
 * and ask for status. New channel outreach and paid posts are retired.
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
	bookSpend(username: string, amountNgn: number, settings: AutopilotSettings): Promise<void>;
	send(chatId: string, text: string): Promise<void>;
	edit(chatId: string, messageId: number, text: string): Promise<void>;
	answer(callbackId: string, text?: string): Promise<void>;
}

const BUSY = 'The autopilot was updating this deal. Please tap again.';
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

function statusText(channels: ChannelRecord[], settings: AutopilotSettings): string {
	return [
		`Telegram group outreach is ${settings.enabled && settings.groupsEnabled ? 'ON' : 'OFF'}.`,
		'Public replies and group promotions run only within your group limits.',
		'New admin DMs and paid channel placements are off.',
		`Past channel records: ${channels.length} · historical spend: ${naira(spentSoFar(channels))}`
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
				return deps.send(
					chatId,
					"✅ Connected. I'll send Telegram account alerts and status here."
				);
			}
			if (chatId === settings.ownerChatId) {
				return deps.send(
					chatId,
					"✅ You're already connected. Send /status to see how it's going."
				);
			}
			// Nobody connected yet: say why nothing happened (once an owner is connected, strangers get silence).
			if (!settings.ownerChatId) {
				return deps.send(
					chatId,
					'That link is out of date or incomplete. On the site, open Admin → Telegram autopilot and use the link shown there.'
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
			return deps.send(
				chatId,
				'Automated admin DMs are off. Please reply in Telegram yourself; nothing was sent.'
			);
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
	if (action === 'paid' || action === 'partner') {
		return deps.answer(
			query.id,
			'Paid channel outreach is retired. No message or payment was sent.'
		);
	}

	if (action === 'nopartner') {
		if (!['partner_pending', 'partner_offered'].includes(rec.status))
			return deps.answer(query.id, 'Already handled.');
		rec.status = 'skipped';
		rec.waitingOwner = false;
		rec.outbox = [];
		if (!(await deps.saveChannel(rec, 'owner declined the partner deal'))) {
			return deps.answer(query.id, BUSY);
		}
		await deps.logAction('partner_declined', rec.username);
		await deps.answer(query.id, 'Not going ahead');
		return deps.edit(
			chatId,
			query.message.message_id,
			`${original}\n\n❌ Not going ahead. No automated message was sent.`
		);
	}

	if (action === 'ppaid') {
		const payout = rec.partnerPayout;
		if (!payout) return deps.answer(query.id, 'Already handled.');
		rec.partnerEarnedNgn = (rec.partnerEarnedNgn ?? 0) + payout.amountNgn;
		rec.partnerPaidUntil = payout.to;
		rec.partnerPayout = null;
		rec.outbox = [];
		// Saved first, so a second tap can't book the payout twice.
		if (!(await deps.saveChannel(rec, `owner paid partner ${naira(payout.amountNgn)}`))) {
			return deps.answer(query.id, BUSY);
		}
		await deps.bookSpend(rec.username, payout.amountNgn, settings);
		await deps.logAction('partner_paid', rec.username, {
			amountNgn: payout.amountNgn,
			orders: payout.orders,
			salesNgn: payout.salesNgn
		});
		await deps.answer(query.id, 'Paid ✅');
		return deps.edit(
			chatId,
			query.message.message_id,
			`${original}\n\n✅ Payment recorded. Please notify the partner yourself.`
		);
	}

	if (action === 'pskip') {
		if (!rec.partnerPayout) return deps.answer(query.id, 'Already handled.');
		rec.partnerPayout = null; // the same sales come back on next Monday's card
		if (!(await deps.saveChannel(rec, 'owner carried the payout over'))) {
			return deps.answer(query.id, BUSY);
		}
		await deps.answer(query.id, 'Carried over to next week');
		return deps.edit(
			chatId,
			query.message.message_id,
			`${original}\n\n⏭ Not now. It will be on next Monday's card.`
		);
	}

	if (action === 'nopay') {
		if (!['awaiting_payment', 'agreed'].includes(rec.status))
			return deps.answer(query.id, 'Already handled.');
		rec.status = 'skipped';
		rec.waitingOwner = false;
		rec.outbox = [];
		if (!(await deps.saveChannel(rec, 'owner declined the payment'))) {
			return deps.answer(query.id, BUSY);
		}
		await deps.logAction('owner_declined', rec.username);
		await deps.answer(query.id, 'Not paying');
		return deps.edit(
			chatId,
			query.message.message_id,
			`${original}\n\n❌ Not paid. No automated message was sent.`
		);
	}

	if (action === 'skip') {
		if (['paid', 'posted', 'done'].includes(rec.status))
			return deps.answer(query.id, 'Already paid; not skipping.');
		rec.status = 'skipped';
		rec.waitingOwner = false;
		rec.outbox = [];
		if (!(await deps.saveChannel(rec, 'owner skipped'))) return deps.answer(query.id, BUSY);
		await deps.answer(query.id, 'Skipped');
		return deps.edit(chatId, query.message.message_id, `${original}\n\n⏭ Skipped.`);
	}

	return deps.answer(query.id);
}
