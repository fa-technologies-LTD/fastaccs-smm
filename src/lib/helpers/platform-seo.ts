import { formatPrice } from '$lib/helpers/utils';

/**
 * Search/ad-facing copy for account platform pages. Titles carry the buyer's intent (product +
 * starting price) and the FAQ only restates promises already published on the Support page.
 */

export interface SeoFaqItem {
	question: string;
	answer: string;
}

// Stored platform names are admin-entered ("X ", "Tiktok", "VPNs"); searchers use these spellings.
const DISPLAY_NAMES: Record<string, string> = {
	x: 'X (Twitter)',
	tiktok: 'TikTok',
	linkedin: 'LinkedIn',
	instagram: 'Instagram',
	facebook: 'Facebook',
	vpns: 'VPN',
	mails: 'Email'
};

export function platformDisplayName(name: string, slug: string): string {
	return DISPLAY_NAMES[slug.trim().toLowerCase()] ?? name.trim();
}

/** Cheapest price among in-stock tiers; falls back to the cheapest listed price. 0 when none. */
export function startingPrice(tiers: Array<{ price: number; visible_available: number }>): number {
	const priced = tiers.filter((tier) => tier.price > 0);
	const inStock = priced.filter((tier) => tier.visible_available > 0);
	const pool = inStock.length > 0 ? inStock : priced;
	return pool.length > 0 ? Math.min(...pool.map((tier) => tier.price)) : 0;
}

export function buildPlatformSeo(input: {
	name: string;
	slug: string;
	startingPriceNgn: number;
	typeCount: number;
}): { title: string; description: string; type: 'website' } {
	const display = platformDisplayName(input.name, input.slug);
	const from = input.startingPriceNgn > 0 ? ` from ${formatPrice(input.startingPriceNgn)}` : '';
	const types =
		input.typeCount > 1 ? `${input.typeCount} account types` : `${display} accounts ready to use`;
	return {
		title: `Buy ${display} Accounts${from ? ` —${from}` : ''} | FastAccs`,
		description: `Buy ${display} accounts${from}. ${types}, naira checkout via Monnify, and most orders delivered instantly to your dashboard.`,
		type: 'website'
	};
}

export function buildPlatformFaq(display: string): SeoFaqItem[] {
	return [
		{
			question: `How fast will I get my ${display} account?`,
			answer:
				'Most orders are delivered instantly to your dashboard. In rare cases, it may take up to a few minutes.'
		},
		{
			question: 'How do I pay?',
			answer:
				'In naira, securely via Monnify. Card, bank transfer and USSD are available depending on current Monnify availability.'
		},
		{
			question: 'Where do I find my account details after paying?',
			answer:
				'Go to your Dashboard and open the Purchases tab. Your delivered account details are listed there.'
		},
		{
			question: 'What if I have trouble logging in?',
			answer:
				'Test the login immediately after delivery. If anything is wrong, contact support on WhatsApp or email, ideally within 2 hours of purchase, so we can help quickly.'
		},
		{
			question: 'Can I choose a specific account?',
			answer:
				'Accounts are assigned automatically from our inventory to keep delivery fair and fast.'
		}
	];
}

/** FAQPage structured data, serialized safely for inlining in a <script> tag. */
export function faqJsonLd(items: SeoFaqItem[]): string {
	return JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: items.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: { '@type': 'Answer', text: item.answer }
		}))
	}).replace(/</g, '\\u003c');
}
