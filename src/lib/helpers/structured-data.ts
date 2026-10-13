/**
 * schema.org structured data. Product markup lets search engines show price and stock under a
 * listing; use it only on pages about ONE product (tier pages, a single numbers page), never on
 * category/list pages.
 */

/** JSON for inlining inside <script type="application/ld+json">; data can't close the tag. */
export function serializeJsonLd(data: unknown): string {
	return JSON.stringify(data)
		.replace(/</g, '\\u003c')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

/** The site's 1200×630 share image: a valid `image` until products have their own. */
export const SHARE_IMAGE_PATH = '/og-share-1200x630.png';

export function productJsonLd(input: {
	name: string;
	description: string;
	url: string;
	priceNgn: number;
	inStock: boolean;
	category?: string;
	image?: string;
}): Record<string, unknown> | null {
	if (!(input.priceNgn > 0) || !input.name.trim()) return null;
	return {
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: input.name.trim(),
		description: input.description.trim(),
		...(input.image ? { image: input.image } : {}),
		...(input.category ? { category: input.category } : {}),
		brand: { '@type': 'Brand', name: 'FastAccs' },
		offers: {
			'@type': 'Offer',
			url: input.url,
			price: String(Math.round(input.priceNgn)),
			priceCurrency: 'NGN',
			availability: input.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
			seller: { '@type': 'Organization', name: 'FastAccs' }
		}
	};
}

/** BreadcrumbList for the trail shown to search users (absolute URLs, last item = this page). */
export function breadcrumbJsonLd(
	items: Array<{ name: string; url: string }>
): Record<string, unknown> | null {
	const valid = items.filter((item) => item.name.trim() && item.url);
	if (valid.length < 2) return null;
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: valid.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name.trim(),
			item: item.url
		}))
	};
}
