import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET /api/categories - Get categories with optional filtering
export async function GET({ url }) {
	try {
		const type = url.searchParams.get('type');
		const includeParent = url.searchParams.get('include_parent') === 'true';

		const where = {
			isActive: true,
			categoryType: type || 'platform'
		};

		const categories = await prisma.category.findMany({
			where,
			...(includeParent && {
				include: {
					parent: {
						select: {
							id: true,
							name: true,
							slug: true
						}
					}
				}
			}),
			orderBy: {
				sortOrder: 'asc'
			}
		});

		return json({ data: categories, error: null });
	} catch (error) {
		console.error('Failed to fetch categories:', error);
		return json({ data: null, error: 'Failed to fetch categories' }, { status: 500 });
	}
}

// POST /api/categories - Create new category
export async function POST({ request }) {
	try {
		const category = await request.json();
		const { parentId, ...rest } = category;

		const data = await prisma.category.create({
			data: {
				name: rest.name,
				slug: rest.slug,
				description: rest.description,
				categoryType: rest.categoryType,
				metadata: JSON.parse(JSON.stringify(rest.metadata || {})),
				sortOrder: rest.sortOrder || 0,
				isActive: rest.isActive ?? true,
				...(parentId && {
					parent: {
						connect: { id: parentId }
					}
				})
			}
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Failed to create category:', error);
		return json({ data: null, error: 'Failed to create category' }, { status: 500 });
	}
}
