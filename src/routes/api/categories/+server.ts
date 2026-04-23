import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { applyTierSampleScreenshotSanitization } from '$lib/helpers/tierSampleScreenshots';
import { applyTierMerchandisingSanitization } from '$lib/helpers/tier-merchandising';

// GET /api/categories - Get categories with optional filtering
export async function GET({ url, locals }) {
	try {
		const type = url.searchParams.get('type');
		const includeParent = url.searchParams.get('include_parent') === 'true';
		const includeInactiveRequested = url.searchParams.get('include_inactive') === 'true';
		const isAdmin = Boolean(locals.user && locals.user.userType === 'ADMIN');
		const includeInactive = includeInactiveRequested && isAdmin;

		const where = {
			...(includeInactive ? {} : { isActive: true }),
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
export async function POST({ request, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const category = await request.json();
		const { parentId, ...rest } = category;
		const rawMetadata = JSON.parse(JSON.stringify(rest.metadata || {}));
		const metadata =
			rest.categoryType === 'tier'
				? applyTierMerchandisingSanitization(
						applyTierSampleScreenshotSanitization(rawMetadata as Record<string, unknown>)
					)
				: rawMetadata;

		const data = await prisma.category.create({
			data: {
				name: rest.name,
				slug: rest.slug,
				description: rest.description,
				categoryType: rest.categoryType,
				metadata: JSON.parse(JSON.stringify(metadata)),
				sortOrder: rest.sortOrder || 0,
				isActive: rest.isActive ?? true,
				...(parentId && {
					parent: {
						connect: { id: parentId }
					}
				})
			}
		});

		invalidateAdminStatsCache();

		return json({ data, error: null });
	} catch (error) {
		console.error('Failed to create category:', error);
		return json({ data: null, error: 'Failed to create category' }, { status: 500 });
	}
}
