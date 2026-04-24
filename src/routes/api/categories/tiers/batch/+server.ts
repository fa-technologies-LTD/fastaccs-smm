import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import type { RequestHandler } from './$types';

const MAX_TIER_BATCH_IDS = 100;

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSlug(value: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value);
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { ids } = await request.json();

		if (!Array.isArray(ids) || ids.length === 0) {
			return json({ error: 'Invalid tier IDs' }, { status: 400 });
		}

		const normalizedInputs = Array.from(
			new Set(
				ids
					.filter((id): id is string => typeof id === 'string')
					.map((id) => id.trim())
					.filter((id) => id.length > 0)
			)
		);

		const uuidIds = normalizedInputs.filter((id) => isUuid(id));
		const slugIds = normalizedInputs
			.filter((id) => !isUuid(id) && isSlug(id))
			.map((id) => id.toLowerCase());

		if (uuidIds.length === 0 && slugIds.length === 0) {
			return json({ error: 'Invalid tier IDs' }, { status: 400 });
		}

		if (uuidIds.length + slugIds.length > MAX_TIER_BATCH_IDS) {
			return json(
				{
					error: `Too many tier IDs requested. Maximum ${MAX_TIER_BATCH_IDS} IDs per request.`
				},
				{ status: 400 }
			);
		}

		const tiers = await prisma.category.findMany({
			where: {
				categoryType: 'tier',
				isActive: true,
				OR: [
					...(uuidIds.length > 0 ? [{ id: { in: uuidIds } }] : []),
					...(slugIds.length > 0 ? [{ slug: { in: slugIds } }] : [])
				]
			},
			include: {
				parent: {
					select: {
						id: true,
						name: true,
						slug: true,
						metadata: true
					}
				}
			}
		});

		return json({
			success: true,
			data: tiers
		});
	} catch (error) {
		console.error('Error fetching tiers:', error);
		return json({ error: 'Failed to fetch tiers' }, { status: 500 });
	}
};
