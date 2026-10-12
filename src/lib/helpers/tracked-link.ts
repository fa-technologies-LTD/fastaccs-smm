/**
 * Tracked links for marketing placements. Every paid post, banner or network campaign gets its own
 * utm-tagged URL so the source/campaign shows up against signups, buyers and revenue.
 */

export interface TrackedLinkInput {
	baseUrl: string;
	path: string;
	source: string;
	medium?: string;
	campaign?: string;
	content?: string;
}

// utm values end up in reports and cookies; keep them short, lowercase and URL-safe.
export function slugifyUtm(value: string, max = 60): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, max);
}

/** Null when there's no usable source (an untagged link can't be credited to anything). */
export function buildTrackedUrl(input: TrackedLinkInput): string | null {
	const source = slugifyUtm(input.source);
	if (!source) return null;
	const path = input.path.trim().startsWith('/') ? input.path.trim() : `/${input.path.trim()}`;
	let url: URL;
	try {
		url = new URL(path, input.baseUrl);
	} catch {
		return null;
	}
	const params: Array<[string, string]> = [
		['utm_source', source],
		['utm_medium', slugifyUtm(input.medium ?? '')],
		['utm_campaign', slugifyUtm(input.campaign ?? '', 80)],
		['utm_content', slugifyUtm(input.content ?? '', 120)]
	];
	for (const [key, value] of params) if (value) url.searchParams.set(key, value);
	return url.toString();
}

// Ad networks fill these placeholders per click, so they must stay unencoded in the destination
// URL. Confirm the token names in the network's campaign form when creating a campaign.
const NETWORK_MACROS: Record<string, { campaign: string; content: string; click: string }> = {
	propellerads: { campaign: '{campaignid}', content: '{zoneid}', click: '${SUBID}' }
};

export function hasNetworkMacros(source: string): boolean {
	return slugifyUtm(source) in NETWORK_MACROS;
}

/** Destination URL for an ad network campaign: campaign, zone and click id filled by the network. */
export function buildNetworkTemplateUrl(input: {
	baseUrl: string;
	path: string;
	source: string;
	medium?: string;
}): string | null {
	const macros = NETWORK_MACROS[slugifyUtm(input.source)];
	const base = buildTrackedUrl({ ...input, campaign: '', content: '' });
	if (!macros || !base) return null;
	return `${base}&utm_campaign=${macros.campaign}&utm_content=${macros.content}&fa_click=${macros.click}`;
}
