import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { botAnswer, botConfigured, botEdit, botSend, type BotButton } from './bot';
import { planAutopilotRun, runAutopilotOnce, type AutopilotMode, type RunSummary } from './engine';
import { claudeConfigured, readWithClaude } from './llm';
import { runGroupsOnce, type GroupRunSummary } from './groups';
import {
	bookSpend,
	ensurePlacementCode,
	groupTrackedLink,
	groupVisitsSince,
	partnerSales,
	trackedLinkFor
} from './money';
import { handleOwnerUpdate, type TelegramUpdate } from './owner';
import { placementCode, postCopy } from './rules';
import type { AutopilotSettings } from './settings';
import {
	acquireLock,
	getAutopilotSettings,
	getGroupRunState,
	getOwnerPicks,
	getRunState,
	listChannels,
	logAction,
	releaseLock,
	saveAutopilotSettings,
	saveChannel,
	saveRunState,
	saveGroup,
	saveGroupRunState,
	listGroups,
	settleOwnerPicks,
	type ChannelRecord
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

export function postFor(rec: ChannelRecord, settings: AutopilotSettings): string {
	return postCopy({
		link: rec.link ?? trackedLinkFor(rec.username, settings),
		code: rec.code ?? placementCode(rec.username, settings.codePercent),
		percent: settings.codePercent,
		days: settings.codeDays
	});
}

/** Which run is due right now (null: nothing to do, so the cron returns without touching Telegram). */
export async function autopilotModeNow(now = new Date()): Promise<AutopilotMode | null> {
	const [settings, state, channels] = await Promise.all([
		getAutopilotSettings(),
		getRunState(),
		listChannels()
	]);
	return planAutopilotRun({ now, settings, configured: userbotConfigured(), state, channels });
}

/** One run. Does nothing while the autopilot is off or not set up. */
export async function runAutopilotJob(
	mode: AutopilotMode = 'full'
): Promise<RunSummary | GroupRunSummary | { skipped: string }> {
	const settings = await getAutopilotSettings();
	if (!settings.enabled) return { skipped: 'off' };
	if (!userbotConfigured()) return { skipped: 'telegram_not_set_up' };
	const state = await getRunState();
	if (state.pausedUntil && new Date(state.pausedUntil) > new Date())
		return { skipped: 'telegram_asked_to_wait' };
	if (!(await acquireLock())) return { skipped: 'already_running' };
	let userbot: UserbotPort | null = null;
	try {
		userbot = await connectUserbot();
		if (mode === 'groups') {
			return await runGroupsOnce({
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
		}
		return await runAutopilotOnce({
			userbot,
			settings,
			store: {
				listChannels,
				saveChannel,
				getRunState,
				saveRunState,
				logAction,
				getOwnerPicks,
				settleOwnerPicks,
				queueGroup: async (username, via) => {
					const groupState = await getGroupRunState();
					if (groupState.candidates.some((c) => c.username === username)) return;
					groupState.candidates.unshift({ username, via, ownerPick: true });
					await saveGroupRunState(groupState);
				}
			},
			groupStats: async () => {
				const [groups, groupState] = await Promise.all([listGroups(), getGroupRunState()]);
				const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
				const fresh = groupState.day === today;
				return {
					watching: groups.filter((g) => g.status === 'joined').length,
					repliesToday: fresh ? groupState.repliesToday : 0,
					postsToday: fresh ? groupState.postsToday : 0
				};
			},
			now: new Date(),
			notifyOwner: ownerNotifier(settings),
			readWithClaude: claudeConfigured()
				? (text, title) => readWithClaude(text, { channelTitle: title, model: settings.llmModel })
				: undefined,
			postFor: (rec) => postFor(rec, settings),
			partnerSales,
			deadline: Date.now() + (mode === 'full' ? 45_000 : 30_000),
			mode: mode === 'replies' ? 'replies' : 'full'
		});
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
						? `⚠️ Telegram has limited the autopilot account from messaging new people (usually after too many first messages). I've paused until ${when} WAT and will resume by myself. If it keeps happening, lower "New admins to message per day".`
						: `⏸ Telegram asked the autopilot to slow down. Paused until ${when} WAT; it resumes by itself.`
				);
			}
		}
		latest.lastError = error instanceof Error ? error.message.slice(0, 300) : 'failed';
		await saveRunState(latest);
		throw error;
	} finally {
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
		ensureCode: ensurePlacementCode,
		trackedLink: trackedLinkFor,
		bookSpend: (username, amount, settings) => bookSpend(username, amount, settings),
		send: async (chatId, text) => {
			await botSend(chatId, text);
		},
		edit: botEdit,
		answer: botAnswer,
		now: () => new Date()
	});
}
