import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from './$types';

interface StoredComment {
	documentId: 'plan' | 'todo';
	blockExcerpt: string;
	lineStart: number;
	text: string;
	createdAt: string;
	resolved: boolean;
}

function isStoredComment(value: unknown): value is StoredComment {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const row = value as Record<string, unknown>;
	return (
		(row.documentId === 'plan' || row.documentId === 'todo') &&
		typeof row.blockExcerpt === 'string' &&
		typeof row.lineStart === 'number' &&
		typeof row.text === 'string' &&
		typeof row.createdAt === 'string' &&
		typeof row.resolved === 'boolean'
	);
}

function escapeQuote(value: string): string {
	return value.replaceAll('\r', '').replaceAll('\n', ' ');
}

function toMarkdown(comments: StoredComment[]): string {
	const output = ['# Fast Accounts planning review', ''];
	for (const document of [
		{ id: 'plan', label: 'Boosting plan' },
		{ id: 'todo', label: 'Project to-do' }
	] as const) {
		const rows = comments
			.filter((comment) => comment.documentId === document.id)
			.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
		if (!rows.length) continue;
		output.push(`## ${document.label}`, '');
		for (const comment of rows) {
			output.push(
				`### Line ${comment.lineStart} · ${comment.resolved ? 'Resolved' : 'Open'}`,
				'',
				`> ${escapeQuote(comment.blockExcerpt).slice(0, 240)}`,
				'',
				comment.text.slice(0, 10_000),
				''
			);
		}
	}
	return `${output.join('\n').trim()}\n`;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!dev) throw error(404, 'Not found');

	const payload = (await request.json().catch(() => null)) as { comments?: unknown } | null;
	if (!Array.isArray(payload?.comments)) throw error(400, 'Comments are required');

	const comments = payload.comments.filter(isStoredComment).slice(0, 1_000);
	const destination = path.join(process.cwd(), 'PLANNING_REVIEW_COMMENTS.md');
	await writeFile(destination, toMarkdown(comments), 'utf8');

	return json({ saved: comments.length });
};
