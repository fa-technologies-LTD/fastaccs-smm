import { prisma } from '$lib/prisma';
import { serverCache } from '$lib/helpers/cache';

const CACHE_KEY = 'homepage:catalog';
const CACHE_TTL_MS = 2 * 60 * 1000;

function readPrice(metadata: unknown): number {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
	const record = metadata as Record<string, unknown>;
	const pricing =
		record.pricing && typeof record.pricing === 'object'
			? (record.pricing as Record<string, unknown>)
			: null;
	const price = Number(pricing?.base_price ?? record.price ?? 0);
	return Number.isFinite(price) && price > 0 ? price : 0;
}

export async function getHomepageCatalog() {
	const cached = serverCache.get<Awaited<ReturnType<typeof loadHomepageCatalog>>>(
		CACHE_KEY,
		CACHE_TTL_MS
	);
	if (cached) return cached;

	const catalog = await loadHomepageCatalog();
	serverCache.set(CACHE_KEY, catalog);
	return catalog;
}

async function loadHomepageCatalog() {
	const platforms = await prisma.category.findMany({
		where: { categoryType: 'platform', isActive: true },
		select: {
			id: true,
			name: true,
			slug: true,
			description: true,
			metadata: true,
			children: {
				where: { categoryType: 'tier', isActive: true },
				select: {
					metadata: true,
					_count: { select: { accounts: { where: { status: 'available' } } } }
				}
			}
		},
		orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
	});

	return platforms.map((platform) => {
		const prices = platform.children.map((tier) => readPrice(tier.metadata)).filter((p) => p > 0);
		const metadata =
			platform.metadata &&
			typeof platform.metadata === 'object' &&
			!Array.isArray(platform.metadata)
				? (platform.metadata as Record<string, unknown>)
				: undefined;
		return {
			id: platform.id,
			name: platform.name,
			slug: platform.slug,
			description: platform.description,
			metadata,
			tierCount: platform.children.length,
			totalAccounts: platform.children.reduce(
				(sum, tier) => sum + Number(tier._count.accounts || 0),
				0
			),
			minPrice: prices.length > 0 ? Math.min(...prices) : null
		};
	});
}
