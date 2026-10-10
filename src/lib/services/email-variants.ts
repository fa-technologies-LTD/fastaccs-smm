import { prisma } from '$lib/prisma';

/**
 * Rotate marketing copy so a repeat send never reads as the same message twice.
 * We count how many of this campaign the user has already been sent and return
 * `timesSent % variantCount`, so they cycle through every variant before any repeat.
 * Reuses the existing EmailNotification log — no new schema.
 */
export async function pickVariantIndex(
	userId: string | null | undefined,
	notificationType: string,
	variantCount: number
): Promise<number> {
	if (!userId || variantCount <= 1) return 0;
	const seen = await prisma.emailNotification
		.count({ where: { userId, notificationType } })
		.catch(() => 0);
	return seen % variantCount;
}

// --- Restock alert (fires every time a subscribed tier restocks — highest repeat) ---
export interface RestockVars {
	tier: string;
	platform: string;
	urgency: string;
}
export const RESTOCK_VARIANTS: Array<{
	subject: (v: RestockVars) => string;
	body: (v: RestockVars) => string;
	ctaText: string;
}> = [
	{
		subject: (v) => `${v.tier} is back in stock`,
		body: (v) =>
			`${v.tier} on ${v.platform} is back in stock. Check the price and delivery details before you order.\n\n${v.urgency}`,
		ctaText: "See what's live"
	},
	{
		subject: (v) => `Back in stock: ${v.tier}`,
		body: (v) =>
			`You wanted ${v.tier} (${v.platform}) — it's available now. Stock moves fast, so order while it lasts.\n\n${v.urgency}`,
		ctaText: 'Buy now'
	},
	{
		subject: (v) => `${v.tier} — available now`,
		body: (v) =>
			`${v.tier} on ${v.platform} is available again. Support is here if you need help choosing.\n\n${v.urgency}`,
		ctaText: 'Grab yours'
	}
];

// --- Win-back (dormant buyers; can re-fire over months) ---
export interface WinbackVars {
	firstName: string;
	platformLine: string;
}
export const WINBACK_VARIANTS: Array<{
	subject: string;
	body: (v: WinbackVars) => string;
	ctaText: string;
}> = [
	{
		subject: 'Fresh stock just landed',
		body: (v) =>
			`Hi ${v.firstName},\n\nBrowse the latest accounts in stock and choose what you need.\n\n${v.platformLine}`,
		ctaText: "See what's live"
	},
	{
		subject: "Been a while — here's what's new",
		body: (v) =>
			`Hi ${v.firstName},\n\nReady for another order? See what's available now. We're here if you need help.\n\n${v.platformLine}`,
		ctaText: 'Browse accounts'
	},
	{
		subject: 'Your next order is in stock',
		body: (v) =>
			`Hi ${v.firstName},\n\nNeed one account or several? Browse the current stock and choose what works for you.\n\n${v.platformLine}`,
		ctaText: 'See what fits'
	}
];
