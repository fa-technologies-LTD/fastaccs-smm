import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	buildCategoryOffloadText,
	deleteOffloadedAvailableLogs
} from '$lib/services/category-offload';

function requireAdmin(locals: App.Locals): Response | null {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ data: null, error: 'Unauthorized' }, { status: 401 });
	}
	return null;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const unauthorized = requireAdmin(locals);
	if (unauthorized) return unauthorized;

	try {
		const categoryId = params.id;
		if (!categoryId) {
			return json({ data: null, error: 'Category ID is required' }, { status: 400 });
		}

		const offload = await buildCategoryOffloadText(categoryId);

		return new Response(offload.text, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Content-Disposition': `attachment; filename="${offload.filename}"`,
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		console.error('Failed to build category offload:', error);
		return json(
			{
				data: null,
				error: error instanceof Error ? error.message : 'Failed to build offload file'
			},
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const unauthorized = requireAdmin(locals);
	if (unauthorized) return unauthorized;

	try {
		const categoryId = params.id;
		if (!categoryId) {
			return json({ data: null, error: 'Category ID is required' }, { status: 400 });
		}

		const body = (await request.json().catch(() => ({}))) as { confirmDownloaded?: boolean };
		if (body.confirmDownloaded !== true) {
			return json(
				{
					data: null,
					error: 'Confirm the offload file was downloaded before deleting logs.'
				},
				{ status: 400 }
			);
		}

		const result = await deleteOffloadedAvailableLogs(categoryId);
		return json({ data: result, error: null });
	} catch (error) {
		console.error('Failed to delete offloaded logs:', error);
		return json(
			{
				data: null,
				error: error instanceof Error ? error.message : 'Failed to delete offloaded logs'
			},
			{ status: 500 }
		);
	}
};
