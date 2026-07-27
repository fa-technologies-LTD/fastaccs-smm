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
			`${v.tier} on ${v.platform} is live again. Instant delivery the moment you pay — grab it before it's gone.\n\n${v.urgency}`,
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
			`Restocked: ${v.tier} on ${v.platform}. Real accounts, same-day delivery, support if you need it.\n\n${v.urgency}`,
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
			`Hi ${v.firstName},\n\nNew accounts are in — Instagram, X, TikTok and more, ready for instant delivery. Come see what's live.\n\n${v.platformLine}`,
		ctaText: "See what's live"
	},
	{
		subject: "Been a while — here's what's new",
		body: (v) =>
			`Hi ${v.firstName},\n\nWe've restocked accounts, numbers and boosting since your last order. Same fast delivery, same support. Take a look.\n\n${v.platformLine}`,
		ctaText: 'Browse accounts'
	},
	{
		subject: 'Your next order is in stock',
		body: (v) =>
			`Hi ${v.firstName},\n\nA quick account, bulk for resale, or a boost — it's all available now. Pick up where you left off.\n\n${v.platformLine}`,
		ctaText: 'See what fits'
	}
];
