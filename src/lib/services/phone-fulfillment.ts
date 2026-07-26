import { prisma } from '$lib/prisma';
import * as hubman from './hubman';
import { HubmanError } from './hubman';
import { getPhoneTierConfig, type PhoneTierConfig } from '$lib/helpers/phone-tier-config';
import { getPhonePricingConfig, computeMaxPriceCents } from './phone-pricing';
import { creditStoreCredit, SC_CREDIT_REFUND } from './store-credit';
import { sendCriticalAdminAlert } from './admin-alerts';

/**
 * Fulfillment for the automated Numbers service.
 *
 * Flow: on paid order → rent a hub-man activation number → poll for the OTP →
 * on no-SMS (or any rent failure) auto-refund the customer to store credit.
 *
 * Concurrency: webhook, reconcile cron, and client can all trigger fulfillment.
 * Every state transition is a CONDITIONAL update (claim) keyed to the rental's
 * current status, so a number is never double-rented and a customer is never
 * double-refunded. `orderItemId` is unique on PhoneRental (the idempotency key).
 */

export const PHONE_ORDER_TYPE = 'phone';

/** hub-man returns phone_number as a bare integer (e.g. 15625832620). Normalize to +E.164. */
function formatPhoneNumber(raw: number | string): string {
	const digits = String(raw).replace(/[^\d]/g, '');
	return digits ? `+${digits}` : String(raw);
}

// Terminal states — nothing further happens once a rental reaches one of these.
const TERMINAL_STATUSES = new Set(['received', 'refunded', 'cancelled', 'failed', 'expired']);

export interface PhoneOrderItemContext {
	orderItemId: string;
	orderId: string;
	userId: string | null;
	orderNumber: string;
	saleAmountNgn: number;
	tier: PhoneTierConfig;
}

async function loadPhoneOrderContext(orderId: string): Promise<PhoneOrderItemContext | null> {
	const item = await prisma.orderItem.findFirst({
		where: { orderId },
		include: { category: true, order: { select: { userId: true, orderNumber: true } } }
	});
	if (!item) return null;
	const tier = getPhoneTierConfig(item.category?.metadata);
	if (!tier) return null;
	return {
		orderItemId: item.id,
		orderId,
		userId: item.order.userId,
		orderNumber: item.order.orderNumber,
		saleAmountNgn: Number(item.totalPrice),
		tier
	};
}

/** True if this paid order should be fulfilled as a Numbers (phone) order. */
export async function isPhoneOrder(orderId: string): Promise<boolean> {
	return (await loadPhoneOrderContext(orderId)) !== null;
}

async function orderIdForItem(orderItemId: string): Promise<string | null> {
	const oi = await prisma.orderItem.findUnique({
		where: { id: orderItemId },
		select: { orderId: true }
	});
	return oi?.orderId ?? null;
}

/** Persist a received OTP and complete the order. Idempotent (claims awaiting_sms). */
async function markRentalReceived(orderItemId: string, sms: hubman.HubmanSms): Promise<boolean> {
	const claim = await prisma.phoneRental.updateMany({
		where: { orderItemId, status: 'awaiting_sms' },
		data: {
			status: 'received',
			otp: sms.otp,
			smsMessage: sms.message,
			senderName: sms.sender_name,
			receivedAt: new Date()
		}
	});
	if (claim.count > 0) {
		const orderId = await orderIdForItem(orderItemId);
		if (orderId) {
			await prisma.order
				.update({
					where: { id: orderId },
					data: { status: 'completed', deliveryStatus: 'delivered', deliveredAt: new Date() }
				})
				.catch(() => {});
		}
	}
	return claim.count > 0;
}

/**
 * Fast path used at payment confirmation: create the pending rental + mark the order
 * paid, WITHOUT renting yet. The rent is kicked off when the buyer lands on the order
 * page (or by the sweep cron), so payment verification never blocks on hub-man.
 */
