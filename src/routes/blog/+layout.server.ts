import { blogPosts } from '$lib/blog/posts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ url }) => {
	const segments = url.pathname.split('/').filter(Boolean);

	if (segments.length <= 1) {
		return {
			seo: {
				title: 'FastAccs Blog — Guides for Buying Social Media Accounts',
				description:
					'Practical guides on buying aged Instagram, X, TikTok and Facebook accounts safely — including warm-up tips, safety checklists, and what to look for before you pay.',
				type: 'website'
			}
		};
	}

	const slug = segments[1];
	const post = blogPosts.find((p) => p.slug === slug);
	if (!post) return {};

	return {
		seo: {
			title: `${post.title} | FastAccs Blog`,
			description: post.description,
			type: 'article'
		}
	};
};
