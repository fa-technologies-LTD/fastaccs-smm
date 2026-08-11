import { prisma } from '$lib/prisma';
import * as hubman from './hubman';
import { HubmanError } from './hubman';
import { getPhoneTierConfig, type PhoneTierConfig } from '$lib/helpers/phone-tier-config';
import { getPhonePricingConfig, computeProcurementCeilingCents } from './phone-pricing';
import { creditStoreCredit, SC_CREDIT_REFUND } from './store-credit';
import { sendCriticalAdminAlert } from './admin-alerts';
import { createUserNotification } from './notifications';
import {
	providerForRental,
	refForRental,
	getProvider,
	buildLiveCandidatePool,
	candidateKeyFromRental,
	type ProviderSmsResult,
	type NumberProviderId
} from './number-providers';

// Sweep the price ladder: try up to this many suppliers, cheapest-first, before giving up. pvapins
// out-of-stock tries are FREE (pay-on-success), so we climb rather than refund. Bounded by
// MAX_RENT_ATTEMPTS AND a time budget kept comfortably UNDER the request's function timeout — so a
// long sweep + persist can never be killed mid-rent (which would orphan a paid-for number). If a
// batch runs out of budget without a hit, the customer's "try another" continues the climb.
const MAX_RENT_ATTEMPTS = 12;
const RENT_SWEEP_BUDGET_MS = 9_000;

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

/**
 * hub-man delivered a billable SMS if it returns EITHER a parsed OTP or any message text.
 * A delivered SMS means the activation succeeded on hub-man's side (non-refundable there), so
 * this must gate every refund — a rental with a message must be marked received, never refunded.
 */
export function hasDeliveredSms(sms: hubman.HubmanSms | null | undefined): boolean {
	return Boolean(sms && ((sms.otp && sms.otp.trim()) || (sms.message && sms.message.trim())));
}

/** The code to show the customer: hub-man's parsed OTP, or the first digit-run in the message. */
export function resolveOtp(sms: hubman.HubmanSms): string {
	if (sms.otp && sms.otp.trim()) return sms.otp.trim();
	const match = (sms.message || '').match(/\b(\d{4,8})\b/);
	return match ? match[1] : '';
}

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

/** Persist a received OTP and complete the order. Idempotent (claims awaiting_sms).
 * Takes a provider-normalized code (from any source), not hub-man's raw SMS shape. */
