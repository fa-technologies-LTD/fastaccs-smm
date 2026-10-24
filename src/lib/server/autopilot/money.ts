import { prisma } from '$lib/prisma';
import { buildRevenueOrderWindowWhere, toNetSales } from '$lib/helpers/order-revenue.server';
import { buildTrackedUrl, slugifyUtm } from '$lib/helpers/tracked-link';
import { placementCode } from './rules';
import type { AutopilotSettings } from './settings';

/** The site the tracked links point at. */
export const SITE_URL = 'https://smm.fastaccs.com';

export function trackedLinkFor(username: string, settings: AutopilotSettings): string {
	return (
		buildTrackedUrl({
			baseUrl: SITE_URL,
			path: settings.landingPath,
			source: 'telegram',
			medium: 'post',
			campaign: settings.campaignKey,
			content: username
		}) ?? `${SITE_URL}${settings.landingPath}`
	);
}

/** A per-channel discount code (10% by default, one use per customer, ends after N days). */
export async function ensurePlacementCode(
	username: string,
	settings: AutopilotSettings,
	existing: string | null
): Promise<string> {
	if (existing) return existing;
	const taken = new Set(
		(
			await prisma.promotionCode.findMany({
				where: {
					code: {
						startsWith: `TG${username
							.replace(/[^a-z0-9]/gi, '')
							.toUpperCase()
							.slice(0, 6)}`
					}
				},
				select: { code: true }
			})
		).map((row) => row.code)
	);
	const code = placementCode(username, settings.codePercent, taken);
	if (settings.codePercent > 0) {
		await prisma.promotionCode.create({
			data: {
				code,
				type: 'PERCENT',
				value: settings.codePercent,
				currency: 'NGN',
				minOrderValue: 0,
				usageCap: 200,
				singleUsePerUser: true,
				isActive: true,
				platformIds: [],
				endsAt: new Date(Date.now() + settings.codeDays * 86_400_000)
			}
		});
	}
	return code;
}

/** Record what we paid against the Telegram channel in the marketing ledger (Admin → Marketing). */
export async function bookSpend(
	username: string,
	amountNgn: number,
	settings: AutopilotSettings,
	at: Date = new Date()
): Promise<void> {
	const day = new Date(new Date(at.getTime() + 3_600_000).toISOString().slice(0, 10)); // WAT calendar day
	await prisma.marketingChannel.upsert({
		where: { key: 'telegram' },
		create: {
			key: 'telegram',
			name: 'Telegram sponsored posts',
			kind: 'direct',
			status: 'testing',
			targetCacNgn: 2_600
		},
		update: {}
	});
	const where = {
		channelKey_campaignKey_placementKey_day: {
			channelKey: 'telegram',
			campaignKey: settings.campaignKey,
			placementKey: username,
			day
		}
	};
	await prisma.marketingSpendDaily.upsert({
		where,
		create: {
			channelKey: 'telegram',
			campaignKey: settings.campaignKey,
			placementKey: username,
			day,
			spendNgn: amountNgn,
			source: 'manual'
		},
		update: { spendNgn: { increment: amountNgn } }
	});
}

/**
 * Sales a partner's code brought in: orders paid in the window that used the code, net of refunds,
 * counted with the same revenue rules as the sales reports (refunded and self-release orders excluded).
 */
export async function partnerSales(
	code: string,
	from: Date,
	to: Date
): Promise<{ orders: number; salesNgn: number }> {
	const orders = await prisma.order.findMany({
		where: {
			AND: [
				buildRevenueOrderWindowWhere(from, to),
				{ promotionCode: { equals: code, mode: 'insensitive' } }
			]
		},
		select: { totalAmount: true, refundedAmount: true }
	});
	return {
		orders: orders.length,
		salesNgn: orders.reduce((sum, o) => sum + toNetSales(o.totalAmount, o.refundedAmount), 0)
	};
}

const GROUP_CAMPAIGN = 'tg-groups';

/** Tracked link for one group (to a platform's page when the request named one, or a given path). */
export function groupTrackedLink(group: string, platformSlug?: string, toPath?: string): string {
	const path = toPath ?? (platformSlug ? `/platforms/${platformSlug}` : '/');
	return (
		buildTrackedUrl({
			baseUrl: SITE_URL,
			path,
			source: 'telegram',
			medium: 'group',
			campaign: GROUP_CAMPAIGN,
			content: group
		}) ?? `${SITE_URL}${path}`
	);
}

/** Site visits that came through a group's links since a time (consented visits only). */
export async function groupVisitsSince(group: string, since: Date): Promise<number> {
	return prisma.analyticsEvent.count({
		where: {
			source: 'telegram',
			campaign: GROUP_CAMPAIGN,
			content: slugifyUtm(group, 120),
			createdAt: { gte: since }
		}
	});
}