export async function initPhoneOrder(orderId: string): Promise<{ ok: boolean }> {
	const ctx = await loadPhoneOrderContext(orderId);
	if (!ctx) return { ok: false };

	await prisma.phoneRental.upsert({
		where: { orderItemId: ctx.orderItemId },
		update: {},
		create: {
			orderItemId: ctx.orderItemId,
			serviceId: ctx.tier.serviceId,
			serviceName: ctx.tier.serviceName,
			countryId: ctx.tier.countryId,
			countryName: ctx.tier.countryName,
			saleAmountNgn: ctx.saleAmountNgn,
			status: 'pending'
		}
	});
	await prisma.order.update({
		where: { id: orderId },
		data: { status: 'paid', paymentStatus: 'paid', deliveryStatus: 'processing' }
	});
	return { ok: true };
}

export interface PhoneFulfillmentResult {
	status: 'awaiting_sms' | 'received' | 'refunded' | 'error';
	phoneNumber?: string;
	message: string;
}

/**
 * Rent a number for a paid phone order. Idempotent — safe to call repeatedly.
 * On any failure after payment, the customer is refunded to store credit.
 */
export async function fulfillPhoneOrder(
	orderId: string,
	source: string
): Promise<PhoneFulfillmentResult> {
	const ctx = await loadPhoneOrderContext(orderId);
	if (!ctx) return { status: 'error', message: 'Not a phone order' };

	const pricing = await getPhonePricingConfig();

	// Ensure a rental row exists (unique orderItemId prevents duplicates).
	await prisma.phoneRental.upsert({
		where: { orderItemId: ctx.orderItemId },
		update: {},
		create: {
			orderItemId: ctx.orderItemId,
			serviceId: ctx.tier.serviceId,
			serviceName: ctx.tier.serviceName,
			countryId: ctx.tier.countryId,
			countryName: ctx.tier.countryName,
			saleAmountNgn: ctx.saleAmountNgn,
			status: 'pending'
		}
	});

	// Claim the rent: only one caller can move pending → renting.
	const claim = await prisma.phoneRental.updateMany({
		where: { orderItemId: ctx.orderItemId, status: 'pending' },
		data: { status: 'renting' }
	});

	if (claim.count === 0) {
		// Someone else already advanced it — report current state.
		const existing = await prisma.phoneRental.findUnique({
			where: { orderItemId: ctx.orderItemId }
		});
		if (existing?.status === 'received')
			return { status: 'received', phoneNumber: existing.phoneNumber ?? undefined, message: 'Code received' };
		if (existing && TERMINAL_STATUSES.has(existing.status))
			return { status: 'refunded', message: 'Order already resolved' };
		return {
			status: 'awaiting_sms',
			phoneNumber: existing?.phoneNumber ?? undefined,
			message: 'Your number is ready — waiting for the code'
		};
	}

	// We own the rent. Cap the price so a spike can't eat the margin.
	const expectedCost = ctx.tier.expectedCostCents || undefined;
	const maxPriceCents = expectedCost
		? computeMaxPriceCents(expectedCost, pricing.ceilingTolerancePercent)
		: undefined;

	try {
		const result = await hubman.rentActivationNumber({
			countryId: ctx.tier.countryId,
			serviceId: ctx.tier.serviceId,
			maxPriceCents
		});

		const costCents = Number(result.price_cents);
		const expiresAt = result.expires_at ? new Date(result.expires_at) : null;

		await prisma.phoneRental.update({
			where: { orderItemId: ctx.orderItemId },
			data: {
				hubOrderUuid: result.order_uuid,
				phoneNumber: formatPhoneNumber(result.phone_number),
				costCents: Number.isFinite(costCents) ? Math.round(costCents) : null,
				maxPriceCents: maxPriceCents ?? null,
				expiresAt,
				status: 'awaiting_sms'
			}
		});

		await prisma.order.update({
			where: { id: orderId },
			data: { status: 'paid', paymentStatus: 'paid', deliveryStatus: 'processing' }
		});

		return {
			status: 'awaiting_sms',
			phoneNumber: formatPhoneNumber(result.phone_number),
			message: 'Your number is ready — waiting for the code'
		};
	} catch (error) {
		// Rent failed after payment (no stock, over-ceiling, or API error).
		const reason =
			error instanceof HubmanError
				? `hub-man rent failed: ${error.message}`
				: `rent error: ${(error as Error).message}`;
		console.error(`[phone.${source}] ${reason} (order ${ctx.orderNumber})`);

		await prisma.phoneRental.updateMany({
			where: { orderItemId: ctx.orderItemId, status: 'renting' },
			data: { status: 'failed', failureReason: reason }
		});

		await refundPhoneOrderToStoreCredit(orderId, 'We could not get your number — fully refunded', source);

		return {
			status: 'refunded',
			message: 'We could not get a number right now — your payment was refunded to store credit.'
		};
	}
}

