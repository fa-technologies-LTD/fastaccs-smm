import { beforeEach, expect, it, vi } from 'vitest';
import { applyBoostSupportAction } from './boosting-support';
const itemId = '11111111-1111-4111-8111-111111111111',
	orderId = '22222222-2222-4222-8222-222222222222',
	actorId = '33333333-3333-4333-8333-333333333333';
let item: any, events: any[], tx: any;
const input = () => ({
	itemId,
	actorId,
	operationId: crypto.randomUUID(),
	expectedRevision: null,
	action: 'request_link' as const,
	message: 'Please send your public profile link.'
});
beforeEach(() => {
	events = [];
	item = {
		id: itemId,
		orderId,
		boostTargetUrl: 'https://instagram.com/original',
		boostFulfillmentStatus: 'under_review',
		refundedAmount: 0,
		category: { metadata: {} },
		order: {
			userId: actorId,
			status: 'completed',
			paymentStatus: 'paid',
			deliveryStatus: 'delivered'
		},
		boostFulfillment: {
			id: 'f',
			quantity: 500,
			status: 'manual_review',
			supplierOrderId: 'supplier-ref',
			rawProviderStatus: 'Canceled',
			lastSafeErrorCategory: 'provider_cancelled',
			platform: 'instagram',
			outcome: 'followers',
			offerSnapshot: { platform: 'instagram', outcome: 'followers' },
			leaseToken: null,
			leaseExpiresAt: null
		}
	};
	tx = {
		$queryRaw: vi.fn().mockResolvedValue([]),
		orderItem: {
			findUnique: vi.fn(async () => item),
			update: vi.fn(async ({ data }: any) => {
				Object.assign(item, data);
				return item;
			}),
			findMany: vi.fn(async () => [item])
		},
		order: { update: vi.fn(async () => ({})) },
		boostFulfillment: {
			updateMany: vi.fn(async () => ({ count: 1 })),
			update: vi.fn(async ({ data }: any) => Object.assign(item.boostFulfillment, data))
		},
		boostComplaint: {
			findFirst: vi.fn().mockResolvedValue(null),
			updateMany: vi.fn().mockResolvedValue({ count: 0 })
		},
		boostAttempt: { findFirst: vi.fn().mockResolvedValue(null) },
		orderEvent: {
			findMany: vi.fn(async () => events),
			findUnique: vi.fn(
				async ({ where }: any) =>
					events.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null
			),
			create: vi.fn(async ({ data }: any) => {
				events.push(data);
				return data;
			})
		},
		notification: {
			create: vi.fn().mockResolvedValue({}),
			createMany: vi.fn().mockResolvedValue({ count: 1 })
		},
		adminRoleAssignment: { findMany: vi.fn().mockResolvedValue([{ userId: 'admin' }]) }
	};
});
it('requests a link and notifies the customer without replacing the supplier target or touching money', async () => {
	const out = await applyBoostSupportAction(tx, input());
	expect(out.support.state).toBe('awaiting_customer');
	expect(tx.orderItem.update).toHaveBeenCalledWith(
		expect.objectContaining({ data: { boostFulfillmentStatus: 'needs_link' } })
	);
	expect(item.boostTargetUrl).toBe('https://instagram.com/original');
	expect(tx.boostFulfillment.updateMany.mock.calls[0][0].data).not.toHaveProperty(
		'supplierOrderId'
	);
	expect(tx.notification.create).toHaveBeenCalledOnce();
	expect(tx.order.update.mock.calls[0][0].data).not.toHaveProperty('paymentStatus');
});
it('deduplicates an identical uncertain retry but rejects a changed payload with the same key', async () => {
	const request = input();
	await applyBoostSupportAction(tx, request);
	expect((await applyBoostSupportAction(tx, request)).repeated).toBe(true);
	expect(tx.notification.create).toHaveBeenCalledOnce();
	await expect(
		applyBoostSupportAction(tx, { ...request, message: 'Different customer message.' })
	).rejects.toThrow('different details');
});
it.each(['in_progress', 'submitted', 'submission_unknown', 'queued'])(
	'does not interrupt a %s supplier order',
	async (status) => {
		item.boostFulfillment.status = status;
		await expect(applyBoostSupportAction(tx, input())).rejects.toThrow('active or uncertain');
		expect(tx.orderItem.update).not.toHaveBeenCalled();
	}
);
it('allows a message without overriding active delivery', async () => {
	item.boostFulfillment.status = 'in_progress';
	await applyBoostSupportAction(tx, { ...input(), action: 'message' });
	expect(tx.orderItem.update).not.toHaveBeenCalled();
	expect(tx.boostFulfillment.updateMany).not.toHaveBeenCalled();
	expect(tx.orderEvent.create.mock.calls[0][0].data.type).toBe('customer_support_update');
});

