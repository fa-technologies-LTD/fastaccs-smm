import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

export const GET: RequestHandler = async ({ params }) => {
	const { slug } = params;
	const likes = await prisma.blogPostLike.count({ where: { slug } });
	return json({ likes });
};

export const POST: RequestHandler = async ({ params }) => {
	const { slug } = params;
	await prisma.blogPostLike.create({ data: { slug } });
	const likes = await prisma.blogPostLike.count({ where: { slug } });
	return json({ likes });
};
