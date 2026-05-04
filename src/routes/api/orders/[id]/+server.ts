import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { canViewRevenue, redactOrderFinancials } from '$lib/services/admin-revenue-visibility';
import type { Prisma } from '@prisma/client';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';

const ALLOWED_PATCH_FIELDS = new Set([
	'status',
	'paymentStatus',
	'deliveryStatus',
	'paymentReference',
	'paymentChannel',
	'paidAt',
	'deliveredAt',
	'deliveryMethod',
	'deliveryContact',
	'guestEmail',
	'guestPhone'
]);

const ALLOWED_ORDER_STATUSES = new Set([
	'pending',
	'pending_payment',
	'processing',
	'paid',
	'completed',
	'failed',
	'cancelled'
]);
const ALLOWED_PAYMENT_STATUSES = new Set([
	'pending',
	'processing',
	'paid',
	'failed',
	'cancelled'
]);
const ALLOWED_DELIVERY_STATUSES = new Set(['pending', 'processing', 'delivered', 'failed', 'cancelled']);
const ALLOWED_DELIVERY_METHODS = new Set(['email', 'whatsapp', 'telegram', 'dashboard']);

function normalizeOptionalString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseDate(value: unknown): Date | null {
	if (value === null || value === undefined || value === '') return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value !== 'string') return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildOrderPatchData(payload: unknown): { data?: Prisma.OrderUpdateInput; error?: string } {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return { error: 'Invalid payload' };
	}

	const raw = payload as Record<string, unknown>;
	const unknownKeys = Object.keys(raw).filter((key) => !ALLOWED_PATCH_FIELDS.has(key));
	if (unknownKeys.length > 0) {
		return { error: `Unsupported fields: ${unknownKeys.join(', ')}` };
	}

	const data: Prisma.OrderUpdateInput = {};

	if (Object.prototype.hasOwnProperty.call(raw, 'status')) {
		const normalized = normalizeOptionalString(raw.status)?.toLowerCase();
		if (!normalized || !ALLOWED_ORDER_STATUSES.has(normalized)) {
			return { error: 'Invalid status value' };
		}
		data.status = normalized;
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'paymentStatus')) {
		const normalized = normalizeOptionalString(raw.paymentStatus)?.toLowerCase();
		if (!normalized || !ALLOWED_PAYMENT_STATUSES.has(normalized)) {
			return { error: 'Invalid paymentStatus value' };
		}
		data.paymentStatus = normalized;
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'deliveryStatus')) {
		const normalized = normalizeOptionalString(raw.deliveryStatus)?.toLowerCase();
		if (!normalized || !ALLOWED_DELIVERY_STATUSES.has(normalized)) {
			return { error: 'Invalid deliveryStatus value' };
		}
		data.deliveryStatus = normalized;
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'deliveryMethod')) {
		const normalized = normalizeOptionalString(raw.deliveryMethod)?.toLowerCase();
		if (!normalized || !ALLOWED_DELIVERY_METHODS.has(normalized)) {
			return { error: 'Invalid deliveryMethod value' };
		}
		data.deliveryMethod = normalized;
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'paymentReference')) {
		data.paymentReference = normalizeOptionalString(raw.paymentReference);
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'paymentChannel')) {
		data.paymentChannel = normalizeOptionalString(raw.paymentChannel);
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'deliveryContact')) {
		const normalized = normalizeOptionalString(raw.deliveryContact);
		if (!normalized) return { error: 'deliveryContact cannot be empty' };
		data.deliveryContact = normalized;
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'guestEmail')) {
		data.guestEmail = normalizeOptionalString(raw.guestEmail);
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'guestPhone')) {
		data.guestPhone = normalizeOptionalString(raw.guestPhone);
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'paidAt')) {
		const parsed = parseDate(raw.paidAt);
		if (raw.paidAt && !parsed) return { error: 'Invalid paidAt value' };
		data.paidAt = parsed;
	}

	if (Object.prototype.hasOwnProperty.call(raw, 'deliveredAt')) {
		const parsed = parseDate(raw.deliveredAt);
		if (raw.deliveredAt && !parsed) return { error: 'Invalid deliveredAt value' };
		data.deliveredAt = parsed;
	}

	if (Object.keys(data).length === 0) {
		return { error: 'No valid fields provided for update' };
	}

	return { data };
}

// GET /api/orders/[id] - Get specific order
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user) {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const data = await prisma.order.findUnique({
			where: { id: params.id },
			include: {
				orderItems: {
					include: {
						accounts: true,
						category: {
							include: {
								parent: true
							}
						}
					}
				},
				user: true
			}
		});

		if (!data) {
			return json({ data: null, error: 'Order not found' }, { status: 404 });
		}

		const isAdmin = locals.user.userType === 'ADMIN';
		if (!isAdmin && data.userId !== locals.user.id) {
			return json({ data: null, error: 'Forbidden' }, { status: 403 });
		}

		let responseData: Record<string, unknown> =
			isAdmin && !canViewRevenue(locals)
				? (redactOrderFinancials(data) as Record<string, unknown>)
				: (data as unknown as Record<string, unknown>);

		if (isAdmin) {
			const notes = await prisma.adminAuditLog.findMany({
				where: {
					resourceType: 'order',
					resourceId: params.id,
					action: 'ORDER_NOTE_ADDED'
				},
				orderBy: {
					createdAt: 'asc'
				},
				select: {
					createdAt: true,
					metadata: true,
					actorUser: {
						select: {
							fullName: true,
							email: true
						}
					}
				}
			});

			const normalizedNotes = notes
				.map((noteRecord) => {
					const metadata =
						noteRecord.metadata && typeof noteRecord.metadata === 'object'
							? (noteRecord.metadata as Record<string, unknown>)
							: {};
					const noteText =
						typeof metadata.note === 'string' ? metadata.note.trim() : '';
					if (!noteText) return null;
					return {
						note: noteText,
						created_at: noteRecord.createdAt.toISOString(),
						author:
							noteRecord.actorUser?.fullName || noteRecord.actorUser?.email || 'Admin'
					};
				})
				.filter(Boolean);

			const existingMetadata =
				responseData.metadata &&
				typeof responseData.metadata === 'object' &&
				!Array.isArray(responseData.metadata)
					? (responseData.metadata as Record<string, unknown>)
					: {};

			responseData = {
				...responseData,
				metadata: {
					...existingMetadata,
					notes: normalizedNotes
				}
			};
		}

		return json({ data: responseData, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

// PATCH /api/orders/[id] - Update order
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const payload = await request.json().catch(() => null);
		const { data: updateData, error: validationError } = buildOrderPatchData(payload);
		if (!updateData || validationError) {
			return json({ data: null, error: validationError || 'Invalid payload' }, { status: 400 });
		}

		const data = await prisma.order.update({
			where: { id: params.id },
			data: {
				...updateData,
				updatedAt: new Date()
			},
			include: {
				orderItems: true,
				user: true
			}
		});

		invalidateAdminStatsCache();

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

// DELETE /api/orders/[id] - Delete order
export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		// First, release any allocated accounts back to available
			await prisma.account.updateMany({
				where: {
					orderItem: { orderId: params.id },
					status: { in: getAllocatedLikeAccountStatuses() } // Only reset allocated-like accounts, not delivered ones
				},
				data: {
					status: 'available',
				orderItemId: null
			}
		});

		// Then delete related order items
		await prisma.orderItem.deleteMany({
			where: { orderId: params.id }
		});

		// Finally delete the order
		const data = await prisma.order.delete({
			where: { id: params.id }
		});

		invalidateAdminStatsCache();

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
