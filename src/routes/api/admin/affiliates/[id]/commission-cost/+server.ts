import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { createAdminAuditLog } from '$lib/services/admin-audit';
import { resolveHeldSuperCommission } from '$lib/services/super-commission';

/** Resolve a Super order commission held because the order had no goods cost. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:affiliates:manage')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const body = await request.json().catch(() => ({}));
	const transactionId = String(body?.transactionId || '').trim();
	const goodsCostNgn = Number(body?.goodsCostNgn);
	if (!/^[0-9a-f-]{36}$/i.test(transactionId)) {
		return json({ success: false, error: 'A valid commission is required.' }, { status: 400 });
	}
	const result = await resolveHeldSuperCommission({
		transactionId,
		affiliateUserId: String(params.id || ''),
		goodsCostNgn,
		actorUserId: locals.user.id
	});
	if (!result.success) return json(result, { status: 409 });
	await createAdminAuditLog({
		actorUserId: locals.user.id,
		targetUserId: String(params.id || ''),
		action: 'super_commission_cost_resolved',
		resourceType: 'wallet_transaction',
		resourceId: transactionId,
		description: 'Super order commission released after entering the goods cost',
		metadata: { goodsCostNgn, commissionAmount: result.amount ?? 0 },
		required: true
	});
	return json({ success: true, amount: result.amount ?? 0 });
};
