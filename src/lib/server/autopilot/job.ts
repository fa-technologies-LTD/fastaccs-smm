import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { botAnswer, botConfigured, botEdit, botSend, type BotButton } from './bot';
import { FULL_RUN_MINUTES, type AutopilotMode } from './engine';
import { runGroupsOnce, type GroupRunSummary } from './groups';
import { bookSpend, groupTrackedLink, groupVisitsSince } from './money';
import { handleOwnerUpdate, type TelegramUpdate } from './owner';
import type { AutopilotSettings } from './settings';
import {
	acquireLock,
	getAutopilotSettings,
	getGroupRunState,
	getKnownPeers,
	getRunState,
	listChannels,
	logAction,
	releaseLock,
	saveAutopilotSettings,
	saveChannel,
	saveRunState,
	saveKnownPeers,
	saveGroup,
	saveGroupRunState,
	listGroups
} from './state';
import { TelegramSlowDown, connectUserbot, userbotConfigured, type UserbotPort } from './userbot';

/** Secret Telegram echoes on every webhook call, derived from the bot token (no extra setting). */
export function botWebhookSecret(): string | null {
	const token = env.TELEGRAM_BOT_TOKEN;
	return token
		? createHmac('sha256', token).update('fastaccs-autopilot-webhook').digest('hex').slice(0, 48)
		: null;
}

function ownerNotifier(settings: AutopilotSettings) {
	return async (text: string, rows?: BotButton[][]): Promise<number | null> => {
		if (!botConfigured() || !settings.ownerChatId) return null;
		return botSend(settings.ownerChatId, text, rows).catch((error) => {
			console.error('Autopilot bot message failed:', error);
			return null;
		});
	};
}

/** Which run is due right now (null: nothing to do, so the cron returns without touching Telegram). */
export async function autopilotModeNow(now = new Date()): Promise<AutopilotMode | null> {
	const [settings, state] = await Promise.all([getAutopilotSettings(), getRunState()]);
	if (!settings.enabled || !settings.groupsEnabled || !userbotConfigured()) return null;
	if (state.pausedUntil && new Date(state.pausedUntil) > now) return null;
	if (FULL_RUN_MINUTES.includes(now.getUTCMinutes())) return 'full';
	return null;
}

/** One run. Does nothing while the autopilot is off or not set up. */
export async function runAutopilotJob(
	mode: AutopilotMode = 'full'
): Promise<GroupRunSummary | { skipped: string }> {
	if (mode === 'replies') return { skipped: 'channel_replies_retired' };
	const settings = await getAutopilotSettings();
	if (!settings.enabled) return { skipped: 'off' };
	if (!settings.groupsEnabled) return { skipped: 'groups_off' };
	if (!userbotConfigured()) return { skipped: 'telegram_not_set_up' };
	const state = await getRunState();
	if (state.pausedUntil && new Date(state.pausedUntil) > new Date())
		return { skipped: 'telegram_asked_to_wait' };
	if (!(await acquireLock())) return { skipped: 'already_running' };
	let userbot: UserbotPort | null = null;
	const known = await getKnownPeers().catch(() => []);
	try {
		userbot = await connectUserbot(known);
		const result = await runGroupsOnce({
			userbot,
			settings,
			now: new Date(),
			deadline: Date.now() + 45_000,
			listGroups,
			saveGroup,
			getState: getGroupRunState,
			saveState: saveGroupRunState,
			logAction,
			trackedLink: groupTrackedLink,
			visitsSince: groupVisitsSince
		});
		if (state.lastError) {
			state.lastError = null;
			await saveRunState(state);
		}
		return result;
	} catch (error) {
		const latest = await getRunState();
		if (error instanceof TelegramSlowDown) {
			const until = new Date(Date.now() + (error.seconds + 60) * 1000);
			latest.pausedUntil = until.toISOString();
			if (error.reason === 'account_limited' || error.seconds >= 3600) {
				const when = until.toLocaleString('en-GB', {
					day: 'numeric',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit',
					timeZone: 'Africa/Lagos'
				});
				await ownerNotifier(settings)(
					error.reason === 'account_limited'
						? `⚠️ Telegram has limited the account. Group activity is paused until ${when} WAT and will resume automatically.`
						: `⏸ Telegram asked the autopilot to slow down. Paused until ${when} WAT; it resumes by itself.`
				);
			}
		}
		latest.lastError = error instanceof Error ? error.message.slice(0, 300) : 'failed';
		await saveRunState(latest);
		throw error;
	} finally {
		if (userbot) await saveKnownPeers(known, userbot.knownPeers()).catch(() => {});
		await userbot?.close().catch(() => {});
		await releaseLock().catch(() => {});
	}
}

export async function handleBotWebhook(update: TelegramUpdate): Promise<void> {
	await handleOwnerUpdate(update, {
		getSettings: getAutopilotSettings,
		saveSettings: saveAutopilotSettings,
		listChannels,
		saveChannel,
		logAction,
		bookSpend: (username, amount, settings) => bookSpend(username, amount, settings),
		send: async (chatId, text) => {
			await botSend(chatId, text);
		},
		edit: botEdit,
		answer: botAnswer
	});
}
