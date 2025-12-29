import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

interface TierMetadata {
	pricing?: {
		base_price?: number | string;
	};
	price?: number | string;
}

// GET /api/categories/tiers/[platformId] - Get tiers for a specific platform
export async function GET({ params }) {
	try {
		const platformId = params.platformId;

		// First, get the platform info to get the platform slug
		const platform = await prisma.category.findUnique({
			where: { id: platformId }
		});

		if (!platform) {
			return json({ data: null, error: 'Platform not found' }, { status: 404 });
		}

		// Get all tiers that belong to this platform
		const tiers = await prisma.category.findMany({
			where: {
				categoryType: 'tier',
				parentId: platformId, // Tiers that belong to this platform
				isActive: true
			},
			include: {
				accounts: {
					where: {
						status: 'available' // Only available accounts
					}
				}
			},
			orderBy: {
				sortOrder: 'asc'
			}
		});

		// Transform to include account counts and pricing from tier metadata
		const tiersWithCounts = tiers.map((tier) => {
			const metadata = tier.metadata as TierMetadata;

			// Extract price from new or old metadata format
			let price = 0;
			if (metadata?.pricing?.base_price) {
				price = Number(metadata.pricing.base_price);
			} else if (metadata?.price) {
				price = Number(metadata.price);
			}

			return {
				id: tier.id,
				name: tier.name,
				slug: tier.slug,
				description: tier.description,
				isActive: tier.isActive,
				metadata: tier.metadata,
				sortOrder: tier.sortOrder,
				accountCount: tier.accounts.length,
				price,
				productId: tier.id,
				productStatus: tier.isActive ? 'active' : 'inactive'
			};
		});

		return json({ data: tiersWithCounts, error: null });
	} catch (error) {
		console.error('Failed to fetch tiers:', error);
		return json({ data: null, error: 'Failed to fetch tiers' }, { status: 500 });
	}
}
