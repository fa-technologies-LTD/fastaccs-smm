import { prisma } from '$lib/prisma';

/** Deployment may precede the separately approved migration. Never start external work then. */
export async function isMarketingSchemaReady(): Promise<boolean> {
	const [row] = await prisma.$queryRaw<Array<{ ready: boolean }>>`
		SELECT to_regclass('public.marketing_channels') IS NOT NULL
			AND to_regclass('public.marketing_spend_daily') IS NOT NULL
			AND to_regclass('public.marketing_actions') IS NOT NULL AS ready`;
	return row?.ready === true;
}
