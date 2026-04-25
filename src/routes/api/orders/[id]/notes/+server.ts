import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

interface NotePayload {
	note?: unknown;
}

function normalizeNote(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim();
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const body = (await request.json().catch(() => ({}))) as NotePayload;
		const note = normalizeNote(body.note);
		if (!note) {
			return json({ data: null, error: 'Note is required' }, { status: 400 });
		}
		if (note.length > 2000) {
			return json({ data: null, error: 'Note is too long (max 2000 chars)' }, { status: 400 });
		}

		const order = await prisma.order.findUnique({
			where: { id: params.id },
			select: { id: true, userId: true }
		});
		if (!order) {
			return json({ data: null, error: 'Order not found' }, { status: 404 });
		}

		await prisma.adminAuditLog.create({
			data: {
				actorUserId: locals.user.id,
				targetUserId: order.userId || null,
				action: 'ORDER_NOTE_ADDED',
				resourceType: 'order',
				resourceId: order.id,
				description: `Order note added: ${note.slice(0, 200)}`,
				metadata: {
					note
				}
			}
		});

		return json({
			data: {
				note,
				created_at: new Date().toISOString(),
				author: locals.user.fullName || locals.user.email || 'Admin'
			},
			error: null
		});
	} catch (error) {
		console.error('Failed to add order note:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
