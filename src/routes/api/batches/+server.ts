import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';

// GET /api/batches - Get all batches with optional filters
export async function GET({ url, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const categoryId = url.searchParams.get('categoryId');
		const status = url.searchParams.get('status');
		const limit = url.searchParams.get('limit');
		const id = url.searchParams.get('id');

		const where: Record<string, string> = {};
		if (categoryId) where.categoryId = categoryId;
		if (status) where.status = status;
		if (id) where.id = id;

		const data = await prisma.accountBatch.findMany({
			where,
			include: {
				category: true,
				accounts: {
					select: {
						id: true,
						status: true
					}
				}
			},
			orderBy: { createdAt: 'desc' },
			...(limit && { take: parseInt(limit) })
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

// POST /api/batches - Create new batch
export async function POST({ request, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const batchData = await request.json();

		const data = await prisma.accountBatch.create({
			data: {
				...batchData,
				descriptors: batchData.metadata || {}
			},
			include: {
				category: true,
				accounts: true
			}
		});

		invalidateAdminStatsCache();

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
