/**
 * Stable URLs for per-app, per-country verification-number pages (/numbers/whatsapp/usa).
 * Slugs derive from the catalogue names, so new combos get pages automatically.
 */

export interface NumbersTierLike {
	tierId: string;
	serviceId: number;
	serviceName: string;
	countryName: string;
	countryCode: string;
	priceNgn: number;
	available: boolean;
}

export interface NumbersServiceLike<T extends NumbersTierLike = NumbersTierLike> {
	serviceId: number;
	serviceName: string;
	tiers: T[];
}

// Searchers type "uk", "usa"; catalogue names vary ("United Kingdom", "USA").
const COUNTRY_SLUGS: Record<string, string> = {
	'united kingdom': 'uk',
	'united states': 'usa',
	'united states of america': 'usa',
	usa: 'usa'
};
const COUNTRY_DISPLAY: Record<string, string> = {
	'united kingdom': 'UK',
	'united states': 'USA',
	'united states of america': 'USA'
};

// Still sold on /numbers, but no search landing pages: "number for PayPal/Coinbase verification"
// style queries attract fraud-driven traffic, which risks search penalties and payment-provider
// scrutiny. Owner can change this list.
const NO_SEARCH_PAGE_SERVICES = new Set(['paypal', 'coinbase', 'revolut', 'tinder', 'bumble']);

export function slugifyName(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function serviceSlug(serviceName: string): string {
	return slugifyName(serviceName);
}

export function countrySlug(countryName: string): string {
	const key = countryName.trim().toLowerCase();
	return COUNTRY_SLUGS[key] ?? slugifyName(countryName);
}

export function countryDisplayName(countryName: string): string {
	return COUNTRY_DISPLAY[countryName.trim().toLowerCase()] ?? countryName.trim();
}

export function hasSearchPage(serviceName: string): boolean {
	return !NO_SEARCH_PAGE_SERVICES.has(serviceSlug(serviceName));
}

export function numbersPagePath(serviceName: string, countryName: string): string | null {
	if (!hasSearchPage(serviceName)) return null;
	return `/numbers/${serviceSlug(serviceName)}/${countrySlug(countryName)}`;
}

/** Resolve URL params to a service + tier. Null when unknown or deliberately page-less. */
export function findNumbersPage<T extends NumbersTierLike>(
	services: Array<NumbersServiceLike<T>>,
	serviceParam: string,
	countryParam: string
): { service: NumbersServiceLike<T>; tier: T } | null {
	const wantedService = serviceParam.trim().toLowerCase();
	const wantedCountry = countryParam.trim().toLowerCase();
	const service = services.find((item) => serviceSlug(item.serviceName) === wantedService);
	if (!service || !hasSearchPage(service.serviceName)) return null;
	const tier = service.tiers.find((item) => countrySlug(item.countryName) === wantedCountry);
	return tier ? { service, tier } : null;
}

/** Every page that should exist, for the sitemap and the /numbers directory. */
export function listNumbersPages(
	services: NumbersServiceLike[]
): Array<{ path: string; serviceName: string; countryName: string }> {
	return services.flatMap((service) =>
		service.tiers.flatMap((tier) => {
			const path = numbersPagePath(service.serviceName, tier.countryName);
			return path
				? [{ path, serviceName: service.serviceName, countryName: tier.countryName }]
				: [];
		})
	);
}

/** 2-letter ISO country code → flag emoji (regional indicator letters). */
export function codeToFlag(code: string): string {
	const cc = (code || '').trim().toUpperCase().slice(0, 2);
	if (!/^[A-Z]{2}$/.test(cc)) return '🌍';
	return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
