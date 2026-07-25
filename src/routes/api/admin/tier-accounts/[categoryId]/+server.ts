import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

// Read-only export of a tier's AVAILABLE (remaining) accounts as copyable text.
// Never mutates or deletes anything. Admin-gated (same as the credential-viewing APIs).
//   ?format=links  -> one profile link per line
//   ?format=logs   -> a credential block per account (username/password/email/…)
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const categoryId = params.categoryId;
	if (!categoryId) return json({ error: 'Missing tier id' }, { status: 400 });

	const format = url.searchParams.get('format') === 'links' ? 'links' : 'logs';

	const accounts = await prisma.account.findMany({
		where: { categoryId, status: 'available' },
		select: {
			linkUrl: true,
			username: true,
			password: true,
			email: true,
			emailPassword: true,
			twoFa: true,
			credentialExtras: true,
			createdAt: true
		},
		orderBy: { createdAt: 'asc' }
	});

	if (format === 'links') {
		const lines = accounts.map((a) => (a.linkUrl || '').trim()).filter(Boolean);
		return json({ text: lines.join('\n'), count: lines.length, total: accounts.length });
	}

	const blocks = accounts
		.map((a) => {
			const lines: string[] = [];
			if (a.username) lines.push(`username: ${a.username}`);
			if (a.password) lines.push(`password: ${a.password}`);
			if (a.email) lines.push(`email: ${a.email}`);
			if (a.emailPassword) lines.push(`email-password: ${a.emailPassword}`);
			if (a.twoFa) lines.push(`2FA_Link: ${a.twoFa}`);
			// Append any extra credential fields so nothing is lost.
			const extras =
				a.credentialExtras && typeof a.credentialExtras === 'object' && !Array.isArray(a.credentialExtras)
					? (a.credentialExtras as Record<string, unknown>)
					: {};
			for (const [key, value] of Object.entries(extras)) {
				if (value !== null && value !== undefined && String(value).trim()) {
					lines.push(`${key}: ${value}`);
				}
			}
			return lines.join('\n');
		})
		.filter((block) => block.length > 0);

	return json({ text: blocks.join('\n\n'), count: blocks.length, total: accounts.length });
};
