import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';

type OrderEventClient = Pick<Prisma.TransactionClient, 'orderEvent'>;

export interface RecordOrderEventInput {
	orderId: string;
	type: string;
	source: string;
	actorUserId?: string | null;
	orderItemId?: string | null;
	accountId?: string | null;
	amount?: number | null;
	description?: string | null;
	idempotencyKey?: string | null;
	metadata?: Record<string, unknown>;
	occurredAt?: Date;
}

function jsonMetadata(value: Record<string, unknown> | undefined): Prisma.InputJsonObject {
	return JSON.parse(JSON.stringify(value || {})) as Prisma.InputJsonObject;
}

/** Record a durable business event. Use the same transaction as the state/money write. */
export async function recordOrderEvent(
	input: RecordOrderEventInput,
	client: OrderEventClient = prisma
): Promise<void> {
	try {
		await client.orderEvent.create({
			data: {
				orderId: input.orderId,
				type: input.type,
				source: input.source,
				actorUserId: input.actorUserId ?? null,
				orderItemId: input.orderItemId ?? null,
				accountId: input.accountId ?? null,
				amount: input.amount ?? null,
				description: input.description ?? null,
				idempotencyKey: input.idempotencyKey ?? null,
				metadata: jsonMetadata(input.metadata),
				occurredAt: input.occurredAt ?? new Date()
			}
		});
	} catch (error) {
		// A duplicate idempotency key means another worker already recorded the same fact.
		if ((error as { code?: string })?.code === 'P2002') return;
		throw error;
	}
}

/** Observational transitions must never break the payment/fulfilment path. */
export function recordOrderEventBestEffort(input: RecordOrderEventInput): void {
	void recordOrderEvent(input).catch((error) => {
		console.error('[order-events] create failed:', (error as Error).message);
	});
}
