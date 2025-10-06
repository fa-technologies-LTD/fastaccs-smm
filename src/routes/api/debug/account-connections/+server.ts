import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET /api/debug/account-connections - Debug account-category connections
export async function GET() {
	try {
		// Get all platforms
		const platforms = await prisma.category.findMany({
			where: { categoryType: 'platform' }
		});

		// Get all tiers (both platform-specific and global)
		const allTiers = await prisma.category.findMany({
			where: { categoryType: 'tier' },
			include: {
				parent: true
			}
		});

		// Separate platform-specific vs global tiers
		const platformSpecificTiers = allTiers.filter((t) => t.parentId !== null);
		const globalTiers = allTiers.filter((t) => t.parentId === null);

		// Get all accounts
		const allAccounts = await prisma.account.findMany({
			include: {
				batch: true,
				category: true
			}
		});

		// Find duplicate tier names
		const tierNameCounts = allTiers.reduce(
			(acc, tier) => {
				acc[tier.name] = (acc[tier.name] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		);

		const duplicateTierNames = Object.fromEntries(
			Object.entries(tierNameCounts).filter(([, count]) => count > 1)
		);

		const debug = {
			platforms: platforms.map((p) => ({
				id: p.id,
				name: p.name,
				slug: p.slug
			})),
			currentStructure: {
				platformSpecificTiers: platformSpecificTiers.map((t) => ({
					id: t.id,
					name: t.name,
					slug: t.slug,
					parentPlatform: t.parent?.name || 'Unknown'
				})),
				globalTiers: globalTiers.map((t) => ({
					id: t.id,
					name: t.name,
					slug: t.slug
				}))
			},
			accountSummary: {
				totalAccounts: allAccounts.length,
				accountsByPlatform: allAccounts.reduce(
					(acc, account) => {
						const platform = account.platform || 'Unknown';
						acc[platform] = (acc[platform] || 0) + 1;
						return acc;
					},
					{} as Record<string, number>
				),
				accountsByCategory: allAccounts.reduce(
					(acc, account) => {
						const categoryName = account.category?.name || 'Unknown';
						acc[categoryName] = (acc[categoryName] || 0) + 1;
						return acc;
					},
					{} as Record<string, number>
				),
				accountsWithMismatchedBatch: allAccounts.filter((a) => a.categoryId !== a.batch.categoryId)
					.length
			},
			problemsFound: {
				duplicateTierNames: duplicateTierNames,
				platformSpecificTiersCount: platformSpecificTiers.length,
				globalTiersCount: globalTiers.length,
				needsMigration:
					platformSpecificTiers.length > 0 || Object.keys(duplicateTierNames).length > 0
			},
			firstFewAccounts: allAccounts.slice(0, 3).map((a) => ({
				id: a.id,
				username: a.username,
				platform: a.platform,
				status: a.status,
				categoryId: a.categoryId,
				categoryName: a.category?.name || 'NULL',
				categoryIsGlobal: a.category?.parentId === null,
				batchId: a.batchId,
				batchCategoryId: a.batch.categoryId,
				mismatch: a.categoryId !== a.batch.categoryId
			}))
		};

		return json({ data: debug, error: null });
	} catch (error) {
		console.error('Debug failed:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

// POST /api/debug/account-connections - Fix tier structure (remove platform-specific tiers)
export async function POST() {
	try {
		// Step 1: Get all platform-specific tiers (these are wrong)
		const platformSpecificTiers = await prisma.category.findMany({
			where: {
				categoryType: 'tier',
				parentId: { not: null } // Has a parent (platform)
			}
		});

		// Step 2: Get all global tiers (these are correct)
		const globalTiers = await prisma.category.findMany({
			where: {
				categoryType: 'tier',
				parentId: null // No parent (global)
			}
		});

		// Step 3: Check if any accounts/batches are linked to platform-specific tiers
		const accountsLinkedToPlatformTiers = await prisma.account.count({
			where: {
				categoryId: {
					in: platformSpecificTiers.map((t) => t.id)
				}
			}
		});

		const batchesLinkedToPlatformTiers = await prisma.accountBatch.count({
			where: {
				categoryId: {
					in: platformSpecificTiers.map((t) => t.id)
				}
			}
		});

		if (accountsLinkedToPlatformTiers > 0 || batchesLinkedToPlatformTiers > 0) {
			return json({
				data: null,
				error: `Cannot delete platform-specific tiers: ${accountsLinkedToPlatformTiers} accounts and ${batchesLinkedToPlatformTiers} batches are still linked to them. Please move them to global tiers first.`
			});
		}

		// Step 4: Products table has been removed, no cleanup needed
		const productDeletions: Array<{
			productId: string;
			productName: string;
			categoryId: string;
			tierName: string;
		}> = [];

		// Step 5: Delete all platform-specific tiers
		const deleteResult = await prisma.category.deleteMany({
			where: {
				categoryType: 'tier',
				parentId: { not: null }
			}
		});

		return json({
			data: {
				deletedTiersCount: deleteResult.count,
				deletedProductsCount: productDeletions.length,
				remainingGlobalTiers: globalTiers.map((t) => ({
					id: t.id,
					name: t.name,
					slug: t.slug
				})),
				productDeletions,
				message: `Successfully deleted ${deleteResult.count} platform-specific tiers and ${productDeletions.length} products. Your accounts are already correctly linked!`
			},
			error: null
		});
	} catch (error) {
		console.error('Migration failed:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
