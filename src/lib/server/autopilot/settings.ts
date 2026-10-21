/**
 * Telegram marketing autopilot settings (microcopy `config.autopilot.telegram`). OFF and in test
 * mode until the owner says otherwise. Only the owner may change them (Admin → Autopilot).
 */

export const AUTOPILOT_SETTINGS_KEY = 'config.autopilot.telegram';
export const AUTOPILOT_KEY_PREFIX = 'autopilot.';

export const AUTOPILOT_MODELS = ['claude-opus-5-5', 'claude-haiku-5-5'] as const;
export type AutopilotModel = (typeof AUTOPILOT_MODELS)[number];

export interface AutopilotSettings {
	/** Master switch: nothing runs while false. */
	enabled: boolean;
	/** In test mode the autopilot only ever messages the usernames in `testContacts`. */
	testMode: boolean;
	testContacts: string[];
	/** Total spend allowed across all deals (₦). */
	budgetNgn: number;
	maxPerPostNgn: number;
	/** Most we pay per 1,000 real views (₦). */
	maxPer1kViewsNgn: number;
	minAvgViews: number;
	/** New admins messaged per day (kept low so the account isn't reported as spam). */
	dailyNewContacts: number;
	keywords: string[];
	landingPath: string;
	codePercent: number;
	codeDays: number;
	llmModel: AutopilotModel;
	/** Owner's chat with the bot (set by /start <bindCode>). */
	ownerChatId: string | null;
	bindCode: string | null;
	campaignKey: string;
	updatedAt: string | null;
}

export const AUTOPILOT_DEFAULTS: AutopilotSettings = {
	enabled: false,
	testMode: true,
	testContacts: [],
	budgetNgn: 15_000,
	maxPerPostNgn: 5_000,
	maxPer1kViewsNgn: 2_500,
	minAvgViews: 300,
	dailyNewContacts: 6,
	keywords: [
		'airdrop nigeria',
		'crypto nigeria',
		'naija crypto',
		'web3 nigeria',
		'naija hustle',
		'make money online nigeria',
		'twitter growth',
		'tech nigeria'
	],
	landingPath: '/platforms/x',
	codePercent: 10,
	codeDays: 14,
	llmModel: 'claude-opus-5-5',
	ownerChatId: null,
	bindCode: null,
	campaignKey: 'tg-autopilot',
	updatedAt: null
};

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function int(value: unknown, fallback: number, min: number, max: number): number {
	const n = Math.floor(Number(value));
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function list(value: unknown, fallback: string[]): string[] {
	if (!Array.isArray(value)) return fallback;
	return value
		.map((item) => String(item ?? '').trim())
		.filter(Boolean)
		.slice(0, 30);
}

export function normalizeUsername(value: unknown): string {
	return String(value ?? '')
		.trim()
		.replace(/^https?:\/\/t\.me\//i, '')
		.replace(/^@/, '')
		.toLowerCase();
}

export function parseAutopilotSettings(raw: string | null | undefined): AutopilotSettings {
	let value: Record<string, unknown> = {};
	try {
		value = record(raw ? JSON.parse(raw) : {});
	} catch {
		value = {};
	}
	const d = AUTOPILOT_DEFAULTS;
	const model = String(value.llmModel ?? d.llmModel) as AutopilotModel;
	return {
		enabled: value.enabled === true,
		testMode: value.testMode !== false,
		testContacts: list(value.testContacts, d.testContacts).map(normalizeUsername),
		budgetNgn: int(value.budgetNgn, d.budgetNgn, 0, 10_000_000),
		maxPerPostNgn: int(value.maxPerPostNgn, d.maxPerPostNgn, 500, 1_000_000),
		maxPer1kViewsNgn: int(value.maxPer1kViewsNgn, d.maxPer1kViewsNgn, 100, 100_000),
		minAvgViews: int(value.minAvgViews, d.minAvgViews, 50, 1_000_000),
		dailyNewContacts: int(value.dailyNewContacts, d.dailyNewContacts, 0, 15),
		keywords: list(value.keywords, d.keywords),
		landingPath:
			typeof value.landingPath === 'string' && value.landingPath.startsWith('/')
				? value.landingPath
				: d.landingPath,
		codePercent: int(value.codePercent, d.codePercent, 0, 30),
		codeDays: int(value.codeDays, d.codeDays, 1, 60),
		llmModel: (AUTOPILOT_MODELS as readonly string[]).includes(model) ? model : d.llmModel,
		ownerChatId:
			typeof value.ownerChatId === 'string' && value.ownerChatId ? value.ownerChatId : null,
		bindCode: typeof value.bindCode === 'string' && value.bindCode ? value.bindCode : null,
		campaignKey:
			typeof value.campaignKey === 'string' && value.campaignKey
				? value.campaignKey
				: d.campaignKey,
		updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
	};
}

/** Can the autopilot message this person right now? In test mode only the listed test contacts. */
export function mayMessage(settings: AutopilotSettings, username: string): boolean {
	if (!settings.testMode) return true;
	return settings.testContacts.includes(normalizeUsername(username));
}
