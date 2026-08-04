import type { PvapinsApp, PvapinsCountry } from '../pvapins';

/**
 * Maps our canonical products to how each provider names them. hub-man uses numeric service ids
 * (which our tiers already store); pvapins names its suppliers by a service PREFIX + a number
 * ("Whatsapp24", "Telegram2"), so a service maps to one or more name prefixes. Curated + easily
 * extended — a wrong/narrow prefix just means we don't consider some pvapins suppliers, never a
 * correctness bug.
 */
export interface ServiceMapping {
	hubServiceId: number;
	name: string;
	/** Lower-cased pvapins app-name prefixes that belong to this service. */
	pvapinsPrefixes: string[];
}

export const SERVICE_MAP: ServiceMapping[] = [
	{ hubServiceId: 1, name: 'WhatsApp', pvapinsPrefixes: ['whatsapp'] },
	{ hubServiceId: 2, name: 'Telegram', pvapinsPrefixes: ['telegram'] },
	{ hubServiceId: 7, name: 'Instagram', pvapinsPrefixes: ['instagram'] },
	{ hubServiceId: 11, name: 'Facebook', pvapinsPrefixes: ['facebook'] },
	{ hubServiceId: 3, name: 'Google / Gmail', pvapinsPrefixes: ['google', 'gmail'] },
	{ hubServiceId: 50, name: 'TikTok', pvapinsPrefixes: ['tiktok', 'douyin'] },
	{ hubServiceId: 47, name: 'Discord', pvapinsPrefixes: ['discord'] },
	{ hubServiceId: 12, name: 'X / Twitter', pvapinsPrefixes: ['twitter'] },
	{ hubServiceId: 73, name: 'Snapchat', pvapinsPrefixes: ['snapchat'] },
	{ hubServiceId: 28, name: 'Tinder', pvapinsPrefixes: ['tinder'] },
	{ hubServiceId: 13, name: 'Uber', pvapinsPrefixes: ['uber'] },
	{ hubServiceId: 60, name: 'Amazon', pvapinsPrefixes: ['amazon'] },
	{ hubServiceId: 41, name: 'Netflix', pvapinsPrefixes: ['netflix'] },
	{ hubServiceId: 120, name: 'PayPal', pvapinsPrefixes: ['paypal'] },
	{ hubServiceId: 9, name: 'Viber', pvapinsPrefixes: ['viber'] },
	{ hubServiceId: 2419, name: 'OpenAI / ChatGPT', pvapinsPrefixes: ['openai', 'chatgpt'] },
	{ hubServiceId: 27, name: 'Steam', pvapinsPrefixes: ['steam'] },
	{ hubServiceId: 122, name: 'Coinbase', pvapinsPrefixes: ['coinbase'] },
	{ hubServiceId: 355, name: 'Revolut', pvapinsPrefixes: ['revolut'] },
	{ hubServiceId: 258, name: 'Bumble', pvapinsPrefixes: ['bumble'] }
];

const SERVICE_BY_HUB_ID = new Map(SERVICE_MAP.map((s) => [s.hubServiceId, s]));
export function serviceByHubId(hubServiceId: number): ServiceMapping | undefined {
	return SERVICE_BY_HUB_ID.get(hubServiceId);
}

/** pvapins apps belonging to a service (name starts with any of its prefixes, case-insensitive). */
export function pvapinsAppsForService(prefixes: string[], apps: PvapinsApp[]): PvapinsApp[] {
	const lowered = prefixes.map((p) => p.toLowerCase());
	return apps.filter((a) => {
		const name = String(a.full_name ?? '').toLowerCase();
		return lowered.some((p) => name.startsWith(p));
	});
}

/** The ISO2 code a pvapins country carries in its picture URL ("..._us.webp" → "US"). */
export function pvapinsCountryIso(c: PvapinsCountry): string {
	const m = /_([a-z]{2})\.[a-z]+$/i.exec(String(c.picture ?? ''));
	return m ? m[1].toUpperCase() : '';
}

/** Find the pvapins country matching a hub-man ISO2 code (falls back to a name match). */
export function findPvapinsCountry(
	countries: PvapinsCountry[],
	isoCode: string,
	name?: string
): PvapinsCountry | undefined {
	const iso = (isoCode ?? '').toUpperCase();
	if (iso) {
		const byIso = countries.find((c) => pvapinsCountryIso(c) === iso);
		if (byIso) return byIso;
	}
	if (name) {
		const n = name.trim().toLowerCase();
		return countries.find((c) => String(c.full_name ?? '').trim().toLowerCase() === n);
	}
	return undefined;
}
