import { prisma } from '$lib/prisma';
import {
	AUTOPILOT_SETTINGS_KEY,
	normalizeUsername,
	parseAutopilotSettings,
	type AutopilotSettings
} from './settings';

/**
 * Autopilot memory, kept in the existing key-value settings table (no database migration):
 * one row per channel (`autopilot.tg.channel.<username>`), one run-state row and one lock.
 * These rows are system-managed and hidden from the general Microcopy editor.
 */

export const CHANNEL_KEY_PREFIX = 'autopilot.tg.channel.';
const RUN_STATE_KEY = 'autopilot.tg.state';
const LOCK_KEY = 'autopilot.tg.lock';
const CATEGORY = 'autopilot';

export type DealStatus =
	| 'discovered' // found, qualifies, not contacted yet
	| 'contacted' // intro sent, waiting for a reply
	| 'negotiating' // we countered
	| 'agreed' // price agreed, waiting for their payment details
	| 'awaiting_payment' // owner asked to approve and pay
	| 'paid' // owner paid; post sent to admin, waiting for it to go live
	| 'posted' // post found in the channel; measuring views
	| 'done'
	| 'declined' // too expensive / no budget
	| 'refused' // they said no
	| 'no_reply'
	| 'skipped'; // owner said skip, or cancelled

export const ACTIVE_STATUSES: DealStatus[] = [
	'contacted',
	'negotiating',
	'agreed',
	'awaiting_payment',
	'paid'
];
export const COMMITTED_STATUSES: DealStatus[] = [
	'agreed',
	'awaiting_payment',
	'paid',
	'posted',
	'done'
];

export interface ChannelRecord {
	username: string;
	title: string;
	members: number;
	avgViews: number;
	lastPostAt: string | null;
	keyword: string;
	nigeria: number;
	contact: string | null;
	status: DealStatus;
	maxPriceNgn: number;
	quotedNgn: number | null;
	agreedNgn: number | null;
	countered: boolean;
	paymentDetails: string | null;
	code: string | null;
	link: string | null;
	lastInboundId: number;
	contactedAt: string | null;
	paidAt: string | null;
	remindedAt: string | null;
	postId: number | null;
	postedAt: string | null;
	views24h: number | null;
	views48h: number | null;
	/** Owner's typed replies waiting to be sent by the next run. */
	outbox: string[];
	/** Last bot message we sent the owner about this channel (so their reply can be routed). */
	ownerPromptId: number | null;
	lastAdminText: string | null;
	/** Waiting for the owner to answer (a reply the autopilot couldn't handle). */
	waitingOwner: boolean;
	/** Added by the owner (skips the discovery checks). */
	manual: boolean;
	notPostedAlerted: boolean;
	/** Telegram errors in a row for this channel (deleted, renamed, blocked us...). */
	errorCount: number;
	log: string[];
	discoveredAt: string;
	updatedAt: string;
	/** Bumped on every save; a save based on an older copy is refused (see saveChannel). */
	rev: number;
}

export interface RunState {
	lastDiscoveryDay: string | null;
	lastReportDay: string | null;
	outreachDay: string | null;
	outreachCount: number;
	lastRunAt: string | null;
	lastError: string | null;
	pausedUntil: string | null;
}

function parse<T>(value: string | null | undefined, fallback: T): T {
	try {
		return value ? ({ ...fallback, ...JSON.parse(value) } as T) : fallback;
	} catch {
		return fallback;
	}
}

async function put(key: string, value: unknown, description: string): Promise<void> {
	const json = JSON.stringify(value);
	await prisma.microcopy.upsert({
		where: { key },
		create: { key, value: json, category: CATEGORY, description, isActive: true },
		update: { value: json, updatedAt: new Date() }
	});
}

export async function getAutopilotSettings(): Promise<AutopilotSettings> {
	const row = await prisma.microcopy.findUnique({
		where: { key: AUTOPILOT_SETTINGS_KEY },
		select: { value: true }
	});
	return parseAutopilotSettings(row?.value);
}

export async function saveAutopilotSettings(settings: AutopilotSettings): Promise<void> {
	await put(
		AUTOPILOT_SETTINGS_KEY,
		{ ...settings, updatedAt: new Date().toISOString() },
		'Telegram marketing autopilot settings (Admin → Autopilot only)'
	);
}

