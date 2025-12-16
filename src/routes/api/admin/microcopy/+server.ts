import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET all microcopy
export const GET: RequestHandler = async ({ url }) => {
	try {
		const category = url.searchParams.get('category');
		const isActive = url.searchParams.get('isActive');

		const where: { category?: string; isActive?: boolean } = {};
		if (category) where.category = category;
		if (isActive !== null) where.isActive = isActive === 'true';

		const microcopy = await prisma.microcopy.findMany({
			where,
			orderBy: { key: 'asc' }
		});

		return json({ microcopy });
	} catch (error) {
		console.error('Error fetching microcopy:', error);
		return json({ error: 'Failed to fetch microcopy' }, { status: 500 });
	}
};

// POST create new microcopy
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const { key, value, description, category } = await request.json();

		if (!key || !value) {
			return json({ error: 'Key and value are required' }, { status: 400 });
		}

		// Check if key already exists
		const existing = await prisma.microcopy.findUnique({
			where: { key }
		});

		if (existing) {
			return json({ error: 'Key already exists' }, { status: 400 });
		}

		const microcopy = await prisma.microcopy.create({
			data: {
				key,
				value,
				description,
				category: category || 'general'
			}
		});

		return json({ microcopy }, { status: 201 });
	} catch (error) {
		console.error('Error creating microcopy:', error);
		return json({ error: 'Failed to create microcopy' }, { status: 500 });
	}
};
