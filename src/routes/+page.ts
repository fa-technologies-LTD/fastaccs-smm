import type { PageLoad } from './$types';

interface PlatformData {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	metadata?: Record<string, unknown>;
	tierCount: number;
	totalAccounts: number;
	minPrice: number | null;
}

interface TestimonialData {
	id: string;
	buyerType: string;
	rating: number;
	quote: string;
	initials: string;
	customerLabel: string;
	sku: string;
}

export const load: PageLoad = async ({ fetch }) => {
	try {
		const platformResponse = await fetch('/api/categories?type=platform');
		if (!platformResponse.ok) {
			return {
				platforms: [] as PlatformData[],
				testimonials: [] as TestimonialData[]
			};
		}

		const result = await platformResponse.json();
		const platforms = (result.data || []) as Array<{
			id: string;
			name: string;
			slug: string;
			description?: string | null;
			metadata?: Record<string, unknown>;
		}>;

		const platformsWithStats = await Promise.all(
			platforms.map(async (platform) => {
				try {
					const tiersResponse = await fetch(`/api/categories/tiers/${platform.id}`);
					const tiersResult = tiersResponse.ok ? await tiersResponse.json() : { data: [] };
					const tiers = (tiersResult.data || []) as Array<{
						price?: number;
						accountCount?: number;
					}>;

					const totalAccounts = tiers.reduce(
						(sum, tier) => sum + Number(tier.accountCount || 0),
						0
					);
					const pricedTiers = tiers
						.map((tier) => Number(tier.price || 0))
						.filter((price) => price > 0);

					return {
						id: platform.id,
						name: platform.name,
						slug: platform.slug,
						description: platform.description,
						metadata: platform.metadata,
						tierCount: tiers.length,
						totalAccounts,
						minPrice: pricedTiers.length > 0 ? Math.min(...pricedTiers) : null
					} as PlatformData;
				} catch {
					return {
						id: platform.id,
						name: platform.name,
						slug: platform.slug,
						description: platform.description,
						metadata: platform.metadata,
						tierCount: 0,
						totalAccounts: 0,
						minPrice: null
					} as PlatformData;
				}
			})
		);

		const testimonialsResponse = await fetch('/api/reviews/featured?limit=3');
		const testimonialsResult = testimonialsResponse.ok
			? await testimonialsResponse.json()
			: { data: [] };
		const testimonials = (testimonialsResult.data || []) as TestimonialData[];

		return {
			platforms: platformsWithStats,
			testimonials
		};
	} catch (error) {
		console.error('Failed to load featured platforms for home page:', error);
		return {
			platforms: [] as PlatformData[],
			testimonials: [] as TestimonialData[]
		};
	}
};
