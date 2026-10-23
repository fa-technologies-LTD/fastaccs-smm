import { env } from '$env/dynamic/private';

/**
 * The owner's bot (made with @BotFather): reports, approvals and alerts. Telegram's Bot API over
 * plain HTTPS. The bot only ever talks to the owner's bound chat.
 */

export interface BotButton {
	text: string;
	data: string; // ≤ 64 bytes (Telegram limit)
}

export function botConfigured(): boolean {
	return Boolean(env.TELEGRAM_BOT_TOKEN);
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
	const token = env.TELEGRAM_BOT_TOKEN;
	if (!token) throw new Error('TELEGRAM_BOT_NOT_CONFIGURED');
	const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000)
	});
	const json = (await response.json().catch(() => ({}))) as {
		ok?: boolean;
		result?: T;
		description?: string;
	};
	if (!json.ok)
		throw new Error(`Telegram bot ${method} failed: ${json.description ?? response.status}`);
	return json.result as T;
}

function keyboard(rows?: BotButton[][]) {
	return rows?.length
		? {
				inline_keyboard: rows.map((row) =>
					row.map((b) => ({ text: b.text, callback_data: b.data.slice(0, 64) }))
				)
			}
		: undefined;
}

export async function botSend(chatId: string, text: string, rows?: BotButton[][]): Promise<number> {
	const result = await call<{ message_id: number }>('sendMessage', {
		chat_id: chatId,
		text: text.slice(0, 4000),
		disable_web_page_preview: true,
		reply_markup: keyboard(rows)
	});
	return result.message_id;
}

export async function botEdit(chatId: string, messageId: number, text: string): Promise<void> {
	await call('editMessageText', {
		chat_id: chatId,
		message_id: messageId,
		text: text.slice(0, 4000),
		disable_web_page_preview: true
	}).catch(() => {});
}

export async function botAnswer(callbackQueryId: string, text?: string): Promise<void> {
	await call('answerCallbackQuery', { callback_query_id: callbackQueryId, text }).catch(() => {});
}

export async function botUsername(): Promise<string> {
	const me = await call<{ username: string }>('getMe', {});
	return me.username;
}

/** Point the bot at our webhook, with a secret Telegram sends back on every update. */
export async function botSetWebhook(url: string, secret: string): Promise<void> {
	await call('setWebhook', {
		url,
		secret_token: secret,
		allowed_updates: ['message', 'callback_query'],
		drop_pending_updates: true
	});
}

export interface WebhookHealth {
	url: string;
	pendingUpdates: number;
	lastErrorAt: string | null;
	lastError: string | null;
}

/** What Telegram says about delivering updates to our webhook (shown on the admin page). */
export async function botWebhookInfo(): Promise<WebhookHealth> {
	const info = await call<{
		url?: string;
		pending_update_count?: number;
		last_error_date?: number;
		last_error_message?: string;
	}>('getWebhookInfo', {});
	return {
		url: info.url ?? '',
		pendingUpdates: info.pending_update_count ?? 0,
		lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
		lastError: info.last_error_message ?? null
	};
}
