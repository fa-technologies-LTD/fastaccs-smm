import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateMissingExactPreviewThumbnails } from '$lib/services/exact-preview-thumbnails';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const payload = await request.json().catch(() => ({}));
		const result = await generateMissingExactPreviewThumbnails({
			tierId: typeof payload?.tierId === 'string' ? payload.tierId : undefined,
			limit: Number(payload?.limit || 6),
			force: Boolean(payload?.force)
		});
		return json({ success: true, data: result });
	} catch (error) {
		console.error('[admin.exact-preview-thumbnails] failed:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Thumbnail worker failed'
			},
			{ status: 500 }
		);
	}
};
