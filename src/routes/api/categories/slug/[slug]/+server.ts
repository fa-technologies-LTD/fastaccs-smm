import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET /api/categories/slug/[slug] - Get category by slug
export async function GET({ params }) {
	try {
		const slug = params.slug;
		const category = await prisma.category.findFirst({
			where: {
				slug,
				isActive: true
			}
		});
		return json({ data: category, error: null });
	} catch (error) {
		console.error('Failed to fetch category:', error);
		return json({ data: null, error: 'Failed to fetch category' }, { status: 500 });
	}
}
