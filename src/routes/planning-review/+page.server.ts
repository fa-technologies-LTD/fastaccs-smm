import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// This login-free route exists only for reviewing local working documents.
	// Production keeps the equivalent page behind the normal admin permissions.
	if (!dev) {
		throw error(404, 'Not found');
	}
	const projectRoot = process.cwd();
	const [planMarkdown, todoMarkdown] = await Promise.all([
		readFile(resolve(projectRoot, 'BOOSTING_AUTOMATION_PLAN.md'), 'utf8'),
		readFile(resolve(projectRoot, 'PROJECT_TODO.md'), 'utf8')
	]);

	return {
		planMarkdown,
		todoMarkdown
	};
};