/**
 * Refund a phone order to store credit. Idempotent — the conditional update
 * ensures the credit is issued at most once per rental.
 */
export async function refundPhoneOrderToStoreCredit(
	orderId: string,
	description: string,
	source: string
): Promise<boolean> {
	const ctx = await loadPhoneOrderContext(orderId);
	if (!ctx) return false;

	if (!ctx.userId) {
		// Guests have no wallet — flag for manual handling.
		await prisma.phoneRental.updateMany({
			where: { orderItemId: ctx.orderItemId, refundedAt: null },
			data: { status: 'refunded', refundedAt: new Date(), failureReason: 'guest — manual refund needed' }
		});
		await sendCriticalAdminAlert({
			title: 'Phone order needs manual refund (guest)',
			message: `Order ${ctx.orderNumber} could not be auto-refunded — no user wallet.`,
			source: `phone.${source}`,
			dedupeKey: `phone-guest-refund:${ctx.orderItemId}`
		}).catch(() => {});
		return false;
	}

	return prisma.$transaction(async (tx) => {
		// Claim the refund: only rentals not yet refunded and not received.
		const claim = await tx.phoneRental.updateMany({
			where: {
				orderItemId: ctx.orderItemId,
				refundedAt: null,
				status: { notIn: ['received', 'refunded'] }
			},
			data: { status: 'refunded', refundedAt: new Date() }
		});
		if (claim.count === 0) return false; // already refunded or already received

		await creditStoreCredit(tx, {
			userId: ctx.userId!,
			amount: ctx.saleAmountNgn,
			type: SC_CREDIT_REFUND,
			description,
			reference: ctx.orderId,
			metadata: { orderItemId: ctx.orderItemId, kind: 'phone_refund' }
		});

		await tx.order.update({
			where: { id: ctx.orderId },
			data: { status: 'refunded', deliveryStatus: 'refunded' }
		});
		return true;
	});
}

export interface PhonePollResult {
	status: 'preparing' | 'awaiting_sms' | 'received' | 'refunded' | 'expired' | 'unknown';
	phoneNumber?: string;
	otp?: string;
	message?: string;
	expiresAt?: string | null;
	canCancel?: boolean;
}

// hub-man forbids cancelling in the first 2 minutes of a rental.
const CANCEL_MIN_AGE_MS = 2 * 60_000;

/**
 * Drive an awaiting rental: kick off the rent if still pending, then poll hub-man for
 * the OTP and persist it. If the activation window has passed with no SMS, cancel + refund.
 */
