import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';

/** Do not overwrite a manual price/lock saved after a catalogue sync took its snapshot. */
export async function updateNumbersCatalogSnapshot(
	id: string,
	expectedMetadata: Prisma.JsonValue | undefined,
	metadata: Prisma.InputJsonValue,
	database: Pick<PrismaClient, 'category'> = prisma
): Promise<boolean> {
	try {
		await database.category.update({
			where: { id, metadata: { equals: expectedMetadata ?? Prisma.JsonNull } },
			data: { metadata }
		});
		return true;
	} catch (cause) {
		if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2025')
			return false; // A newer snapshot wins. Refresh stock/cost on the next sync.
		throw cause;
	}
}