it('records confirmed missing delivery without queueing a supplier order or altering supplier charges', async () => {
	Object.assign(item.boostFulfillment, {
		status: 'in_progress',
		rawProviderStatus: 'Processing',
		finalSupplierCostUsd: 0.3125
	});
	const request = {
		...input(),
		action: 'confirm_failure' as const,
		confirmed: true,
		quantity: 500,
		evidence: 'Customer confirmed non-delivery; checked the order evidence.'
	};
	await applyBoostSupportAction(tx, request);
	expect(item.boostFulfillment).toMatchObject({
		status: 'manual_review',
		supplierOrderId: 'supplier-ref',
		rawProviderStatus: 'Processing',
		finalSupplierCostUsd: 0.3125,
		nextActionAt: null
	});
	expect(tx.orderItem.update.mock.lastCall[0].data).toEqual({
		boostFulfillmentStatus: 'under_review'
	});
	expect(tx.orderEvent.create.mock.lastCall[0].data).toMatchObject({
		type: 'boosting_delivery_failure_confirmed',
		metadata: { missingQuantity: 500, evidence: request.evidence }
	});
	expect(tx.orderItem.findUnique.mock.lastCall[0].include.boostFulfillment).toBe(true);
	expect(tx.order.update.mock.lastCall[0].data).not.toHaveProperty('paymentStatus');
	expect((await applyBoostSupportAction(tx, request)).repeated).toBe(true);
	expect(tx.notification.create).toHaveBeenCalledOnce();
});

it('rejects missing-delivery recording while a worker owns the delivery lock', async () => {
	Object.assign(item.boostFulfillment, {
		leaseToken: 'active-worker',
		leaseExpiresAt: new Date(Date.now() + 60000)
	});
	await expect(
		applyBoostSupportAction(tx, {
			...input(),
			action: 'confirm_failure',
			confirmed: true,
			quantity: 500,
			evidence: 'Customer confirms missing delivery.'
		})
	).rejects.toThrow('delivery check is running');
	expect(tx.boostFulfillment.update).not.toHaveBeenCalled();
});

it.each([0, 501, 1.5])(
	'rejects invalid missing quantity %s before changing a delivery',
	async (quantity) => {
		await expect(
			applyBoostSupportAction(tx, {
				...input(),
				action: 'confirm_failure',
				confirmed: true,
				quantity,
				evidence: 'Customer confirms missing delivery.'
			})
		).rejects.toThrow('missing quantity');
		expect(tx.boostFulfillment.update).not.toHaveBeenCalled();
	}
);

