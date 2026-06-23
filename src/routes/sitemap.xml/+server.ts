import { prisma } from '$lib/prisma';
import { getSiteBaseUrl } from '$lib/helpers/site-url';
import { blogPosts } from '$lib/blog/posts';
import type { RequestHandler } from './$types';

interface SitemapUrl {
	path: string;
	lastmod?: string;
}

const STATIC_PAGES: string[] = [
	'/',
	'/platforms',
	'/how-it-works',
	'/services',
	'/affiliate',
	'/affiliate-terms',
	'/support',
	'/privacy',
	'/terms',
	'/refund-policy',
	'/acceptable-use',
	'/blog'
];

function escapeXml(value: string): string {
	return value.replace(/[<>&'"]/g, (char) => {
		switch (char) {
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '&':
				return '&amp;';
			case "'":
				return '&apos;';
			case '"':
				return '&quot;';
			default:
				return char;
		}
	});
}

export const GET: RequestHandler = async () => {
	const baseUrl = getSiteBaseUrl();
	const urls: SitemapUrl[] = STATIC_PAGES.map((path) => ({ path }));

	for (const post of blogPosts) {
		urls.push({ path: `/blog/${post.slug}`, lastmod: post.updatedAt });
	}

	try {
		const platforms = await prisma.category.findMany({
			where: { categoryType: 'platform', isActive: true },
			select: {
				slug: true,
				updatedAt: true,
				children: {
					where: { categoryType: 'tier', isActive: true },
					select: { slug: true, updatedAt: true }
				}
			}
		});

		for (const platform of platforms) {
			urls.push({
				path: `/platforms/${platform.slug}`,
				lastmod: platform.updatedAt.toISOString()
			});

			for (const tier of platform.children) {
				urls.push({
					path: `/platforms/${platform.slug}/tiers/${tier.slug}`,
					lastmod: tier.updatedAt.toISOString()
				});
			}
		}
	} catch (error) {
		console.error('Error loading platform/tier slugs for sitemap:', error);
	}

	try {
		const boostingServices = await prisma.category.findMany({
			where: { categoryType: 'boosting_service', isActive: true },
			select: { metadata: true, updatedAt: true }
		});

		const latestByPlatform = new Map<string, Date>();
		for (const service of boostingServices) {
			const platform = (service.metadata as Record<string, unknown> | null)?.boosting_platform;
			if (typeof platform !== 'string' || !platform) continue;
			const existing = latestByPlatform.get(platform);
			if (!existing || service.updatedAt > existing) {
				latestByPlatform.set(platform, service.updatedAt);
			}
		}

		for (const [platform, updatedAt] of latestByPlatform) {
			urls.push({ path: `/services/${platform}`, lastmod: updatedAt.toISOString() });
		}
	} catch (error) {
		console.error('Error loading boosting service platforms for sitemap:', error);
	}

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map((url) => {
		const loc = `${baseUrl}${url.path}`;
		const lastmod = url.lastmod ? `\n\t\t<lastmod>${url.lastmod.slice(0, 10)}</lastmod>` : '';
		return `\t<url>\n\t\t<loc>${escapeXml(loc)}</loc>${lastmod}\n\t</url>`;
	})
	.join('\n')}
</urlset>
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
