import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { blogPosts } from '$lib/blog/posts';
import { consumeRequestAllowance } from '$lib/server/request-rate-limit';

const BLOG_SLUGS = new Set(blogPosts.map((post) => post.slug));
const LIKE_WINDOW_MS = 60_000;
const LIKES_PER_WINDOW = 10;

function isKnownPost(slug: string): boolean {
	return BLOG_SLUGS.has(slug);
}

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const { slug } = params;
	if (!isKnownPost(slug)) return json({ error: 'Post not found' }, { status: 404 });
	setHeaders({ 'cache-control': 'public, max-age=15, s-maxage=30' });
	const likes = await prisma.blogPostLike.count({ where: { slug } });
	return json({ likes });
};

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const { slug } = params;
	if (!isKnownPost(slug)) return json({ error: 'Post not found' }, { status: 404 });
	if (
		!consumeRequestAllowance({
			namespace: 'blog-like',
			request,
			getClientAddress,
			limit: LIKES_PER_WINDOW,
			windowMs: LIKE_WINDOW_MS
		})
	) {
		return json(
			{ error: 'Too many likes. Please try again shortly.' },
			{
				status: 429,
				headers: { 'retry-after': '60' }
			}
		);
	}
	await prisma.blogPostLike.create({ data: { slug } });
	const likes = await prisma.blogPostLike.count({ where: { slug } });
	return json({ likes });
};