async function markRentalReceived(
	orderItemId: string,
	received: { otp: string; message: string; from?: string }
): Promise<boolean> {
	const claim = await prisma.phoneRental.updateMany({
		where: { orderItemId, status: 'awaiting_sms' },
		data: {
			status: 'received',
			otp: received.otp,
			smsMessage: received.message,
			senderName: received.from ?? null,
			receivedAt: new Date()
		}
	});
	if (claim.count > 0) {
		const orderId = await orderIdForItem(orderItemId);
		if (orderId) {
			const order = await prisma.order
				.update({
					where: { id: orderId },
					data: { status: 'completed', deliveryStatus: 'delivered', deliveredAt: new Date() },
					select: { userId: true }
				})
				.catch(() => null);
			// Bell: the customer's code just landed — the single most useful notification we send.
			if (order?.userId) {
				await createUserNotification({
					userId: order.userId,
					type: 'code_arrived',
					title: 'Your code arrived 🎉',
					message: 'Your verification code is ready — tap to view it.',
					orderId
				});
			}
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

	// Never resurrect an already-resolved rental — if it was refunded/cancelled/received,
	// leave the order as-is (the reconcile cron can otherwise re-run this and flip a
	// refunded order back to paid/processing).
	const existing = await prisma.phoneRental.findUnique({
		where: { orderItemId: ctx.orderItemId },
		select: { status: true }
	});
	if (existing && TERMINAL_STATUSES.has(existing.status)) {
		return { ok: false };
	}

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
	source: string,
	options: { excludeKeys?: string[] } = {}
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

	// We own the rent. HARD PROCUREMENT CEILING: the most we'll ever spend on a supplier for this
	// order while still keeping the minimum fulfilment profit (₦500). NO intentional loss, NO rescue
	// budget — we may compress margin to deliver, but we never rent a number that would leave less
	// than the floor. If the ceiling is 0 (sale doesn't even clear the floor), nothing is affordable
	// → refund rather than take a loss-making rent.
	const rate = Math.max(1, pricing.usdNgnRate);
	const procurementCeilingCents = computeProcurementCeilingCents(
		ctx.saleAmountNgn,
		pricing.minFulfillmentProfitNgn,
		rate
	);

	// Step 1: build the candidate pool (hub-man + every pvapins variant) and sweep the price LADDER
	// cheapest-first. FAILOVER: an out-of-stock / erroring supplier is skipped and we climb to the
	// next rung — invisible to the customer. We rent the cheapest that's actually in stock and
	// pocket the spread. Only if NOTHING rentable within the hard procurement ceiling exists → refund.
	const pool = await buildLiveCandidatePool({
		hubServiceId: ctx.tier.serviceId,
		hubCountryId: ctx.tier.countryId,
		hubCountryCode: ctx.tier.countryCode,
		hubCountryName: ctx.tier.countryName
	}).catch(() => []);
	const excludeKeys = new Set(options.excludeKeys ?? []);
	const ladder = pool
		.filter((c) => c.costCents > 0 && c.costCents <= procurementCeilingCents)
		.filter((c) => !excludeKeys.has(`${c.provider}:${c.providerServiceRef}`))
		.sort((a, b) => a.costCents - b.costCents) // cheapest first — rent cheap, climb only if dry
		.slice(0, MAX_RENT_ATTEMPTS);

	let rented: {
		provider: NumberProviderId;
		providerRef: string;
		phoneNumber: string;
		costCents: number;
		expiresAt: Date | null;
	} | null = null;
	let lastError = ladder.length === 0 ? 'no in-stock supplier within procurement ceiling' : '';
	const sweepStarted = Date.now();
	for (const candidate of ladder) {
		if (Date.now() - sweepStarted > RENT_SWEEP_BUDGET_MS) {
			lastError = `${lastError || 'still searching'} (time budget reached)`;
			break;
		}
		try {
			const r = await getProvider(candidate.provider).rent({
				serviceId: ctx.tier.serviceId,
				countryId: ctx.tier.countryId,
				serviceName: ctx.tier.serviceName,
				countryName: ctx.tier.countryName,
				providerServiceRef: candidate.providerServiceRef,
				providerCountryRef: candidate.providerCountryRef,
				maxPriceCents: procurementCeilingCents,
				expectedCostCents: candidate.costCents
			});
			rented = {
				provider: candidate.provider,
				providerRef: r.providerRef,
				phoneNumber: formatPhoneNumber(r.phoneNumber),
				costCents: Number(r.costCents),
				expiresAt: r.expiresAt
			};
			break;
		} catch (error) {
			lastError = `${candidate.label}: ${(error as Error).message}`;
			console.error(`[phone.${source}] rent via ${lastError}`);
		}
	}

	if (!rented) {
		await prisma.phoneRental.updateMany({
			where: { orderItemId: ctx.orderItemId, status: 'renting' },
			data: { status: 'failed', failureReason: `no candidate: ${lastError}`.slice(0, 200) }
		});
		await refundPhoneOrderToStoreCredit(orderId, 'We could not get your number — fully refunded', source);
		return {
			status: 'refunded',
			message:
				"We couldn't get you a number right now — you've been refunded to store credit. Please try again in a few minutes."
		};
	}

	// Step 2: the number is now held on the provider. Persist it (with retries). If we can NEVER
	// persist it, cancel it on the provider to release/reclaim and refund — so a held number is
	// always either recorded, or cancelled+refunded (never orphaned, never double-charged).
	let persisted = false;
	for (let attempt = 0; attempt < 3 && !persisted; attempt++) {
		try {
			await prisma.phoneRental.update({
				where: { orderItemId: ctx.orderItemId },
				data: {
					provider: rented.provider,
					providerRef: rented.providerRef,
					hubOrderUuid: rented.provider === 'hubman' ? rented.providerRef : null,
					phoneNumber: rented.phoneNumber,
					costCents: Number.isFinite(rented.costCents) ? Math.round(rented.costCents) : null,
					maxPriceCents: procurementCeilingCents,
					rentedAt: new Date(),
					expiresAt: rented.expiresAt,
					status: 'awaiting_sms'
				}
			});
			persisted = true;
		} catch (e) {
			console.error(`[phone.${source}] persist attempt ${attempt + 1} failed:`, (e as Error).message);
			await new Promise((r) => setTimeout(r, 400));
		}
	}

	if (!persisted) {
		await getProvider(rented.provider).cancel(rented.providerRef).catch(() => {});
		await prisma.phoneRental
			.updateMany({
				where: { orderItemId: ctx.orderItemId, status: 'renting' },
				data: { status: 'failed', failureReason: 'rent persist failed — cancelled + refunded' }
			})
			.catch(() => {});
		await refundPhoneOrderToStoreCredit(
			orderId,
			'We could not complete your number — fully refunded',
			source
		).catch(() => {});
		await sendCriticalAdminAlert({
			title: 'Phone rent could not be recorded',
			message: `Rented ${rented.provider} ${rented.providerRef} for order ${ctx.orderNumber} but failed to persist it; cancelled + refunded. Verify the rent is released on the provider.`,
			source: `phone.${source}`,
			dedupeKey: `phone-persist-fail:${ctx.orderItemId}`
		}).catch(() => {});
		return {
			status: 'refunded',
			message: 'We could not complete your number — your payment was refunded to store credit.'
		};
	}

	// Order status is non-money-critical; best-effort.
	await prisma.order
		.update({
			where: { id: orderId },
			data: { status: 'paid', paymentStatus: 'paid', deliveryStatus: 'processing' }
		})
		.catch(() => {});

	return {
		status: 'awaiting_sms',
		phoneNumber: rented.phoneNumber,
		message: 'Your number is ready — waiting for the code'
	};
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

	const refunded = await prisma.$transaction(async (tx) => {
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
			// paymentStatus MUST flip too, or the reconcile cron (which re-processes any
			// `paymentStatus:'paid'` order) resurrects this refunded order back to paid/processing.
			data: { status: 'refunded', paymentStatus: 'refunded', deliveryStatus: 'refunded' }
		});
		return true;
	});

	// Bell: tell the customer their money is back (best-effort, outside the money transaction).
	if (refunded && ctx.userId) {
		await createUserNotification({
			userId: ctx.userId,
			type: 'store_credit',
			title: 'Refunded to store credit',
			message: `₦${Math.round(Number(ctx.saleAmountNgn)).toLocaleString()} is back in your balance.`,
			orderId: ctx.orderId
		});
	}
	return refunded;
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

	// Stuck 'renting' with no hub-man id for >3 min = a hard crash between renting and
	// recording it. We can't tell whether a number was billed, so we must NOT re-rent
	// (that could double-spend). Refund the customer and alert an admin to reconcile any
	// orphaned rent on hub-man. (The normal rent path already cancels+refunds on a
	// recoverable persist failure, so reaching here is extremely rare.)
	if (
		rental.status === 'renting' &&
		!rental.hubOrderUuid &&
		Date.now() - rental.createdAt.getTime() > 180_000
	) {
		const orderId = await orderIdForItem(orderItemId);
		await prisma.phoneRental.updateMany({
			where: { orderItemId, status: 'renting', hubOrderUuid: null },
			data: { status: 'failed', failureReason: 'stuck renting — refunded; check hub-man for orphan' }
		});
		if (orderId)
			await refundPhoneOrderToStoreCredit(
				orderId,
				'We could not complete your number — refunded to store credit',
				'poll'
			).catch(() => {});
		await sendCriticalAdminAlert({
			title: 'Phone rent stuck — refunded; check for orphan',
			message: `Order item ${orderItemId} was stuck 'renting' with no hub-man id; refunded the customer. Check hub-man active rents for an orphaned number to cancel.`,
			source: 'phone.poll',
			dedupeKey: `phone-stuck-renting:${orderItemId}`
		}).catch(() => {});
		return { status: 'refunded', message: 'Refunded to store credit' };
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
	if (rental.status !== 'awaiting_sms' || !refForRental(rental))
		return { status: 'preparing', message: 'Getting your number…' };

	// Cancel is only allowed a couple of minutes after the number was RENTED (not when the
	// row was created at payment — those differ now that renting is deferred to the order page).
	const rentBaseline = rental.rentedAt ?? rental.createdAt;
	const canCancel = Date.now() - rentBaseline.getTime() > CANCEL_MIN_AGE_MS;

	// Poll whichever source served this rental (hub-man or pvapins) through the abstraction.
	// 'received' → a code; 'expired' → provider says the window closed (→ cancel+refund below);
	// 'error'/'waiting' → keep waiting until our own deadline.
	const ref = refForRental(rental)!;
	const poll: ProviderSmsResult = await providerForRental(rental)
		.pollSms(ref)
		.catch(() => ({ status: 'error', reason: 'poll failed' }) as ProviderSmsResult);

	if (poll.status === 'received') {
		await markRentalReceived(orderItemId, { otp: poll.otp, message: poll.message, from: poll.from });
		return {
			status: 'received',
			phoneNumber: rental.phoneNumber ?? undefined,
			otp: poll.otp,
			message: poll.message
		};
	}

	// No code yet — has the window closed (by our clock, or because the provider says expired)?
	const pricing = await getPhonePricingConfig();
	const deadline = rental.expiresAt
		? rental.expiresAt.getTime()
		: rental.createdAt.getTime() + pricing.activationTimeoutMinutes * 60_000;

	if (Date.now() > deadline || poll.status === 'expired') {
		const outcome = await cancelAndRefundRental(
			orderItemId,
			'No code arrived — refunded to store credit'
		);
		if (outcome === 'received')
			return { status: 'received', phoneNumber: rental.phoneNumber ?? undefined };
		if (outcome === 'refunded')
			return { status: 'refunded', message: 'No code arrived — refunded to store credit' };
		// 'pending' — a transient hiccup during cancel; the next sweep retries.
		return {
			status: 'awaiting_sms',
			phoneNumber: rental.phoneNumber ?? undefined,
			expiresAt: rental.expiresAt?.toISOString() ?? null,
			canCancel
		};
	}

	// Within the window; if getSms hit a transient error we simply keep waiting.
	return {
		status: 'awaiting_sms',
		phoneNumber: rental.phoneNumber ?? undefined,
		expiresAt: rental.expiresAt?.toISOString() ?? null,
		canCancel
	};
}

export type CancelOutcome = 'received' | 'refunded' | 'pending';

/**
 * Cancel + refund a rental. The SMS record — not the cancel call — is authoritative:
 *  - getSms returns a code  → fulfilled, mark received, NEVER refund (closes the
 *    "code delivered AND refunded" money leak).
 *  - getSms returns no code (still waiting, OR hub-man says the activation expired/inactive
 *    with a 422) → no billable SMS exists, so best-effort cancel to release our balance and
 *    refund the customer. This also rescues rentals hub-man already expired on its side,
 *    which the old "only refund if cancel succeeds" rule left stuck forever.
 *  - getSms fails transiently (network / 5xx) → leave it for the next sweep, don't refund blind.
 * Only call this when a refund is contextually due (past the activation window, or a user cancel).
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

	// Never rented (still pending) — no provider cost to reclaim, safe to refund.
	const ref = refForRental(rental);
	if (!ref) {
		const orderId = await orderIdForItem(orderItemId);
		if (orderId) await refundPhoneOrderToStoreCredit(orderId, description, 'cancel');
		return 'refunded';
	}

	const provider = providerForRental(rental);

	// Authoritative check: did the source deliver a billable code?
	const poll = await provider
		.pollSms(ref)
		.catch(() => ({ status: 'error', reason: 'poll failed' }) as ProviderSmsResult);
	// Transient failure → back off and let the next sweep retry rather than refunding blind.
	if (poll.status === 'error') return 'pending';
	if (poll.status === 'received') {
		await markRentalReceived(orderItemId, { otp: poll.otp, message: poll.message, from: poll.from });
		return 'received';
	}

	// No billable code (waiting/expired). Best-effort cancel to release our balance. Defense against
	// the narrow race where a code lands between our check and the cancel: if the cancel is REFUSED
	// (a used/delivered number can't be cancelled), re-check once and mark received rather than
	// refunding a delivered activation.
	const cancelled = await provider.cancel(ref).catch(() => false);
	if (!cancelled) {
		const late = await provider
			.pollSms(ref)
			.catch(() => ({ status: 'error', reason: 'recheck failed' }) as ProviderSmsResult);
		if (late.status === 'received') {
			await markRentalReceived(orderItemId, { otp: late.otp, message: late.message, from: late.from });
			return 'received';
		}
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
	if (Date.now() - (rental.rentedAt ?? rental.createdAt).getTime() <= CANCEL_MIN_AGE_MS)
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

// How many times a customer may "try another number" on one order before we refund instead.
const MAX_CUSTOMER_RETRIES = 3;
// A customer can request a retry only this long after the number was shown (gives the code a chance).
const RETRY_MIN_AGE_MS = 60_000;

/**
 * Customer-initiated "try another number": when a code hasn't arrived, swap the current supplier
 * for the next-best one WITHOUT re-charging the customer. Capped, release-before-retry, and it
 * re-checks for a code first so a just-arrived code is never dropped.
 */
export async function customerRetryPhoneRental(
	orderItemId: string
): Promise<{ ok: boolean; status: string; phoneNumber?: string; message: string }> {
	const rental = await prisma.phoneRental.findUnique({ where: { orderItemId } });
	if (!rental) return { ok: false, status: 'unknown', message: 'Order not found.' };
	if (rental.status === 'received')
		return { ok: false, status: 'received', message: 'Your code already arrived — this order is complete.' };
	if (TERMINAL_STATUSES.has(rental.status))
		return { ok: false, status: rental.status, message: 'This order is already resolved.' };
	if (rental.status !== 'awaiting_sms' || !refForRental(rental))
		return { ok: false, status: 'preparing', message: 'Still getting your number — one moment.' };
	if (Date.now() - (rental.rentedAt ?? rental.createdAt).getTime() < RETRY_MIN_AGE_MS)
		return { ok: false, status: 'awaiting_sms', message: 'Give it a few more seconds before trying another.' };

	const ref = refForRental(rental)!;
	const provider = providerForRental(rental);

	// Never drop a code that just arrived.
	const poll = await provider
		.pollSms(ref)
		.catch(() => ({ status: 'error', reason: 'poll failed' }) as ProviderSmsResult);
	if (poll.status === 'received') {
		await markRentalReceived(orderItemId, { otp: poll.otp, message: poll.message, from: poll.from });
		return {
			ok: false,
			status: 'received',
			phoneNumber: rental.phoneNumber ?? undefined,
			message: 'Your code just arrived!'
		};
	}

	// Out of retries → cancel + refund instead of trying forever.
	if ((rental.retryCount ?? 0) >= MAX_CUSTOMER_RETRIES) {
		const outcome = await cancelAndRefundRental(orderItemId, 'No code after several tries — refunded to store credit');
		if (outcome === 'received')
			return { ok: false, status: 'received', message: 'Your code just arrived — this order is complete.' };
		return {
			ok: true,
			status: 'refunded',
			message: "We couldn't get a code after several tries — you've been refunded to store credit."
		};
	}

	// Best-effort release of the current number, then climb to the next rung — excluding EVERY
	// supplier tried on this order so we never repeat one (a true progressive climb).
	await provider.cancel(ref).catch(() => {});
	const tried = Array.from(
		new Set([...(rental.triedSuppliers ?? []), candidateKeyFromRental(rental)])
	);
	const orderId = await orderIdForItem(orderItemId);
	if (!orderId) return { ok: false, status: 'error', message: 'Order not found.' };

	// Reset to pending + record the tried suppliers + count the retry, then re-fulfill up the ladder.
	await prisma.phoneRental.updateMany({
		where: { orderItemId, status: 'awaiting_sms' },
		data: {
			status: 'pending',
			hubOrderUuid: null,
			providerRef: null,
			phoneNumber: null,
			otp: null,
			smsMessage: null,
			triedSuppliers: tried,
			retryCount: { increment: 1 }
		}
	});

	const r = await fulfillPhoneOrder(orderId, 'retry', { excludeKeys: tried });
	if (r.status === 'awaiting_sms')
		return { ok: true, status: 'awaiting_sms', phoneNumber: r.phoneNumber, message: 'Here’s a fresh number — request your code again.' };
	if (r.status === 'refunded') return { ok: true, status: 'refunded', message: r.message };
	return { ok: false, status: r.status, message: r.message };
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