export function newChannelRecord(
	input: Partial<ChannelRecord> & { username: string }
): ChannelRecord {
	const now = new Date().toISOString();
	return {
		title: input.username,
		members: 0,
		avgViews: 0,
		lastPostAt: null,
		keyword: '',
		nigeria: 0,
		contact: null,
		status: 'discovered',
		maxPriceNgn: 0,
		quotedNgn: null,
		agreedNgn: null,
		countered: false,
		paymentDetails: null,
		code: null,
		link: null,
		lastInboundId: 0,
		contactedAt: null,
		paidAt: null,
		remindedAt: null,
		postId: null,
		postedAt: null,
		views24h: null,
		views48h: null,
		outbox: [],
		ownerPromptId: null,
		lastAdminText: null,
		waitingOwner: false,
		manual: false,
		notPostedAlerted: false,
		errorCount: 0,
		log: [],
		discoveredAt: now,
		updatedAt: now,
		rev: 0,
		...input,
		username: normalizeUsername(input.username)
	};
}

export async function listChannels(): Promise<ChannelRecord[]> {
	const rows = await prisma.microcopy.findMany({
		where: { key: { startsWith: CHANNEL_KEY_PREFIX } },
		select: { value: true }
	});
	return rows
		.map((row) => parse<ChannelRecord | null>(row.value, null))
		.filter((rec): rec is ChannelRecord => Boolean(rec?.username))
		.map((rec) => newChannelRecord(rec));
}

export async function getChannel(username: string): Promise<ChannelRecord | null> {
	const row = await prisma.microcopy.findUnique({
		where: { key: CHANNEL_KEY_PREFIX + normalizeUsername(username) },
		select: { value: true }
	});
	const rec = parse<ChannelRecord | null>(row?.value, null);
	return rec ? newChannelRecord(rec) : null;
}

/**
 * Saves a channel unless someone else saved it since `rec` was read (the cron run and the owner's
 * bot taps can touch the same deal at once). Returns false on such a conflict and writes nothing,
 * so the caller can retry with fresh data. On success `rec` is updated in place.
 */
export async function saveChannel(rec: ChannelRecord, note?: string): Promise<boolean> {
	const key = CHANNEL_KEY_PREFIX + rec.username;
	const next: ChannelRecord = {
		...rec,
		rev: rec.rev + 1,
		updatedAt: new Date().toISOString(),
		log: note
			? [...rec.log, `${new Date().toISOString().slice(0, 16)} ${note}`].slice(-30)
			: rec.log
	};
	const json = JSON.stringify(next);
	const saved = await prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
		const row = await tx.microcopy.findUnique({ where: { key }, select: { value: true } });
		const current = parse<ChannelRecord | null>(row?.value, null);
		if (current && newChannelRecord(current).rev !== rec.rev) return false;
		await tx.microcopy.upsert({
			where: { key },
			create: {
				key,
				value: json,
				category: CATEGORY,
				description: `Autopilot channel @${rec.username}`,
				isActive: true
			},
			update: { value: json, updatedAt: new Date() }
		});
		return true;
	});
	if (saved) Object.assign(rec, { rev: next.rev, updatedAt: next.updatedAt, log: next.log });
	else console.warn(`[autopilot] @${rec.username} changed elsewhere; this save was skipped`);
	return saved;
}

export async function getRunState(): Promise<RunState> {
	const row = await prisma.microcopy.findUnique({
		where: { key: RUN_STATE_KEY },
		select: { value: true }
	});
	return parse<RunState>(row?.value, {
		lastDiscoveryDay: null,
		lastReportDay: null,
		outreachDay: null,
		outreachCount: 0,
		lastRunAt: null,
		lastError: null,
		pausedUntil: null
	});
}

export async function saveRunState(state: RunState): Promise<void> {
	await put(RUN_STATE_KEY, state, 'Autopilot run state (system-managed)');
}

/** One run at a time. A lock older than `ttlMs` is treated as abandoned. */
export async function acquireLock(ttlMs = 5 * 60_000): Promise<boolean> {
	return prisma.$transaction(async (tx) => {
		await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('${LOCK_KEY}'))`);
		const row = await tx.microcopy.findUnique({
			where: { key: LOCK_KEY },
			select: { value: true }
		});
		const heldUntil = Number(row?.value || 0);
		if (heldUntil > Date.now()) return false;
		const value = String(Date.now() + ttlMs);
		await tx.microcopy.upsert({
			where: { key: LOCK_KEY },
			create: {
				key: LOCK_KEY,
				value,
				category: CATEGORY,
				description: 'Autopilot run lock',
				isActive: true
			},
			update: { value }
		});
		return true;
	});
}

export async function releaseLock(): Promise<void> {
	await prisma.microcopy.updateMany({ where: { key: LOCK_KEY }, data: { value: '0' } });
}

/** Every step is also written to the marketing action log (visible in Admin → Marketing). */
export async function logAction(
	action: string,
	username: string,
	detail: Record<string, unknown> = {}
): Promise<void> {
	await prisma.marketingAction
		.create({
			data: {
				channelKey: 'telegram',
				campaignKey: 'tg-autopilot',
				placementKey: username,
				action,
				detail: detail as object,
				actor: 'autopilot'
			}
		})
		.catch(() => {});
}
