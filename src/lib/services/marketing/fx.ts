import { prisma } from '$lib/prisma';

export const DEFAULT_USD_NGN_RATE = 1500;

/** USD→NGN rate for marketing maths: marketing setting, else the Numbers pricing rate. */
export async function getMarketingUsdNgnRate(): Promise<number> {
	const rows = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
		SELECT key, value FROM microcopy
		WHERE key IN ('config.marketing.usd_ngn_rate', 'config.phone.usd_ngn_rate')`;
	const byKey = new Map(rows.map((row) => [row.key, Number(row.value)]));
	const rate = byKey.get('config.marketing.usd_ngn_rate') || byKey.get('config.phone.usd_ngn_rate');
	return rate && rate > 0 ? rate : DEFAULT_USD_NGN_RATE;
}
