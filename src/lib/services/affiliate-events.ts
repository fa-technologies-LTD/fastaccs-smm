import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';

type AffiliateEventDb = PrismaClient | Prisma.TransactionClient;

/** Best-effort, idempotent affiliate funnel/audit event recording. P2021 is accepted
 * only during the additive migration window; P2002 means the event already exists. */
export async function recordAffiliateEvent(
	params: {
		type: string;
		dedupeKey: string;
		affiliateProgramId?: string | null;
		affiliateUserId?: string | null;
		referredUserId?: string | null;
		orderId?: string | null;
		source?: string | null;
		metadata?: Record<string, unknown>;
	},
	db: AffiliateEventDb = prisma
): Promise<boolean> {
	try {
		await db.affiliateEvent.create({
			data: {
				type: params.type,
				dedupeKey: params.dedupeKey,
				affiliateProgramId: params.affiliateProgramId || null,
				affiliateUserId: params.affiliateUserId || null,
				referredUserId: params.referredUserId || null,
				orderId: params.orderId || null,
				source: params.source || null,
				metadata: (params.metadata || {}) as Prisma.InputJsonValue
			}
		});
		return true;
	} catch (error) {
		const code = (error as { code?: string })?.code;
		if (code === 'P2002' || code === 'P2021') return false;
		// Funnel telemetry must never turn a completed money operation into an apparent
		// failure. The caller can continue; the missing event remains observable in logs.
		console.error('Failed to record affiliate event:', error);
		return false;
	}
}
