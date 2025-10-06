import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET /api/accounts - Get all accounts with optional filters
export async function GET({ url }) {
	try {
		const categoryId = url.searchParams.get('categoryId');
		const status = url.searchParams.get('status');
		const platform = url.searchParams.get('platform');
		const batchId = url.searchParams.get('batchId');

		const where: Record<string, string> = {};
		if (categoryId) where.categoryId = categoryId;
		if (status) where.status = status;
		if (platform) where.platform = platform;
		if (batchId) where.batchId = batchId;

		const data = await prisma.account.findMany({
			where,
			orderBy: { createdAt: 'desc' }
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

// POST /api/accounts - Create new account
export async function POST({ request }) {
	try {
		const accountData = await request.json();

		// Remove metadata field if it exists since Account model doesn't have it
		if ('metadata' in accountData) {
			delete accountData.metadata;
		}

		const data = await prisma.account.create({
			data: accountData
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
