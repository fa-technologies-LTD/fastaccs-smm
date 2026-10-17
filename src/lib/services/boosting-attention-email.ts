import { createHash } from 'node:crypto';
import { prisma } from '$lib/prisma';
import { sendEmail } from './email';
import { getOperationalAlertRecipients } from './admin-settings';
import { boostHoldReasons } from '$lib/helpers/boosting-hold-reason';
import { BOOST_REVIEW_AFTER_MS } from '$lib/helpers/boosting-overdue-review';

/** Read recorded exceptions only. Never selects suppliers, retries orders or alters delivery. */
export async function emailBoostingAttention(database = prisma, now = new Date()) {
	const recipients = await getOperationalAlertRecipients();
	if (!recipients.length) return { sent: 0 };
	const cutoff = new Date(now.getTime() - BOOST_REVIEW_AFTER_MS);
	const cursorKey = 'system.boosting_attention_email_cursor';
	const cursorRow = await database.microcopy.findUnique({
		where: { key: cursorKey },
		select: { value: true }
	});
	const cursor = /^[0-9a-f-]{36}$/i.test(cursorRow?.value ?? '') ? cursorRow!.value : null;
	const items = await database.orderItem.findMany({
		where: {
			boostTargetUrl: { not: null },
			order: {
				orderType: 'boosting',
				paymentStatus: { in: ['paid', 'success', 'overpaid'] },
				status: { notIn: ['refunded', 'cancelled'] },
				deliveryStatus: { not: 'refunded' }
			},
			AND: [
				{
					OR: [
						{ boostFulfillmentStatus: null },
						{ boostFulfillmentStatus: { notIn: ['completed', 'cancelled'] } }
					]
				}
			],
			OR: [
				{ boostFulfillment: { status: 'manual_review' } },
				{ boostFulfillmentStatus: 'partial' },
				{
					order: { OR: [{ paidAt: { lte: cutoff } }, { paidAt: null, createdAt: { lte: cutoff } }] }
				}
			]
		},
		select: {
			id: true,
			orderId: true,
			boostFulfillmentStatus: true,
			boostFulfillment: { select: { lastSafeErrorCategory: true } },
			order: { select: { orderNumber: true, paidAt: true, createdAt: true } }
		},
		orderBy: { id: 'asc' },
		take: 100,
		...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
	});
	const advanceCursor = () =>
		database.microcopy.upsert({
			where: { key: cursorKey },
			create: {
				key: cursorKey,
				value: items.length === 100 ? items[items.length - 1].id : '',
				isActive: false,
				category: 'system'
			},
			update: { value: items.length === 100 ? items[items.length - 1].id : '', isActive: false }
		});
	const incidents = items.flatMap((item) => {
		const recorded = item.boostFulfillment?.lastSafeErrorCategory;
		const overdue = (item.order.paidAt ?? item.order.createdAt) <= cutoff;
		const reason =
			item.boostFulfillmentStatus === 'partial'
				? 'provider_partial'
				: recorded && !['shadow_selected', 'target_already_active'].includes(recorded)
					? recorded
					: overdue
						? 'overdue'
						: null;
		if (!reason) return [];
		return [
			{
				key: `boost-attention:${item.id}:${reason}`,
				orderId: item.orderId,
				text: `${item.order.orderNumber}: ${
					reason === 'overdue'
						? 'Still unfinished after 24 hours. Check delivery; this is not confirmed failure.'
						: boostHoldReasons(reason)[0]
				}`
			}
		];
	});
	if (!incidents.length) {
		await advanceCursor();
		return { sent: 0 };
	}
	const sentRows = await database.emailNotification.findMany({
		where: {
			notificationType: 'admin_broadcast',
			status: 'suppressed',
			suppressionReason: 'covered_by_action_digest',
			referenceId: { in: incidents.map((item) => item.key) },
			email: { in: recipients }
		},
		select: { referenceId: true, email: true }
	});
	let sent = 0;
	for (const email of recipients) {
		const pending = incidents.filter(
			(item) => !sentRows.some((row) => row.email === email && row.referenceId === item.key)
		);
		if (!pending.length) continue;
		// The normal automation job lock serializes this scanner. The stable batch reference
		// also prevents a repeated send if SMTP succeeded but coverage-marker persistence failed.
		const referenceId = `boost-attention-batch:${createHash('sha256')
			.update(
				pending
					.map((i) => i.key)
					.sort()
					.join('|')
			)
			.digest('hex')}`;
		const prior = await database.emailNotification.findFirst({
			where: { email, referenceId, status: 'sent' },
			select: { id: true }
		});
		const result = prior
			? { success: true }
			: await sendEmail({
					to: email,
					classification: 'operational',
					notificationType: 'admin_broadcast',
					referenceId,
					subject: `Action needed: ${new Set(pending.map((i) => i.orderId)).size} Boosting order${new Set(pending.map((i) => i.orderId)).size === 1 ? '' : 's'}`,
					body: [
						'Review these recorded delivery issues:',
						'',
						...pending.map((i) => `- ${i.text}`),
						'',
						'Check supplier references and any partial delivery before retrying, cancelling or refunding. No automatic retry has been made by this alert.'
					].join('\n'),
					ctaText: 'Review orders',
					ctaUrl: 'https://smm.fastaccs.com/admin/boosting-orders'
				});
		if (!result.success)
			throw new Error('Boosting attention email could not be sent; delivery state is unchanged.');
		await database.emailNotification.createMany({
			data: pending.map((item) => ({
				email,
				notificationType: 'admin_broadcast',
				classification: 'operational',
				referenceId: item.key,
				status: 'suppressed',
				suppressionReason: 'covered_by_action_digest'
			}))
		});
		if (!prior) sent++;
	}
	await advanceCursor();
	return { sent };
}