export async function pollPhoneRentalSms(orderItemId: string): Promise<PhonePollResult> {
	const rental = await prisma.phoneRental.findUnique({ where: { orderItemId } });
	if (!rental) return { status: 'unknown' };

	if (rental.status === 'received')
		return {
			status: 'received',
			phoneNumber: rental.phoneNumber ?? undefined,
			otp: rental.otp ?? undefined,
			message: rental.smsMessage ?? undefined
		};
	if (TERMINAL_STATUSES.has(rental.status))
		return { status: rental.status === 'refunded' ? 'refunded' : 'expired' };

	// Recover a stuck rent (claimed but never completed — e.g. a crash mid-rent):
	// after 2 minutes with no hub-man uuid, reset to pending so it retries below.
	if (
		rental.status === 'renting' &&
		!rental.hubOrderUuid &&
		Date.now() - rental.createdAt.getTime() > 120_000
	) {
		await prisma.phoneRental.updateMany({
			where: { orderItemId, status: 'renting', hubOrderUuid: null },
			data: { status: 'pending' }
		});
		rental.status = 'pending';
	}

	// Not rented yet — kick off the rent now (idempotent claim inside fulfillPhoneOrder).
	if (rental.status === 'pending') {
		const orderId = await orderIdForItem(orderItemId);
		if (orderId) {
			const r = await fulfillPhoneOrder(orderId, 'poll');
			if (r.status === 'refunded') return { status: 'refunded', message: r.message };
			return { status: 'awaiting_sms', phoneNumber: r.phoneNumber, message: r.message };
		}
	}
	// Rent claimed but not yet stored (another caller is renting) — still preparing.
	if (rental.status !== 'awaiting_sms' || !rental.hubOrderUuid)
		return { status: 'preparing', message: 'Getting your number…' };

	const canCancel = Date.now() - rental.createdAt.getTime() > CANCEL_MIN_AGE_MS;

	let sms: hubman.HubmanSms | null = null;
	try {
		sms = await hubman.getSms(rental.hubOrderUuid);
	} catch (error) {
		console.error(`[phone.poll] getSms failed for ${orderItemId}:`, (error as Error).message);
		return {
			status: 'awaiting_sms',
			phoneNumber: rental.phoneNumber ?? undefined,
			expiresAt: rental.expiresAt?.toISOString() ?? null,
			canCancel
		};
	}

	if (sms && sms.otp) {
		await markRentalReceived(orderItemId, sms);
		return {
			status: 'received',
			phoneNumber: rental.phoneNumber ?? undefined,
			otp: sms.otp,
			message: sms.message
		};
	}

	// No SMS yet — has the window closed?
	const pricing = await getPhonePricingConfig();
	const deadline = rental.expiresAt
		? rental.expiresAt.getTime()
		: rental.createdAt.getTime() + pricing.activationTimeoutMinutes * 60_000;

	if (Date.now() > deadline) {
		const outcome = await cancelAndRefundRental(
			orderItemId,
			'No code arrived in time — refunded to store credit'
		);
		if (outcome === 'received')
			return { status: 'received', phoneNumber: rental.phoneNumber ?? undefined };
		if (outcome === 'refunded')
			return { status: 'refunded', message: 'No code arrived — refunded to store credit' };
		// Cancel not yet possible (e.g. 2-min window) — keep waiting.
		return {
			status: 'awaiting_sms',
			phoneNumber: rental.phoneNumber ?? undefined,
			expiresAt: rental.expiresAt?.toISOString() ?? null,
			canCancel
		};
	}

	return {
		status: 'awaiting_sms',
		phoneNumber: rental.phoneNumber ?? undefined,
		expiresAt: rental.expiresAt?.toISOString() ?? null,
		canCancel
	};
}

export type CancelOutcome = 'received' | 'refunded' | 'pending';

/**
 * Cancel + refund a rental — but NEVER refund a rental that has a billable code.
 *
 * Order of checks (this closes the "code delivered AND refunded" money leak):
 *  1. Final getSms — if a code is present, mark received (no refund).
 *  2. Cancel on hub-man — only refund if hub-man CONFIRMS the cancel (which it refuses
 *     once an SMS has been billed), proving we owe nothing.
 *  3. If the cancel is refused (or too early), re-check for a code; otherwise leave the
 *     rental for a later retry rather than refunding blindly.
 * Idempotent and safe to call repeatedly.
 */
