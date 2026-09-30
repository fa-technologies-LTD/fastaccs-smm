import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { createBoostOrderClients } from '$lib/server/boosting-providers/fulfillment-worker';
import { createUserNotification } from '$lib/services/notifications';
import { recordOrderEvent } from '$lib/services/order-events';
import type { RequestHandler } from './$types';

const ACTIONS = ['validate', 'reject', 'escalate', 'resolve'] as const;

async function recordAction(
	complaint: {
		id: string;
		type: string;
		userId: string | null;
		fulfillment: { orderItem: { id: string; orderId: string } };
	},
	action: (typeof ACTIONS)[number],
	actorUserId: string
): Promise<void> {
	const messages = {
		validate: 'We confirmed your report and are taking the next appropriate action.',
		reject:
			'We reviewed your report and could not verify the issue. Contact support if you have new evidence.',
		escalate: 'Your report has been sent to the supplier for action.',
		resolve: 'Your Boosting report has been marked resolved.'
	};
	await recordOrderEvent({
		orderId: complaint.fulfillment.orderItem.orderId,
		orderItemId: complaint.fulfillment.orderItem.id,
		type: `boosting_complaint_${action}`,
		source: 'admin.boosting_complaints',
		actorUserId,
		description: complaint.type,
		idempotencyKey: `boosting:complaint:${complaint.id}:${action}`,
		metadata: { complaintId: complaint.id, complaintType: complaint.type }
	}).catch((error) => {
		console.error('[boosting.complaint] action event failed:', (error as Error).message);
	});
	if (complaint.userId) {
		await createUserNotification({
			userId: complaint.userId,
			type: 'boosting_issue',
			title: action === 'resolve' ? 'Boosting report resolved' : 'Boosting report updated',
			message: messages[action],
			orderId: complaint.fulfillment.orderItem.orderId
		});
	}
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const action = String(body.action || '') as (typeof ACTIONS)[number];
	const note = String(body.note || '')
		.trim()
		.slice(0, 500);
	if (!ACTIONS.includes(action)) {
		return json({ success: false, error: 'Choose a valid action.' }, { status: 400 });
	}
	const complaint = await prisma.boostComplaint.findUnique({
		where: { id: params.id },
		include: {
			fulfillment: { include: { orderItem: { select: { id: true, orderId: true } } } }
		}
	});
	if (!complaint) return json({ success: false, error: 'Issue not found.' }, { status: 404 });

	const now = new Date();
	if (action === 'reject') {
		if (complaint.status !== 'open') {
			return json(
				{ success: false, error: 'Only an open report can be rejected.' },
				{ status: 409 }
			);
		}
		if (note.length < 3) {
			return json({ success: false, error: 'Add a short validation note.' }, { status: 400 });
		}
		const updated = await prisma.boostComplaint.update({
			where: { id: complaint.id },
			data: {
				status: 'rejected',
				validationNote: note,
				validatedByUserId: locals.user.id,
				validatedAt: now,
				resolvedAt: now
			}
		});
		await recordAction(complaint, action, locals.user.id);
		return json({ success: true, data: updated });
	}
	if (action === 'validate') {
		if (complaint.status !== 'open') {
			return json(
				{ success: false, error: 'This report has already been reviewed.' },
				{ status: 409 }
			);
		}
		const updated = await prisma.boostComplaint.update({
			where: { id: complaint.id },
			data: {
				status: 'validated',
				validationNote: note || null,
				validatedByUserId: locals.user.id,
				validatedAt: now
			}
		});
		await recordAction(complaint, action, locals.user.id);
		return json({ success: true, data: updated });
	}
	if (action === 'resolve') {
		if (!['validated', 'escalated', 'escalation_unknown'].includes(complaint.status)) {
			return json(
				{ success: false, error: 'Validate the report before resolving it.' },
				{ status: 409 }
			);
		}
		const updated = await prisma.boostComplaint.update({
			where: { id: complaint.id },
			data: {
				status: 'resolved',
				validationNote: note || complaint.validationNote,
				resolvedAt: now
			}
		});
		await recordAction(complaint, action, locals.user.id);
		return json({ success: true, data: updated });
	}

	if (complaint.status !== 'validated') {
		return json(
			{ success: false, error: 'Validate the complaint before escalating it.' },
			{ status: 409 }
		);
	}
	const fulfillment = complaint.fulfillment;
	if (!fulfillment.supplierOrderId || !fulfillment.provider) {
		return json(
			{ success: false, error: 'No supplier order is attached to this item.' },
			{ status: 409 }
		);
	}
	let providerAction = 'provider_follow_up_required';
	let supplierCaseId: string | null = null;
	if (complaint.type === 'dropped' && fulfillment.provider === 'bulk_follows') {
		const provider = fulfillment.provider as 'smm_raja' | 'bulk_follows';
		if (!['smm_raja', 'bulk_follows'].includes(provider)) {
			return json({ success: false, error: 'This supplier is not supported.' }, { status: 409 });
		}
		const client = createBoostOrderClients()[provider];
		if (!client.requestRefill) {
			return json(
				{ success: false, error: 'This supplier does not expose automated refills.' },
				{ status: 409 }
			);
		}
		const claimed = await prisma.boostComplaint.updateMany({
			where: { id: complaint.id, status: 'validated' },
			data: { status: 'escalating', providerAction: 'refill_request_started' }
		});
		if (!claimed.count) {
			return json(
				{ success: false, error: 'This supplier action has already started.' },
				{ status: 409 }
			);
		}
		let refill;
		try {
			refill = await client.requestRefill(fulfillment.supplierOrderId);
		} catch {
			await prisma.boostComplaint.update({
				where: { id: complaint.id },
				data: {
					status: 'escalation_unknown',
					providerAction: 'refill_outcome_unknown',
					escalatedAt: now
				}
			});
			return json(
				{
					success: false,
					error:
						'The supplier response was uncertain. Check the supplier panel before taking another action.'
				},
				{ status: 502 }
			);
		}
		providerAction = 'refill_requested';
		supplierCaseId = refill.refillId;
	} else if (complaint.type === 'dropped' && fulfillment.provider === 'smm_raja') {
		// SMM Raja's refill contract must be confirmed in a controlled canary before this button
		// can make a remote request. Recording the escalation still keeps it in the exception queue.
		providerAction = 'manual_refill_required';
	}
	const updated = await prisma.boostComplaint.update({
		where: { id: complaint.id },
		data: {
			status: 'escalated',
			providerAction,
			supplierCaseId,
			escalatedAt: now
		}
	});
	await recordAction(complaint, action, locals.user.id);
	return json({
		success: true,
		data: updated,
		message:
			providerAction === 'refill_requested'
				? 'The supplier refill was requested.'
				: 'Marked for supplier follow-up. This provider has no support-ticket API.'
	});
};
