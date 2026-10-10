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

export function productJsonLd(input: {
	name: string;
	description: string;
	url: string;
	priceNgn: number;
	inStock: boolean;
	category?: string;
}): Record<string, unknown> | null {
	if (!(input.priceNgn > 0) || !input.name.trim()) return null;
	return {
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: input.name.trim(),
		description: input.description.trim(),
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