export async function cancelAndRefundRental(
	orderItemId: string,
	description: string
): Promise<CancelOutcome> {
	const rental = await prisma.phoneRental.findUnique({ where: { orderItemId } });
	if (!rental) return 'refunded';
	if (rental.status === 'received') return 'received';
	if (TERMINAL_STATUSES.has(rental.status)) return 'refunded';

	// Never rented (still pending) — no hub-man cost, safe to refund.
	if (!rental.hubOrderUuid) {
		const orderId = await orderIdForItem(orderItemId);
		if (orderId) await refundPhoneOrderToStoreCredit(orderId, description, 'cancel');
		return 'refunded';
	}

	// 1. Final code check before doing anything irreversible.
	const smsBefore = await hubman.getSms(rental.hubOrderUuid).catch(() => null);
	if (smsBefore && smsBefore.otp) {
		await markRentalReceived(orderItemId, smsBefore);
		return 'received';
	}

	// 2. Cancel on hub-man; refund ONLY if it confirms (no billed SMS).
	let cancelled = false;
	try {
		cancelled = await hubman.cancelRent(rental.hubOrderUuid);
	} catch (error) {
		console.error(`[phone.cancel] hub-man cancel failed for ${orderItemId}:`, (error as Error).message);
		cancelled = false;
	}

	if (!cancelled) {
		// 3. Refused — a code may have just landed, or it's still inside the 2-min window.
		const smsAfter = await hubman.getSms(rental.hubOrderUuid).catch(() => null);
		if (smsAfter && smsAfter.otp) {
			await markRentalReceived(orderItemId, smsAfter);
			return 'received';
		}
		return 'pending'; // retry on the next poll / sweep
	}

	const orderId = await orderIdForItem(orderItemId);
	if (orderId) await refundPhoneOrderToStoreCredit(orderId, description, 'cancel');
	return 'refunded';
}

/**
 * User-initiated cancel from the order page. Allowed only after the 2-minute hub-man
 * window and before a code arrives; refunds to store credit if hub-man confirms.
 */
export async function userCancelPhoneRental(
	orderItemId: string
): Promise<{ ok: boolean; outcome: CancelOutcome; message: string }> {
	const rental = await prisma.phoneRental.findUnique({ where: { orderItemId } });
	if (!rental) return { ok: false, outcome: 'refunded', message: 'Not found' };

	if (rental.status === 'received')
		return { ok: false, outcome: 'received', message: 'Your code already arrived — this order is complete.' };
	if (TERMINAL_STATUSES.has(rental.status))
		return { ok: true, outcome: 'refunded', message: 'This order was already refunded.' };
	if (Date.now() - rental.createdAt.getTime() <= CANCEL_MIN_AGE_MS)
		return {
			ok: false,
			outcome: 'pending',
			message: 'You can cancel after 2 minutes if no code has arrived.'
		};

	const outcome = await cancelAndRefundRental(orderItemId, 'Cancelled by you — refunded to store credit');
	if (outcome === 'received')
		return { ok: false, outcome, message: 'Your code just arrived — this order is now complete.' };
	if (outcome === 'refunded')
		return { ok: true, outcome, message: 'Cancelled and refunded to your store credit.' };
	return { ok: false, outcome, message: 'Could not cancel yet — please try again shortly.' };
}

/** Alert (once per day) when our hub-man balance drops below the configured threshold. */
export async function checkHubmanBalanceAndAlert(): Promise<void> {
	const pricing = await getPhonePricingConfig();
	let balance: number;
	try {
		balance = await hubman.getBalanceCents();
	} catch {
		return; // transient — don't alert on a fetch failure
	}
	if (balance < pricing.lowBalanceThresholdCents) {
		await sendCriticalAdminAlert({
			title: 'hub-man balance is low',
			message: `Numbers balance is $${(balance / 100).toFixed(2)} (alert threshold $${(
				pricing.lowBalanceThresholdCents / 100
			).toFixed(2)}). Top up to keep numbers selling.`,
			source: 'phone.balance',
			dedupeKey: `hubman-low-balance:${new Date().toISOString().slice(0, 10)}`
		}).catch(() => {});
	}
}

/**
 * Cron safety net. Drives every in-flight rental via pollPhoneRentalSms, which:
 *  - rents any still-`pending` order (buyer closed the tab before the page rented it),
 *  - resolves received codes, and
 *  - auto-cancels + refunds rentals whose window has closed.
 * Returns the count that reached a terminal state this run.
 */
export async function sweepExpiredPhoneRentals(): Promise<number> {
	const candidates = await prisma.phoneRental.findMany({
		where: { status: { in: ['pending', 'renting', 'awaiting_sms'] } },
		select: { orderItemId: true }
	});
	let acted = 0;
	for (const { orderItemId } of candidates) {
		const result = await pollPhoneRentalSms(orderItemId).catch(() => null);
		if (result && (result.status === 'received' || result.status === 'refunded')) acted += 1;
	}
	return acted;
}
