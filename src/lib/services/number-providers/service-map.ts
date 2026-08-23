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
	{ hubServiceId: 507, name: 'Signal', pvapinsPrefixes: ['signal'] },
	{ hubServiceId: 7, name: 'Instagram', pvapinsPrefixes: ['instagram'] },
	{ hubServiceId: 11, name: 'Facebook', pvapinsPrefixes: ['facebook'] },
	{ hubServiceId: 3, name: 'Google / Gmail', pvapinsPrefixes: ['google', 'gmail'] },
	{ hubServiceId: 18, name: 'Microsoft / Outlook', pvapinsPrefixes: ['microsoft', 'outlook'] },
	{ hubServiceId: 131, name: 'Apple / iCloud', pvapinsPrefixes: ['apple', 'icloud'] },
	{ hubServiceId: 50, name: 'TikTok', pvapinsPrefixes: ['tiktok', 'douyin'] },
	{ hubServiceId: 47, name: 'Discord', pvapinsPrefixes: ['discord'] },
	{ hubServiceId: 12, name: 'X / Twitter', pvapinsPrefixes: ['twitter'] },
	{ hubServiceId: 73, name: 'Snapchat', pvapinsPrefixes: ['snapchat'] },
	{ hubServiceId: 33, name: 'LinkedIn', pvapinsPrefixes: ['linkedin'] },
	{ hubServiceId: 2612, name: 'Reddit', pvapinsPrefixes: ['reddit'] },
	{ hubServiceId: 21, name: 'Yahoo', pvapinsPrefixes: ['yahoo'] },
	{ hubServiceId: 5, name: 'VK', pvapinsPrefixes: ['vk', 'vkontakte'] },
	{ hubServiceId: 31, name: 'KakaoTalk', pvapinsPrefixes: ['kakaotalk', 'kakao'] },
	{ hubServiceId: 45, name: 'IMO', pvapinsPrefixes: ['imo', 'imo messenger'] },
	{ hubServiceId: 354, name: 'Skype', pvapinsPrefixes: ['skype'] },
	{ hubServiceId: 490, name: 'Clubhouse', pvapinsPrefixes: ['clubhouse'] },
	{ hubServiceId: 3609, name: 'BeReal', pvapinsPrefixes: ['bereal'] },
	{ hubServiceId: 84, name: 'Truecaller', pvapinsPrefixes: ['truecaller'] },
	{ hubServiceId: 28, name: 'Tinder', pvapinsPrefixes: ['tinder'] },
	{ hubServiceId: 267, name: 'Hinge', pvapinsPrefixes: ['hinge'] },
	{ hubServiceId: 140, name: 'Grindr', pvapinsPrefixes: ['grindr'] },
	{ hubServiceId: 363, name: 'OkCupid', pvapinsPrefixes: ['okcupid'] },
	{ hubServiceId: 13, name: 'Uber', pvapinsPrefixes: ['uber'] },
	{ hubServiceId: 60, name: 'Amazon', pvapinsPrefixes: ['amazon'] },
	{ hubServiceId: 19, name: 'Airbnb', pvapinsPrefixes: ['airbnb'] },
	{ hubServiceId: 379, name: 'DoorDash', pvapinsPrefixes: ['doordash'] },
	{ hubServiceId: 536, name: 'Lyft', pvapinsPrefixes: ['lyft'] },
	{ hubServiceId: 86, name: 'Bolt', pvapinsPrefixes: ['bolt'] },
	{ hubServiceId: 98, name: 'Foodpanda', pvapinsPrefixes: ['foodpanda'] },
	{ hubServiceId: 118, name: 'Deliveroo', pvapinsPrefixes: ['deliveroo'] },
	{ hubServiceId: 2784, name: 'Booking.com', pvapinsPrefixes: ['booking'] },
	{ hubServiceId: 41, name: 'Netflix', pvapinsPrefixes: ['netflix'] },
	{ hubServiceId: 3066, name: 'Spotify', pvapinsPrefixes: ['spotify'] },
	{ hubServiceId: 120, name: 'PayPal', pvapinsPrefixes: ['paypal'] },
	{ hubServiceId: 9, name: 'Viber', pvapinsPrefixes: ['viber'] },
	{ hubServiceId: 8, name: 'WeChat', pvapinsPrefixes: ['wechat'] },
	{ hubServiceId: 20, name: 'LINE', pvapinsPrefixes: ['line'] },
	{ hubServiceId: 2419, name: 'OpenAI / ChatGPT', pvapinsPrefixes: ['openai', 'chatgpt'] },
	{ hubServiceId: 3965, name: 'Claude AI', pvapinsPrefixes: ['claude'] },
	{ hubServiceId: 63, name: 'Proton Mail', pvapinsPrefixes: ['protonmail'] },
	{ hubServiceId: 2846, name: 'Dropbox', pvapinsPrefixes: ['dropbox'] },
	{ hubServiceId: 5863, name: 'GitLab', pvapinsPrefixes: ['gitlab'] },
	{ hubServiceId: 352, name: 'Fiverr', pvapinsPrefixes: ['fiverr'] },
	{ hubServiceId: 292, name: 'Upwork', pvapinsPrefixes: ['upwork'] },
	{ hubServiceId: 27, name: 'Steam', pvapinsPrefixes: ['steam'] },
	{ hubServiceId: 785, name: 'Twitch', pvapinsPrefixes: ['twitch'] },
	{ hubServiceId: 3023, name: 'Pinterest', pvapinsPrefixes: ['pinterest'] },
	{ hubServiceId: 2610, name: 'Roblox', pvapinsPrefixes: ['roblox'] },
	{ hubServiceId: 5667, name: 'Epic Games', pvapinsPrefixes: ['epic games', 'epicgames'] },
	{ hubServiceId: 136, name: 'Blizzard', pvapinsPrefixes: ['blizzard'] },
	{ hubServiceId: 3040, name: 'Riot Games', pvapinsPrefixes: ['riot games', 'riotgames'] },
	{ hubServiceId: 981, name: 'PUBG', pvapinsPrefixes: ['pubg'] },
	{ hubServiceId: 124, name: 'eBay', pvapinsPrefixes: ['ebay'] },
	{ hubServiceId: 2590, name: 'Temu', pvapinsPrefixes: ['temu'] },
	{ hubServiceId: 394, name: 'SHEIN', pvapinsPrefixes: ['shein'] },
	{ hubServiceId: 523, name: 'AliExpress', pvapinsPrefixes: ['aliexpress'] },
	{ hubServiceId: 351, name: 'Walmart', pvapinsPrefixes: ['walmart'] },
	{ hubServiceId: 125, name: 'Nike', pvapinsPrefixes: ['nike'] },
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
	const lowered = prefixes.map((p) => p.trim().toLowerCase()).filter(Boolean);
	return apps.filter((a) => {
		const name = String(a.full_name ?? '')
			.trim()
			.toLowerCase();
		return lowered.some((prefix) => {
			if (!name.startsWith(prefix)) return false;
			const next = name.charAt(prefix.length);
			// Supplier variants are normally `Service24`, `Service-R5`, or `Service 2`.
			// Requiring that boundary keeps a short family like `imo` from swallowing
			// unrelated products such as iMoney and Imota.
			return !next || /[\d\s_-]/.test(next);
		});
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
		// pvapins currently returns an empty `picture`, so its historical embedded ISO
		// cannot be relied on. Resolve the two supplier naming differences explicitly.
		const aliases: Record<string, string[]> = {
			US: ['usa', 'united states', 'united states of america'],
			GB: ['uk', 'united kingdom', 'great britain'],
			AE: ['uae', 'united arab emirates']
		};
		const names = aliases[iso] || [];
		const byAlias = countries.find((c) =>
			names.includes(
				String(c.full_name ?? '')
					.trim()
					.toLowerCase()
			)
		);
		if (byAlias) return byAlias;
	}
	if (name) {
		const n = name.trim().toLowerCase();
		return countries.find(
			(c) =>
				String(c.full_name ?? '')
					.trim()
					.toLowerCase() === n
		);
	}
	return undefined;
}