it('requires withdrawal of a pending link request before manual delivery confirmation', async () => {
	const requested = await applyBoostSupportAction(tx, input());
	await expect(
		applyBoostSupportAction(tx, {
			...input(),
			action: 'confirm_delivery',
			expectedRevision: requested.support.revision,
			confirmed: true,
			evidence: 'Owner has checked the delivered result.'
		})
	).rejects.toThrow('Withdraw that request');
	const withdrawn = await applyBoostSupportAction(tx, {
		...input(),
		action: 'withdraw_link',
		expectedRevision: requested.support.revision,
		message: 'We are reviewing a different resolution for your order.'
	});
	expect(withdrawn.support.state).toBe('none');
	expect(item.boostFulfillmentStatus).toBe('under_review');
	expect(tx.orderEvent.create.mock.lastCall[0].data.type).toBe('boosting_support_withdrawn');
});
it('records a customer link as a proposal, never as a supplier-target edit or queued retry', async () => {
	const request = await applyBoostSupportAction(tx, input());
	const replyInput = {
		...input(),
		action: 'reply' as const,
		orderId,
		requestId: request.support.requestId!,
		expectedRevision: request.support.revision,
		link: 'https://instagram.com/correctprofile',
		message: ''
	};
	const originalInput = JSON.stringify(replyInput);
	const out = await applyBoostSupportAction(tx, replyInput);
	expect(JSON.stringify(replyInput)).toBe(originalInput);
	expect((await applyBoostSupportAction(tx, replyInput)).repeated).toBe(true);
	expect(out.support.state).toBe('reply_received');
	expect(tx.notification.createMany).toHaveBeenCalledOnce();
	expect(item.boostTargetUrl).toBe('https://instagram.com/original');
	expect(tx.orderItem.update.mock.lastCall[0].data).toEqual({
		boostFulfillmentStatus: 'under_review'
	});
	expect(tx.boostFulfillment.updateMany.mock.lastCall[0].data).not.toHaveProperty('targetUrl');
	expect(tx.boostFulfillment.updateMany.mock.lastCall[0].data).not.toHaveProperty('status');
});
it('blocks another customer, stale actions, refunded orders and invalid links', async () => {
	await expect(
		applyBoostSupportAction(tx, { ...input(), action: 'reply', actorId: 'stranger', orderId })
	).rejects.toThrow('not found');
	await expect(
		applyBoostSupportAction(tx, { ...input(), expectedRevision: 'stale' })
	).rejects.toThrow('changed');
	item.order.paymentStatus = 'refunded';
	await expect(applyBoostSupportAction(tx, input())).rejects.toThrow('eligible');
	item.order.paymentStatus = 'paid';
	const request = await applyBoostSupportAction(tx, input());
	await expect(
		applyBoostSupportAction(tx, {
			...input(),
			action: 'reply',
			orderId,
			requestId: request.support.requestId!,
			expectedRevision: request.support.revision,
			link: 'javascript:alert(1)'
		})
	).rejects.toThrow();
});
it('resolves item, fulfillment and parent together preserving supplier history', async () => {
	const out = await applyBoostSupportAction(tx, {
		...input(),
		action: 'confirm_delivery',
		confirmed: true,
		evidence: 'Customer confirmed receipt by support chat.',
		message: 'Support has confirmed delivery.'
	});
	expect(out.support.state).toBe('resolved');
	expect(tx.orderItem.update).toHaveBeenCalledWith(
		expect.objectContaining({
			data: expect.objectContaining({ boostFulfillmentStatus: 'completed' })
		})
	);
	expect(tx.boostFulfillment.updateMany).toHaveBeenCalledWith(
		expect.objectContaining({
			data: expect.objectContaining({
				status: 'completed',
				customerStatus: 'completed',
				nextActionAt: null,
				lastSafeErrorCategory: null
			})
		})
	);
	expect(tx.boostComplaint.updateMany).toHaveBeenCalledWith(
		expect.objectContaining({
			where: { fulfillmentId: 'f', status: { in: ['open', 'validated'] } },
			data: expect.objectContaining({ status: 'resolved' })
		})
	);
	expect(tx.order.update).toHaveBeenCalledWith(
		expect.objectContaining({
			data: expect.objectContaining({ status: 'completed', deliveryStatus: 'delivered' })
		})
	);
	expect(tx.boostFulfillment.updateMany.mock.lastCall[0].data).not.toHaveProperty(
		'rawProviderStatus'
	);
	expect(tx.boostFulfillment.updateMany.mock.lastCall[0].data).not.toHaveProperty(
		'finalSupplierCostUsd'
	);
	expect(tx.orderEvent.create.mock.lastCall[0].data.metadata).toMatchObject({
		evidence: 'Customer confirmed receipt by support chat.',
		previousSupplierStatus: 'Canceled'
	});
	expect(JSON.stringify(out)).not.toContain('Customer confirmed receipt by support chat.');
});
it('does not close a supplier case or partially refunded item, and does not complete unfinished siblings', async () => {
	const request = {
		...input(),
		action: 'confirm_delivery' as const,
		confirmed: true,
		evidence: 'Customer confirmed receipt in support chat.'
	};
	tx.boostComplaint.findFirst.mockResolvedValue({ id: 'case' });
	await expect(applyBoostSupportAction(tx, request)).rejects.toThrow('case is still open');
	tx.boostComplaint.findFirst.mockResolvedValue(null);
	item.refundedAmount = 100;
	await expect(applyBoostSupportAction(tx, request)).rejects.toThrow('refund recorded');
	item.refundedAmount = 0;
	tx.orderItem.findMany.mockResolvedValue([
		item,
		{ boostTargetUrl: 'https://example.com', boostFulfillmentStatus: 'in_progress' }
	]);
	await applyBoostSupportAction(tx, request);
	expect(tx.order.update.mock.lastCall[0].data).toMatchObject({
		status: 'paid',
		deliveryStatus: 'processing'
	});
});
it('closes an evidenced customer review on a supplier-completed delivery, but does not complete it twice without an open case', async () => {
	item.boostFulfillment.status = 'completed';
	item.boostFulfillment.rawProviderStatus = 'Completed';
	item.boostFulfillmentStatus = 'completed';
	const request = {
		...input(),
		action: 'confirm_delivery' as const,
		confirmed: true,
		evidence: 'Owner confirmed the customer issue was manually resolved.'
	};
	await expect(applyBoostSupportAction(tx, request)).rejects.toThrow('no open review');
	tx.boostComplaint.findFirst.mockImplementation(async ({ where }: any) =>
		where.status.in.includes('open') ? { id: 'customer-review' } : null
	);
	expect((await applyBoostSupportAction(tx, request)).support.state).toBe('resolved');
	expect(tx.boostComplaint.updateMany).toHaveBeenCalledWith(
		expect.objectContaining({
			data: expect.objectContaining({ status: 'resolved' })
		})
	);
	expect(tx.boostFulfillment.updateMany.mock.lastCall[0].data).not.toHaveProperty(
		'rawProviderStatus'
	);
});

it('marks a hand-sorted delivery completed with no note, recording that an admin did it', async () => {
	const out = await applyBoostSupportAction(tx, {
		...input(),
		action: 'confirm_delivery',
		message: 'Your delivery is confirmed. This review is closed.'
	});
	expect(out.support.state).toBe('resolved');
	expect(tx.orderEvent.create.mock.lastCall[0].data.metadata).toMatchObject({
		manuallyConfirmed: true,
		evidence: 'Marked completed by an admin'
	});
});
