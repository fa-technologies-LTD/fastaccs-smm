import { json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { botWebhookSecret, handleBotWebhook } from '$lib/server/autopilot/job';
import type { TelegramUpdate } from '$lib/server/autopilot/owner';

/** Telegram calls this for the owner's bot. Only calls carrying our secret are accepted. */
export const POST: RequestHandler = async ({ request }) => {
	const expected = botWebhookSecret();
	const given = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
	if (
		!expected ||
		given.length !== expected.length ||
		!timingSafeEqual(Buffer.from(given), Buffer.from(expected))
	) {
		return json({ ok: false }, { status: 401 });
	}
	const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
	if (update) {
		await handleBotWebhook(update).catch((error) =>
			console.error('Autopilot bot update failed:', error)
		);
	}
	// Always 200 so Telegram doesn't retry the same update forever.
	return json({ ok: true });
};
