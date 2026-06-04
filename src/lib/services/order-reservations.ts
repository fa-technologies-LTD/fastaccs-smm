import { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { EXACT_PREVIEW_RESERVATION_KEY } from '$lib/services/exact-preview';

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

interface StandardReservationItem {
	orderItemId: string;
	categoryId: string;
	categoryName: string;
	quantity: number;
	exactAccountId?: string | null;
}

export async function releaseExpiredOrderReservations(
	client: PrismaClientLike = prisma
): Promise<number> {
	const affected = await client.$executeRaw`
		UPDATE accounts AS a
		SET
			status = 'available',
			reserved_until = NULL,
			order_item_id = NULL,
			credential_extras = credential_extras - ${EXACT_PREVIEW_RESERVATION_KEY},
			updated_at = NOW()
		FROM order_items AS oi
		JOIN orders AS o ON o.id = oi.order_id
		WHERE a.order_item_id = oi.id
			AND a.status = 'reserved'
			AND a.reserved_until IS NOT NULL
			AND a.reserved_until <= NOW()
			AND o.status NOT IN ('paid', 'completed')
			AND o.payment_status <> 'paid';
	`;
	return Number(affected || 0);
}

export async function reserveStandardAccountsForOrder(input: {
	client: Prisma.TransactionClient;
	items: StandardReservationItem[];
	reservedUntil: Date;
}): Promise<void> {
	for (const item of input.items) {
		if (item.exactAccountId) continue;

		const rows = await input.client.$queryRaw<Array<{ id: string }>>`
			WITH candidate AS (
				SELECT id
				FROM accounts
				WHERE category_id = ${item.categoryId}::uuid
					AND status = 'available'
				ORDER BY created_at ASC
				LIMIT ${item.quantity}
				FOR UPDATE SKIP LOCKED
			)
			UPDATE accounts AS a
			SET
				status = 'reserved',
				reserved_until = ${input.reservedUntil},
				order_item_id = ${item.orderItemId}::uuid,
				updated_at = NOW()
			FROM candidate
			WHERE a.id = candidate.id
			RETURNING a.id;
		`;

		if (rows.length !== item.quantity) {
			throw new Error(`STOCK_HOLD_INCOMPLETE:${item.categoryName}:${item.quantity}:${rows.length}`);
		}
	}
}

export async function extendOrderReservations(
	orderId: string,
	reservedUntil: Date,
	client: PrismaClientLike = prisma
): Promise<number> {
	const affected = await client.$executeRaw`
		UPDATE accounts AS a
		SET
			reserved_until = ${reservedUntil},
			credential_extras = CASE
				WHEN a.credential_extras ? ${EXACT_PREVIEW_RESERVATION_KEY}
					THEN jsonb_set(
						a.credential_extras,
						ARRAY[${EXACT_PREVIEW_RESERVATION_KEY}, 'expiresAt'],
						to_jsonb(${reservedUntil.toISOString()}::text),
						true
					)
				ELSE a.credential_extras
			END,
			updated_at = NOW()
		FROM order_items AS oi
		WHERE a.order_item_id = oi.id
			AND oi.order_id = ${orderId}::uuid
			AND a.status = 'reserved';
	`;
	return Number(affected || 0);
}

export async function releaseOrderReservations(
	orderId: string,
	client: PrismaClientLike = prisma
): Promise<number> {
	const affected = await client.$executeRaw`
		UPDATE accounts AS a
		SET
			status = 'available',
			reserved_until = NULL,
			order_item_id = NULL,
			credential_extras = a.credential_extras - ${EXACT_PREVIEW_RESERVATION_KEY},
			updated_at = NOW()
		FROM order_items AS oi
		WHERE a.order_item_id = oi.id
			AND oi.order_id = ${orderId}::uuid
			AND a.status = 'reserved';
	`;
	return Number(affected || 0);
}
