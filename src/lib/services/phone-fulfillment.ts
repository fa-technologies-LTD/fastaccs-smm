import { prisma } from '$lib/prisma';
import { randomUUID } from 'node:crypto';
import * as hubman from './hubman';
import { getPhoneTierConfig, type PhoneTierConfig } from '$lib/helpers/phone-tier-config';
import { getPhonePricingConfig, computeProcurementCeilingCents } from './phone-pricing';
import { acquireRateToken, pvapinsRateSpec, PVAPINS_GET_NUMBER_BUCKET } from './rate-limiter';
import {
	recordPhoneAttempt,
	recordAttemptOtpReceived,
	recordAttemptOtpTimeout,
	recordAttemptRejection,
	classifyRentFailure
} from './phone-telemetry';
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
// A rent call is expected to finish inside a 30s serverless request. Five minutes leaves ample
// headroom for a slow provider/network while still making an abandoned claim recoverable.
const RENT_LEASE_MS = 5 * 60_000;
const OPERATION_LEASE_MS = 2 * 60_000;

/**
 * Fulfillment for the automated Numbers service.
 *
 * Flow: on paid order → rent from the best eligible provider → poll for the OTP →
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
	orderStatus: string;
	paymentStatus: string;
	deliveryStatus: string;
}

async function loadPhoneOrderContext(orderId: string): Promise<PhoneOrderItemContext | null> {
	const item = await prisma.orderItem.findFirst({
		where: { orderId },
		include: {
			category: true,
			order: {
				select: {
					userId: true,
					orderNumber: true,
					status: true,
					paymentStatus: true,
					deliveryStatus: true
				}
			}
		}
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
		tier,
		orderStatus: item.order.status,
		paymentStatus: item.order.paymentStatus,
		deliveryStatus: item.order.deliveryStatus
	};
}

const CONFIRMED_PHONE_PAYMENTS = new Set(['paid', 'success', 'overpaid']);
const TERMINAL_ORDER_STATES = new Set(['refunded', 'cancelled', 'canceled', 'completed']);

function canFulfillOrder(ctx: PhoneOrderItemContext): boolean {
	return (
		CONFIRMED_PHONE_PAYMENTS.has(ctx.paymentStatus.toLowerCase()) &&
		!TERMINAL_ORDER_STATES.has(ctx.orderStatus.toLowerCase()) &&
		ctx.deliveryStatus.toLowerCase() !== 'refunded'
	);
}

/** True if this paid order should be fulfilled as a Numbers (phone) order. */
export async function isPhoneOrder(orderId: string): Promise<boolean> {
	return (await loadPhoneOrderContext(orderId)) !== null;
}

/**
 * Commit a gateway-confirmed Numbers payment and its durable rental intent together.
 * Supplier work deliberately happens later, but there must never be a committed paid
 * phone order with no PhoneRental for the page/cron to continue.
 */
export async function confirmPhonePaymentAndInitializeRental(input: {
	orderId: string;
	paymentReference?: string | null;
	paymentChannel?: string | null;
	paidAt?: Date | null;
}): Promise<boolean> {
	const ctx = await loadPhoneOrderContext(input.orderId);
	if (!ctx) return false;

	return prisma.$transaction(async (tx) => {
		const advanced = await tx.order.updateMany({
			where: {
				id: input.orderId,
				status: { notIn: ['refunded', 'cancelled', 'canceled', 'completed'] },
				deliveryStatus: { not: 'refunded' }
			},
			data: {
				status: 'paid',
				paymentStatus: 'paid',
				deliveryStatus: 'processing',
				paymentReference: input.paymentReference || undefined,
				paymentChannel: input.paymentChannel || undefined,
				paidAt: input.paidAt || new Date(),
				paymentCheckoutUrl: null
			}
		});
		if (advanced.count === 0) return false;

		await tx.phoneRental.upsert({
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
		return true;
	});
}

async function orderIdForItem(orderItemId: string): Promise<string | null> {
	const oi = await prisma.orderItem.findUnique({
		where: { id: orderItemId },
		select: { orderId: true }
	});
	return oi?.orderId ?? null;
}

interface RentalIdentity {
	generation: number;
	provider: string;
	providerRef: string | null;
	hubOrderUuid: string | null;
}

function rentalIdentityWhere(orderItemId: string, rental: RentalIdentity) {
	return {
		orderItemId,
		generation: rental.generation,
		provider: rental.provider,
		providerRef: rental.providerRef,
		hubOrderUuid: rental.hubOrderUuid
	};
}

async function currentFulfillmentResult(orderItemId: string): Promise<PhoneFulfillmentResult> {
	const current = await prisma.phoneRental.findUnique({ where: { orderItemId } });
	if (current?.status === 'received') {
		return {
			status: 'received',
			phoneNumber: current.phoneNumber ?? undefined,
			message: 'Code received'
		};
	}
	if (current?.status === 'failed' && !current.refundedAt) {
		return { status: 'awaiting_sms', message: 'Finishing your refund…' };
	}
	if (current && TERMINAL_STATUSES.has(current.status)) {
		return { status: 'refunded', message: 'Order already resolved' };
	}
	return {
		status: 'awaiting_sms',
		phoneNumber: current?.phoneNumber ?? undefined,
		message:
			current?.status === 'pending' || current?.status === 'renting'
				? 'Securing your number…'
				: 'Your number is ready — waiting for the code'
	};
}

/** Persist a received OTP and complete the order. Idempotent (claims awaiting_sms).
 * Takes a provider-normalized code (from any source), not hub-man's raw SMS shape. */
async function markRentalReceived(
	orderItemId: string,
	received: { otp: string; message: string; from?: string },
	expected: RentalIdentity & { status: string; operationToken?: string | null }
): Promise<boolean> {
	const claim = await prisma.phoneRental.updateMany({
		where: {
			...rentalIdentityWhere(orderItemId, expected),
			status: expected.status,
			...(expected.operationToken !== undefined ? { operationToken: expected.operationToken } : {})
		},
		data: {
			status: 'received',
			otp: received.otp,
			smsMessage: received.message,
			senderName: received.from ?? null,
			receivedAt: new Date(),
			operationToken: null,
			operationLeaseExpiresAt: null
		}
	});
	if (claim.count > 0) {
		// Telemetry (best-effort, floated async so it can never slow or break the money path): stamp
		// OTP delivery + latency on this number's attempt.
		void (async () => {
			try {
				const r = await prisma.phoneRental.findUnique({
					where: { orderItemId },
					select: {
						provider: true,
						providerRef: true,
						hubOrderUuid: true,
						costCents: true,
						otpRequestedAt: true,
						rentedAt: true,
						createdAt: true
					}
				});
				if (!r) return;
				const ref = r.provider === 'hubman' ? r.hubOrderUuid : r.providerRef;
				const from = (r.otpRequestedAt ?? r.rentedAt ?? r.createdAt)?.getTime();
				const latencySec = from ? (Date.now() - from) / 1000 : null;
				await recordAttemptOtpReceived(
					orderItemId,
					ref,
					latencySec,
					r.provider === 'pvapins' ? r.costCents : undefined
				);
			} catch {
				/* observational only */
			}
		})();
		const orderId = await orderIdForItem(orderItemId);
		if (orderId) {
			const completed = await prisma.order
				.updateMany({
					where: {
						id: orderId,
						status: { notIn: ['refunded', 'cancelled', 'canceled'] },
						paymentStatus: { notIn: ['refunded', 'cancelled', 'canceled'] },
						deliveryStatus: { not: 'refunded' }
					},
					data: { status: 'completed', deliveryStatus: 'delivered', deliveredAt: new Date() }
				})
				.catch(() => ({ count: 0 }));
			const order = completed.count
				? await prisma.order
						.findUnique({ where: { id: orderId }, select: { userId: true } })
						.catch(() => null)
				: null;
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
	if (!canFulfillOrder(ctx)) return { ok: false };

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
	const advanced = await prisma.order.updateMany({
		where: {
			id: orderId,
			status: { notIn: ['refunded', 'cancelled', 'canceled', 'completed'] },
			paymentStatus: { in: [...CONFIRMED_PHONE_PAYMENTS] },
			deliveryStatus: { not: 'refunded' }
		},
		data: { status: 'paid', paymentStatus: 'paid', deliveryStatus: 'processing' }
	});
	return { ok: advanced.count > 0 };
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
	if (!canFulfillOrder(ctx)) {
		return { status: 'refunded', message: 'This order is already resolved.' };
	}

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

	// Claim THIS order item's next generation. The token/lease is scoped to one rental row, so two
	// different buyers can rent in parallel; only duplicate drivers for this same item are excluded.
	const rentLeaseToken = randomUUID();
	const rentingAt = new Date();
	const claim = await prisma.phoneRental.updateMany({
		where: { orderItemId: ctx.orderItemId, status: 'pending' },
		data: {
			status: 'renting',
			generation: { increment: 1 },
			rentLeaseToken,
			rentingAt,
			rentLeaseExpiresAt: new Date(rentingAt.getTime() + RENT_LEASE_MS),
			rentCandidateProvider: null,
			rentCandidateServiceRef: null,
			rentCallStartedAt: null,
			failureReason: null
		}
	});

	if (claim.count === 0) {
		return currentFulfillmentResult(ctx.orderItemId);
	}

	const owned = await prisma.phoneRental.findUnique({
		where: { orderItemId: ctx.orderItemId },
		select: { generation: true, rentLeaseToken: true }
	});
	if (!owned) {
		return currentFulfillmentResult(ctx.orderItemId);
	}
	const generation = owned.generation;
	const rentOwnerWhere = {
		orderItemId: ctx.orderItemId,
		status: 'renting',
		generation,
		rentLeaseToken
	};

	// We own the rent. HARD PROCUREMENT CEILING: the most we'll ever spend on a supplier for this
	// order while still keeping the minimum fulfilment profit (₦500). NO intentional loss, NO rescue
	// budget — we may compress margin to deliver, but we never rent a number that would leave less
	// than the floor. If the ceiling is 0 (sale doesn't even clear the floor), nothing is affordable
	// → refund rather than take a loss-making rent.
	const rate = Math.max(1, pricing.usdNgnRate);
	// The global hard floor is a firewall a per-tier override can only RAISE, never weaken — so a tier
	// can be more conservative, but nothing drops below the global ₦500 (sub-floor is a deliberate
	// future decision, not an accident). max(global, override) enforces that.
	const minFulfillmentProfitNgn = Math.max(
		pricing.minFulfillmentProfitNgn,
		ctx.tier.minFulfillmentProfitNgn ?? pricing.minFulfillmentProfitNgn
	);
	const procurementCeilingCents = computeProcurementCeilingCents(
		ctx.saleAmountNgn,
		minFulfillmentProfitNgn,
		rate
	);
	// Order-wide accounting: subtract any UNRESOLVED liability from earlier attempts on this order
	// (e.g. a prior pvapins number we couldn't confirm-reject that could still bill). The next rent
	// must fit what's LEFT, so even if every reserved liability materializes, total spend still keeps
	// the profit floor. reserved accumulates across retries (see customerRetryPhoneRental).
	let reservedLiabilityCents = 0;
	let orderCreatedAt: Date | null = null;
	// Variants genuinely tried on earlier passes (persisted). Reading them here is what lets each
	// pass CONTINUE down the ladder instead of restarting at the top — the poll/sweep callers don't
	// pass excludeKeys themselves, so without this they'd re-try the same first batch forever.
	let persistedTried: string[] = [];
	try {
		const liabilityRow = await prisma.phoneRental.findUnique({
			where: { orderItemId: ctx.orderItemId },
			select: { reservedLiabilityCents: true, createdAt: true, triedSuppliers: true }
		});
		reservedLiabilityCents = liabilityRow?.reservedLiabilityCents ?? 0;
		if (liabilityRow?.createdAt) orderCreatedAt = liabilityRow.createdAt;
		persistedTried = liabilityRow?.triedSuppliers ?? [];
	} catch {
		reservedLiabilityCents = 0;
	}
	const effectiveCeilingCents = Math.max(0, procurementCeilingCents - reservedLiabilityCents);

	// Step 1: build the candidate pool (hub-man + every pvapins variant) and sweep it in the ranker's
	// order — RELIABILITY BAND first, cheapest within a band (see rankCandidates). We do NOT re-sort
	// by cost here: a $0.40 variant that's usually dry is worse than a $0.48 one that reliably works,
	// so we prefer the candidate most likely to deliver on the first try and only pay a little more
	// when reliability warrants. FAILOVER: an OOS/erroring supplier is skipped and we climb to the
	// next rung — invisible to the customer. Only if NOTHING rentable within the hard procurement
	// ceiling exists → refund. (The ₦500 floor still bounds every candidate's cost.)
	const pool = await buildLiveCandidatePool({
		hubServiceId: ctx.tier.serviceId,
		hubCountryId: ctx.tier.countryId,
		hubCountryCode: ctx.tier.countryCode,
		hubCountryName: ctx.tier.countryName
	}).catch(() => []);
	const excludeKeys = new Set([...(options.excludeKeys ?? []), ...persistedTried]);
	const candidateKey = (c: { provider: string; providerServiceRef: string }) =>
		`${c.provider}:${c.providerServiceRef}`;
	// Affordable across BOTH suppliers, within the hard procurement ceiling (the ₦500 floor). Kept
	// whole (not sliced) so we can tell whether UNTRIED affordable options still remain after a pass.
	const affordable = pool.filter((c) => c.costCents > 0 && c.costCents <= effectiveCeilingCents);
	// This pass attempts only the not-yet-tried affordable candidates, in the ranker's order, bounded
	// by MAX_RENT_ATTEMPTS so we never hammer suppliers — the cap limits a BATCH, not "availability".
	const ladder = affordable.filter((c) => !excludeKeys.has(candidateKey(c)));

	let rented: {
		provider: NumberProviderId;
		providerRef: string;
		phoneNumber: string;
		costCents: number;
		expiresAt: Date | null;
	} | null = null;
	let lastError = ladder.length === 0 ? 'no in-stock supplier within procurement ceiling' : '';
	// Did we skip any pvapins candidate purely because the GLOBAL rate limiter had no token? That's
	// "supplier capacity momentarily exhausted", NOT out of stock — it must never trigger a refund.
	let rateLimited = false;
	let ownershipLost = false;
	let attemptNumber = 0;
	let rentAttempts = 0;
	// Candidates we genuinely called rent() on this pass (OOS or errored). Rate-limit SKIPS are NOT
	// added — those weren't tried, so they stay eligible for the next pass. Persisted on a keep-
	// securing so the next pass skips past them and reaches the next batch (13–24 …).
	const attemptedKeys = new Set<string>();
	const rlSpec = pvapinsRateSpec(pricing.pvapinsRateLimitPerMin);
	const sweepStarted = Date.now();
	// Telemetry is OBSERVATIONAL + best-effort: floated (void) so it can never slow the rent budget
	// or break fulfillment. recordPhoneAttempt swallows its own errors.
	for (const candidate of ladder) {
		if (Date.now() - sweepStarted > RENT_SWEEP_BUDGET_MS) {
			lastError = `${lastError || 'still searching'} (time budget reached)`;
			break;
		}
		attemptNumber += 1;
		if (rentAttempts >= MAX_RENT_ATTEMPTS) break;
		// pvapins get_number is globally rate-limited (~5/min). Take a shared token before calling it;
		// if none is free, skip this candidate WITHOUT touching its stock/reliability signal.
		if (
			candidate.provider === 'pvapins' &&
			!(await acquireRateToken(PVAPINS_GET_NUMBER_BUCKET, rlSpec))
		) {
			rateLimited = true;
			void recordPhoneAttempt({
				orderItemId: ctx.orderItemId,
				generation,
				attemptNumber,
				provider: candidate.provider,
				providerServiceRef: candidate.providerServiceRef,
				expectedCostCents: candidate.costCents,
				outcome: 'rate_limited'
			});
			continue;
		}
		// Temporary rate-limit skips above do not consume the rent-attempt cap. This ensures a ranked
		// block of throttled pvapins variants can never prevent an available hub-man candidate (or any
		// future provider) later in the same ladder from being tried.
		rentAttempts += 1;
		try {
			// Renew immediately before the side effect and record which call may be in flight. If a
			// recovery/refund already took ownership, do not call the supplier at all.
			const callStartedAt = new Date();
			const renewed = await prisma.phoneRental.updateMany({
				where: rentOwnerWhere,
				data: {
					rentLeaseExpiresAt: new Date(callStartedAt.getTime() + RENT_LEASE_MS),
					rentCandidateProvider: candidate.provider,
					rentCandidateServiceRef: candidate.providerServiceRef,
					rentCallStartedAt: callStartedAt
				}
			});
			if (renewed.count === 0) {
				ownershipLost = true;
				break;
			}
			attemptedKeys.add(candidateKey(candidate)); // genuinely tried (not a rate-limit skip)
			const candidateProvider = getProvider(candidate.provider);
			const r = await candidateProvider.rent({
				serviceId: ctx.tier.serviceId,
				countryId: ctx.tier.countryId,
				serviceName: ctx.tier.serviceName,
				countryName: ctx.tier.countryName,
				providerServiceRef: candidate.providerServiceRef,
				providerCountryRef: candidate.providerCountryRef,
				maxPriceCents: effectiveCeilingCents,
				expectedCostCents: candidate.costCents
			});
			rented = {
				provider: candidate.provider,
				providerRef: r.providerRef,
				phoneNumber: formatPhoneNumber(r.phoneNumber),
				costCents: Number(r.costCents),
				expiresAt: r.expiresAt
			};
			void recordPhoneAttempt({
				orderItemId: ctx.orderItemId,
				generation,
				attemptNumber,
				provider: candidate.provider,
				providerServiceRef: candidate.providerServiceRef,
				providerRef: r.providerRef,
				expectedCostCents: candidate.costCents,
				actualCostCents:
					candidateProvider.billing === 'pay-on-rent' && Number.isFinite(rented.costCents)
						? Math.round(rented.costCents)
						: null,
				phoneNumber: rented.phoneNumber,
				outcome: 'rented'
			});
			break;
		} catch (error) {
			lastError = `${candidate.label}: ${(error as Error).message}`;
			console.error(`[phone.${source}] rent via ${lastError}`);
			const cls = classifyRentFailure((error as Error).message);
			void recordPhoneAttempt({
				orderItemId: ctx.orderItemId,
				generation,
				attemptNumber,
				provider: candidate.provider,
				providerServiceRef: candidate.providerServiceRef,
				expectedCostCents: candidate.costCents,
				outcome: cls.outcome,
				failureCategory: cls.category
			});
			// The call finished without returning a number, so there is no unknown upstream hold. Keep
			// the same generation lease, but clear the in-flight marker before trying the next candidate.
			const cleared = await prisma.phoneRental.updateMany({
				where: rentOwnerWhere,
				data: {
					rentCandidateProvider: null,
					rentCandidateServiceRef: null,
					rentCallStartedAt: null
				}
			});
			if (cleared.count === 0) {
				ownershipLost = true;
				break;
			}
		}
	}

	if (ownershipLost) return currentFulfillmentResult(ctx.orderItemId);

	if (!rented) {
		const windowMs = pricing.activationTimeoutMinutes * 60_000;
		const withinWindow = !orderCreatedAt || Date.now() - orderCreatedAt.getTime() < windowMs;
		// Do affordable candidates we've NOT genuinely tried yet still remain (this pass + all prior)?
		// If so we haven't run out of options — we just hit the per-pass attempt/time cap. Refunding
		// now would rule the tier out prematurely (the batch cap must never mean "unavailable").
		const triedSoFar = new Set([...excludeKeys, ...attemptedKeys]);
		const untriedAffordableRemain = affordable.some((c) => !triedSoFar.has(candidateKey(c)));
		// Keep the order in a recoverable "securing" state — never refund — while EITHER a temporary
		// condition (rate limit) OR an untried affordable candidate could still produce a number. The
		// client poll + 5-min sweep drive the next pass; persisting the newly-tried keys makes that
		// pass CONTINUE down the ladder (13–24 …) instead of restarting the same batch. Bounded by the
		// activation window so it can never loop forever: past the window we fall through to refund.
		if ((rateLimited || untriedAffordableRemain) && withinWindow) {
			const revertData =
				attemptedKeys.size > 0
					? {
							status: 'pending' as const,
							triedSuppliers: Array.from(new Set([...persistedTried, ...attemptedKeys]))
						}
					: { status: 'pending' as const };
			const reverted = await prisma.phoneRental.updateMany({
				where: rentOwnerWhere,
				data: {
					...revertData,
					rentLeaseToken: null,
					rentLeaseExpiresAt: null,
					rentCandidateProvider: null,
					rentCandidateServiceRef: null,
					rentCallStartedAt: null
				}
			});
			if (reverted.count === 0) return currentFulfillmentResult(ctx.orderItemId);
			return { status: 'awaiting_sms', message: 'Securing your number…' };
		}
		// Genuinely out of viable options — every affordable candidate has been tried and no temporary
		// condition remains — or the activation window has closed → refund.
		// Make the terminal rental transition and wallet credit ONE transaction. If the database is
		// briefly unavailable, the row stays `renting` and the lease recovery retries later instead of
		// leaving a `failed` order whose customer was never actually credited.
		const refunded = await refundPhoneOrderToStoreCredit(
			orderId,
			'We could not get your number — fully refunded',
			source,
			{
				generation,
				status: 'renting',
				rentLeaseToken,
				failureReason: `no candidate: ${lastError}`.slice(0, 200)
			}
		);
		if (!refunded) return currentFulfillmentResult(ctx.orderItemId);
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
	let persistOwnershipLost = false;
	for (let attempt = 0; attempt < 3 && !persisted; attempt++) {
		try {
			const write = await prisma.phoneRental.updateMany({
				where: rentOwnerWhere,
				data: {
					provider: rented.provider,
					providerRef: rented.providerRef,
					hubOrderUuid: rented.provider === 'hubman' ? rented.providerRef : null,
					phoneNumber: rented.phoneNumber,
					costCents: Number.isFinite(rented.costCents) ? Math.round(rented.costCents) : null,
					maxPriceCents: effectiveCeilingCents,
					rentedAt: new Date(),
					expiresAt: rented.expiresAt,
					status: 'awaiting_sms',
					rentLeaseToken: null,
					rentLeaseExpiresAt: null,
					rentCandidateProvider: null,
					rentCandidateServiceRef: null,
					rentCallStartedAt: null
				}
			});
			persisted = write.count > 0;
			if (!persisted) persistOwnershipLost = true;
		} catch (e) {
			console.error(
				`[phone.${source}] persist attempt ${attempt + 1} failed:`,
				(e as Error).message
			);
			await new Promise((r) => setTimeout(r, 400));
		}
	}

	if (!persisted) {
		const cancelled = await getProvider(rented.provider)
			.cancel(rented.providerRef)
			.catch(() => false);
		void recordAttemptRejection(
			ctx.orderItemId,
			rented.providerRef,
			cancelled,
			cancelled ? 0 : undefined
		);
		// A late worker that lost its generation must clean up only ITS provider result. It must never
		// overwrite or refund the newer winner. This is the fence that prevents the incident's
		// refund -> stale rent -> paid resurrection sequence.
		if (persistOwnershipLost) {
			if (!cancelled) {
				await sendCriticalAdminAlert({
					title: 'Numbers: stale rent could not be released',
					message: `A stale worker rented ${rented.provider} ${rented.providerRef} for order ${ctx.orderNumber} after losing generation ${generation}. Its result was rejected by the database fence and provider release was not confirmed. Reconcile this exact provider reference.`,
					source: `phone.${source}`,
					dedupeKey: `phone-stale-rent:${ctx.orderItemId}:${rented.providerRef}`
				}).catch(() => {});
			}
			return currentFulfillmentResult(ctx.orderItemId);
		}

		const refunded = await refundPhoneOrderToStoreCredit(
			orderId,
			'We could not complete your number — fully refunded',
			source,
			{
				generation,
				status: 'renting',
				rentLeaseToken,
				failureReason: 'rent persist failed — provider release attempted; customer refunded'
			}
		);
		if (!refunded) return currentFulfillmentResult(ctx.orderItemId);
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
	source: string,
	expected?: {
		generation: number;
		status: string;
		operationToken?: string | null;
		rentLeaseToken?: string | null;
		rentLeaseExpiredAt?: Date;
		failureReason?: string;
	}
): Promise<boolean> {
	const ctx = await loadPhoneOrderContext(orderId);
	if (!ctx) return false;

	if (!ctx.userId) {
		// Guests have no wallet — flag for manual handling.
		await prisma.phoneRental.updateMany({
			where: {
				orderItemId: ctx.orderItemId,
				refundedAt: null,
				...(expected
					? {
							generation: expected.generation,
							status: expected.status,
							...(expected.operationToken !== undefined
								? { operationToken: expected.operationToken }
								: {}),
							...(expected.rentLeaseToken !== undefined
								? { rentLeaseToken: expected.rentLeaseToken }
								: {}),
							...(expected.rentLeaseExpiredAt
								? {
										OR: [
											{ rentLeaseExpiresAt: null },
											{ rentLeaseExpiresAt: { lte: expected.rentLeaseExpiredAt } }
										]
									}
								: {})
						}
					: {})
			},
			data: {
				status: 'refunded',
				refundedAt: new Date(),
				failureReason: expected?.failureReason ?? 'guest — manual refund needed',
				operationToken: null,
				operationLeaseExpiresAt: null,
				rentLeaseToken: null,
				rentLeaseExpiresAt: null
			}
		});
		await sendCriticalAdminAlert({
			title: 'Phone order needs manual refund (guest)',
			message: `Order ${ctx.orderNumber} could not be auto-refunded — no user wallet.`,
			source: `phone.${source}`,
			dedupeKey: `phone-guest-refund:${ctx.orderItemId}`
		}).catch(() => {});
		return false;
	}

	const refunded = await prisma.$transaction(
		async (tx) => {
			// All refund paths lock the order before the wallet. This serializes automatic
			// Numbers refunds with manual full/per-account refunds and avoids both overlap
			// and lock-order deadlocks between concurrent admin and fulfillment workers.
			await tx.$queryRaw`SELECT id FROM orders WHERE id = ${ctx.orderId}::uuid FOR UPDATE`;
			// Claim the refund: only rentals not yet refunded and not received.
			const claim = await tx.phoneRental.updateMany({
				where: {
					orderItemId: ctx.orderItemId,
					refundedAt: null,
					...(expected
						? {
								generation: expected.generation,
								status: expected.status,
								...(expected.operationToken !== undefined
									? { operationToken: expected.operationToken }
									: {}),
								...(expected.rentLeaseToken !== undefined
									? { rentLeaseToken: expected.rentLeaseToken }
									: {}),
								...(expected.rentLeaseExpiredAt
									? {
											OR: [
												{ rentLeaseExpiresAt: null },
												{ rentLeaseExpiresAt: { lte: expected.rentLeaseExpiredAt } }
											]
										}
									: {})
							}
						: { status: { notIn: ['received', 'refunded'] } })
				},
				data: {
					status: 'refunded',
					refundedAt: new Date(),
					operationToken: null,
					operationLeaseExpiresAt: null,
					rentLeaseToken: null,
					rentLeaseExpiresAt: null,
					...(expected?.failureReason ? { failureReason: expected.failureReason } : {})
				}
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
		},
		{ maxWait: 10_000, timeout: 20_000 }
	);

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
 * Drive an awaiting rental: kick off the rent if still pending, then poll its provider for
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
	// Recovery for legacy/transient failures created before refunds became atomic. A `failed` rental
	// without `refundedAt` is not financially terminal: keep trying the idempotent wallet credit.
	if (rental.status === 'failed' && !rental.refundedAt) {
		const orderId = await orderIdForItem(orderItemId);
		if (!orderId) return { status: 'unknown' };
		const refunded = await refundPhoneOrderToStoreCredit(
			orderId,
			'We could not complete your number — refunded to store credit',
			'failed-recovery',
			{
				generation: rental.generation,
				status: 'failed',
				failureReason: rental.failureReason ?? 'failed rental recovered and refunded'
			}
		);
		return refunded
			? { status: 'refunded', message: 'Refunded to store credit' }
			: { status: 'preparing', message: 'Finishing your refund…' };
	}
	if (TERMINAL_STATUSES.has(rental.status))
		return { status: rental.status === 'refunded' ? 'refunded' : 'expired' };

	// An in-progress cancel/replacement is also leased per rental. A live operation is left alone;
	// an expired one is resumed through the same fenced path instead of spawning a competing action.
	if (rental.status === 'cancelling' || rental.status === 'replacing') {
		if (rental.operationLeaseExpiresAt && rental.operationLeaseExpiresAt.getTime() > Date.now()) {
			return { status: 'preparing', message: 'Finishing the change…' };
		}
		if (rental.status === 'cancelling') {
			const outcome = await cancelAndRefundRental(
				orderItemId,
				'No code arrived — refunded to store credit'
			);
			return outcome === 'received'
				? { status: 'received' }
				: outcome === 'refunded'
					? { status: 'refunded', message: 'Refunded to store credit' }
					: { status: 'preparing', message: 'Finishing the change…' };
		}
		const retry = await customerRetryPhoneRental(orderItemId);
		return retry.status === 'received'
			? { status: 'received', phoneNumber: retry.phoneNumber }
			: retry.status === 'refunded'
				? { status: 'refunded', message: retry.message }
				: { status: 'preparing', phoneNumber: retry.phoneNumber, message: retry.message };
	}

	// A rent lease replaces the provider-specific `!hubOrderUuid && age > 3m` heuristic that caused
	// the incident. A live slow pvapins call is never refunded. After lease expiry, a claim with no
	// upstream call is safe to retry; an in-flight/legacy-unknown call is conservatively refunded and
	// alerted, and any late result will fail its generation fence and be cancelled by its own worker.
	if (rental.status === 'renting') {
		const leaseLive =
			rental.rentLeaseExpiresAt != null && rental.rentLeaseExpiresAt.getTime() > Date.now();
		if (leaseLive) return { status: 'preparing', message: 'Getting your number…' };

		const rentFence = {
			orderItemId,
			status: 'renting',
			generation: rental.generation,
			rentLeaseToken: rental.rentLeaseToken,
			OR: [{ rentLeaseExpiresAt: null }, { rentLeaseExpiresAt: { lte: new Date() } }]
		};
		const upstreamCallMayExist =
			rental.rentCallStartedAt != null || rental.rentLeaseToken?.startsWith('legacy:');
		if (!upstreamCallMayExist) {
			const reopened = await prisma.phoneRental.updateMany({
				where: rentFence,
				data: {
					status: 'pending',
					rentLeaseToken: null,
					rentLeaseExpiresAt: null,
					rentCandidateProvider: null,
					rentCandidateServiceRef: null,
					rentCallStartedAt: null,
					failureReason: 'abandoned before provider call — safely retried'
				}
			});
			if (reopened.count > 0) {
				const orderId = await orderIdForItem(orderItemId);
				if (orderId) {
					const r = await fulfillPhoneOrder(orderId, 'lease-recovery');
					return r.status === 'refunded'
						? { status: 'refunded', message: r.message }
						: { status: 'awaiting_sms', phoneNumber: r.phoneNumber, message: r.message };
				}
			}
			return { status: 'preparing', message: 'Getting your number…' };
		}

		const orderId = await orderIdForItem(orderItemId);
		if (!orderId) return { status: 'preparing', message: 'Getting your number…' };
		const rentLeaseExpiredAt = new Date();
		const refunded = await refundPhoneOrderToStoreCredit(
			orderId,
			'We could not complete your number — refunded to store credit',
			'poll',
			{
				generation: rental.generation,
				status: 'renting',
				rentLeaseToken: rental.rentLeaseToken,
				rentLeaseExpiredAt,
				failureReason: 'rent lease expired during provider call — refunded; reconcile provider ref'
			}
		);
		if (!refunded) return { status: 'preparing', message: 'Getting your number…' };
		await sendCriticalAdminAlert({
			title: 'Numbers rent lease expired — reconcile possible provider hold',
			message: `Order item ${orderItemId}, generation ${rental.generation}, expired while calling ${rental.rentCandidateProvider ?? 'an unknown provider'} (${rental.rentCandidateServiceRef ?? 'unknown candidate'}). The customer was refunded. Reconcile that provider; any late worker result is fenced and will attempt release.`,
			source: 'phone.poll',
			dedupeKey: `phone-rent-lease-expired:${orderItemId}:${rental.generation}`
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
		const received = await markRentalReceived(
			orderItemId,
			{ otp: poll.otp, message: poll.message, from: poll.from },
			{ ...rental, status: 'awaiting_sms' }
		);
		if (!received) {
			const current = await currentFulfillmentResult(orderItemId);
			return current.status === 'received'
				? { status: 'received', phoneNumber: current.phoneNumber }
				: current.status === 'refunded'
					? { status: 'refunded' }
					: { status: 'preparing', phoneNumber: current.phoneNumber };
		}
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
		: (rental.rentedAt ?? rental.createdAt).getTime() + pricing.activationTimeoutMinutes * 60_000;

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
	let rental = await prisma.phoneRental.findUnique({ where: { orderItemId } });
	if (!rental) return 'refunded';
	if (rental.status === 'received') return 'received';
	if (TERMINAL_STATUSES.has(rental.status)) return 'refunded';
	if (
		rental.status !== 'pending' &&
		rental.status !== 'awaiting_sms' &&
		rental.status !== 'cancelling'
	) {
		return 'pending';
	}
	const resumeStatus = refForRental(rental) ? 'awaiting_sms' : 'pending';

	const operationToken = randomUUID();
	const now = new Date();
	const recoverExpired =
		rental.status === 'cancelling' &&
		(!rental.operationLeaseExpiresAt || rental.operationLeaseExpiresAt.getTime() <= now.getTime());
	if (rental.status === 'cancelling' && !recoverExpired) return 'pending';

	const claim = await prisma.phoneRental.updateMany({
		where: {
			...rentalIdentityWhere(orderItemId, rental),
			status: rental.status,
			...(recoverExpired
				? {
						operationToken: rental.operationToken,
						OR: [{ operationLeaseExpiresAt: null }, { operationLeaseExpiresAt: { lte: now } }]
					}
				: {})
		},
		data: {
			status: 'cancelling',
			operationToken,
			operationLeaseExpiresAt: new Date(now.getTime() + OPERATION_LEASE_MS)
		}
	});
	if (claim.count === 0) {
		const current = await prisma.phoneRental.findUnique({ where: { orderItemId } });
		if (current?.status === 'received') return 'received';
		if (current && TERMINAL_STATUSES.has(current.status)) return 'refunded';
		return 'pending';
	}
	rental = { ...rental, status: 'cancelling', operationToken };
	const operationFence = {
		...rentalIdentityWhere(orderItemId, rental),
		status: 'cancelling',
		operationToken
	};
	const releaseOperation = async () => {
		await prisma.phoneRental.updateMany({
			where: operationFence,
			data: { status: resumeStatus, operationToken: null, operationLeaseExpiresAt: null }
		});
	};

	// Never rented (still pending) — no provider cost to reclaim, safe to refund.
	const ref = refForRental(rental);
	if (!ref) {
		const orderId = await orderIdForItem(orderItemId);
		if (!orderId) {
			await releaseOperation();
			return 'pending';
		}
		const refunded = await refundPhoneOrderToStoreCredit(orderId, description, 'cancel', {
			generation: rental.generation,
			status: 'cancelling',
			operationToken
		});
		return refunded ? 'refunded' : 'pending';
	}

	const provider = providerForRental(rental);

	// Authoritative check: did the source deliver a billable code?
	const poll = await provider
		.pollSms(ref)
		.catch(() => ({ status: 'error', reason: 'poll failed' }) as ProviderSmsResult);
	// Transient failure → back off and let the next sweep retry rather than refunding blind.
	if (poll.status === 'error') {
		await releaseOperation();
		return 'pending';
	}
	if (poll.status === 'received') {
		const received = await markRentalReceived(
			orderItemId,
			{ otp: poll.otp, message: poll.message, from: poll.from },
			{ ...rental, status: 'cancelling', operationToken }
		);
		return received ? 'received' : 'pending';
	}

	// No billable code (waiting/expired). Best-effort cancel to release our balance. Defense against
	// the narrow race where a code lands between our check and the cancel: if the cancel is REFUSED
	// (a used/delivered number can't be cancelled), re-check once and mark received rather than
	// refunding a delivered activation.
	const cancelled = await provider.cancel(ref).catch(() => false);
	void recordAttemptRejection(orderItemId, ref, cancelled, cancelled ? 0 : undefined);
	if (!cancelled) {
		const late = await provider
			.pollSms(ref)
			.catch(() => ({ status: 'error', reason: 'recheck failed' }) as ProviderSmsResult);
		if (late.status === 'received') {
			const received = await markRentalReceived(
				orderItemId,
				{ otp: late.otp, message: late.message, from: late.from },
				{ ...rental, status: 'cancelling', operationToken }
			);
			return received ? 'received' : 'pending';
		}
		if (late.status === 'error') {
			await releaseOperation();
			return 'pending';
		}
		if (rental.provider === 'pvapins') {
			if (!rental.shadowProviderRef) {
				await prisma.phoneRental.updateMany({
					where: operationFence,
					data: {
						shadowProviderRef: ref,
						shadowCostCents: rental.costCents,
						shadowStaleAt: new Date()
					}
				});
			} else if (rental.shadowProviderRef !== ref) {
				await sendCriticalAdminAlert({
					title: 'Numbers: second unresolved pvapins hold on refund',
					message: `Order item ${orderItemId} already tracks shadow ${rental.shadowProviderRef}; provider release also failed for ${ref}. Reconcile this exact second reference manually.`,
					source: 'phone.cancel',
					dedupeKey: `phone-second-shadow:${orderItemId}:${ref}`
				}).catch(() => {});
			}
		}
	}
	// Only train supplier delivery reliability when the buyer actually requested an OTP. A buyer
	// who cancels an unused number is not evidence that the provider failed to deliver a code.
	if (rental.otpRequestedAt) void recordAttemptOtpTimeout(orderItemId, ref);
	const orderId = await orderIdForItem(orderItemId);
	if (!orderId) {
		await releaseOperation();
		return 'pending';
	}
	const refunded = await refundPhoneOrderToStoreCredit(orderId, description, 'cancel', {
		generation: rental.generation,
		status: 'cancelling',
		operationToken
	});
	return refunded ? 'refunded' : 'pending';
}

/**
 * User-initiated cancel from the order page. Allowed only after the 2-minute safety
 * window and before a code arrives; refunds to store credit after a provider-aware check.
 */
export async function userCancelPhoneRental(
	orderItemId: string
): Promise<{ ok: boolean; outcome: CancelOutcome; message: string }> {
	const rental = await prisma.phoneRental.findUnique({ where: { orderItemId } });
	if (!rental) return { ok: false, outcome: 'refunded', message: 'Not found' };

	if (rental.status === 'received')
		return {
			ok: false,
			outcome: 'received',
			message: 'Your code already arrived — this order is complete.'
		};
	if (TERMINAL_STATUSES.has(rental.status))
		return { ok: true, outcome: 'refunded', message: 'This order was already refunded.' };
	if (Date.now() - (rental.rentedAt ?? rental.createdAt).getTime() <= CANCEL_MIN_AGE_MS)
		return {
			ok: false,
			outcome: 'pending',
			message: 'You can cancel after 2 minutes if no code has arrived.'
		};

	const outcome = await cancelAndRefundRental(
		orderItemId,
		'Cancelled by you — refunded to store credit'
	);
	if (outcome === 'received')
		return { ok: false, outcome, message: 'Your code just arrived — this order is now complete.' };
	if (outcome === 'refunded')
		return { ok: true, outcome, message: 'Cancelled and refunded to your store credit.' };
	return { ok: false, outcome, message: 'Could not cancel yet — please try again shortly.' };
}

// How many times a customer may "try another number" on one order before we refund instead.
const MAX_CUSTOMER_RETRIES = 3;

/**
 * Customer-initiated "try another number": when a code hasn't arrived, swap the current supplier
 * for the next-best one WITHOUT re-charging the customer. Capped, release-before-retry, and it
 * re-checks for a code first so a just-arrived code is never dropped.
 *
 * Budget model (revised): the replacement wait runs from when the customer confirmed "I've
 * requested the code" (otpRequestedAt), not rent time. After ~120s with no OTP, an unconfirmed
 * pvapins number is treated as a CONTINGENT "shadow" (pay-on-success, very likely dead) — it does
 * NOT reserve budget, so the replacement keeps its full headroom to climb into a better variant.
 * hub-man (pay-on-rent, already debited) still reserves its committed cost. The ₦500 rule stays
 * hard for known costs + the candidate we actively buy. Overlap is capped at one shadow.
 */
export async function customerRetryPhoneRental(
	orderItemId: string
): Promise<{ ok: boolean; status: string; phoneNumber?: string; message: string }> {
	let rental = await prisma.phoneRental.findUnique({ where: { orderItemId } });
	if (!rental) return { ok: false, status: 'unknown', message: 'Order not found.' };
	if (rental.status === 'received')
		return {
			ok: false,
			status: 'received',
			message: 'Your code already arrived — this order is complete.'
		};
	if (TERMINAL_STATUSES.has(rental.status))
		return { ok: false, status: rental.status, message: 'This order is already resolved.' };
	if ((rental.status !== 'awaiting_sms' && rental.status !== 'replacing') || !refForRental(rental))
		return { ok: false, status: 'preparing', message: 'Still getting your number — one moment.' };
	if (
		rental.status === 'replacing' &&
		rental.operationLeaseExpiresAt &&
		rental.operationLeaseExpiresAt.getTime() > Date.now()
	) {
		return {
			ok: false,
			status: 'preparing',
			message: 'Still getting your replacement — one moment.'
		};
	}

	// The replacement wait runs from the customer's explicit "I've requested the code" confirmation.
	const pricing = await getPhonePricingConfig();
	const waitMs = Math.max(30, pricing.otpReplacementWaitSeconds ?? 120) * 1000;
	if (!rental.otpRequestedAt)
		return {
			ok: false,
			status: 'awaiting_sms',
			message: 'Tap “I’ve requested the code”, then give it about 2 minutes.'
		};
	if (Date.now() - rental.otpRequestedAt.getTime() < waitMs)
		return {
			ok: false,
			status: 'awaiting_sms',
			message: 'Give the code a couple of minutes to arrive before trying another.'
		};

	// Claim this exact active number before polling/cancelling it. A concurrent poll may either win
	// first and deliver the code, or lose to this replacement; it can never mutate the next number.
	const operationToken = randomUUID();
	const operationNow = new Date();
	const priorOperationToken = rental.operationToken;
	const retryClaim = await prisma.phoneRental.updateMany({
		where: {
			...rentalIdentityWhere(orderItemId, rental),
			status: rental.status,
			...(rental.status === 'replacing'
				? {
						operationToken: priorOperationToken,
						OR: [
							{ operationLeaseExpiresAt: null },
							{ operationLeaseExpiresAt: { lte: operationNow } }
						]
					}
				: {})
		},
		data: {
			status: 'replacing',
			operationToken,
			operationLeaseExpiresAt: new Date(operationNow.getTime() + OPERATION_LEASE_MS)
		}
	});
	if (retryClaim.count === 0) {
		const current = await currentFulfillmentResult(orderItemId);
		return {
			ok: false,
			status: current.status,
			phoneNumber: current.phoneNumber,
			message: current.message
		};
	}
	rental = { ...rental, status: 'replacing', operationToken };
	const operationFence = {
		...rentalIdentityWhere(orderItemId, rental),
		status: 'replacing',
		operationToken
	};
	const releaseReplacement = async () => {
		await prisma.phoneRental.updateMany({
			where: operationFence,
			data: { status: 'awaiting_sms', operationToken: null, operationLeaseExpiresAt: null }
		});
	};

	const ref = refForRental(rental)!;
	const provider = providerForRental(rental);

	// Never drop a code that just arrived.
	const poll = await provider
		.pollSms(ref)
		.catch(() => ({ status: 'error', reason: 'poll failed' }) as ProviderSmsResult);
	if (poll.status === 'error') {
		await releaseReplacement();
		return {
			ok: false,
			status: 'awaiting_sms',
			phoneNumber: rental.phoneNumber ?? undefined,
			message: 'Could not check the current number yet — please try again shortly.'
		};
	}
	if (poll.status === 'received') {
		const received = await markRentalReceived(
			orderItemId,
			{ otp: poll.otp, message: poll.message, from: poll.from },
			{ ...rental, status: 'replacing', operationToken }
		);
		return {
			ok: false,
			status: received ? 'received' : 'preparing',
			phoneNumber: rental.phoneNumber ?? undefined,
			message: received ? 'Your code just arrived!' : 'Finishing your replacement…'
		};
	}

	// Out of retries → cancel + refund instead of trying forever.
	if ((rental.retryCount ?? 0) >= MAX_CUSTOMER_RETRIES) {
		await releaseReplacement();
		const outcome = await cancelAndRefundRental(
			orderItemId,
			'No code after several tries — refunded to store credit'
		);
		if (outcome === 'received')
			return {
				ok: false,
				status: 'received',
				message: 'Your code just arrived — this order is complete.'
			};
		return {
			ok: true,
			status: 'refunded',
			message: "We couldn't get a code after several tries — you've been refunded to store credit."
		};
	}

	// Release the current number (using the cancel RESULT), then decide how it affects the budget:
	//  - hub-man (pay-on-rent): an unconfirmed cancel is a REAL committed cost → reserve it.
	//  - pvapins (pay-on-success): after the 120s no-OTP wait it's very likely dead. An unconfirmed
	//    one becomes a CONTINGENT shadow — not reserved 1:1 — so the replacement keeps headroom. We
	//    keep it durable (shadow_*) for background reconciliation + late-charge accounting. Overlap
	//    is capped at ONE shadow: a 2nd simultaneous stale pvapins falls back to reserving its cost.
	const released = await provider.cancel(ref).catch(() => false);
	void recordAttemptRejection(orderItemId, ref, released, released ? 0 : undefined);
	if (!released) {
		const late = await provider
			.pollSms(ref)
			.catch(() => ({ status: 'error', reason: 'recheck failed' }) as ProviderSmsResult);
		if (late.status === 'received') {
			const received = await markRentalReceived(
				orderItemId,
				{ otp: late.otp, message: late.message, from: late.from },
				{ ...rental, status: 'replacing', operationToken }
			);
			return {
				ok: false,
				status: received ? 'received' : 'preparing',
				phoneNumber: rental.phoneNumber ?? undefined,
				message: received ? 'Your code just arrived!' : 'Finishing your replacement…'
			};
		}
		if (late.status === 'error') {
			await releaseReplacement();
			return {
				ok: false,
				status: 'awaiting_sms',
				phoneNumber: rental.phoneNumber ?? undefined,
				message: 'Could not safely release this number yet — please try again shortly.'
			};
		}
	}
	void recordAttemptOtpTimeout(orderItemId, ref);
	const oldCostCents = rental.costCents ?? 0;
	let reserveCents = 0;
	const shadowData: {
		shadowProviderRef?: string;
		shadowCostCents?: number;
		shadowStaleAt?: Date;
	} = {};
	if (!released) {
		if (rental.provider === 'pvapins') {
			if (!rental.shadowProviderRef) {
				// First free shadow — reopen the replacement's headroom, record it durably.
				shadowData.shadowProviderRef = ref;
				shadowData.shadowCostCents = oldCostCents;
				shadowData.shadowStaleAt = new Date();
			} else {
				reserveCents = oldCostCents; // already one shadow → cap overlap, reserve this one
			}
		} else {
			reserveCents = oldCostCents; // hub-man committed cost
		}
	}
	const tried = Array.from(
		new Set([...(rental.triedSuppliers ?? []), candidateKeyFromRental(rental)])
	);
	const orderId = await orderIdForItem(orderItemId);
	if (!orderId) return { ok: false, status: 'error', message: 'Order not found.' };

	// Reset to pending (fresh number ⇒ clear otpRequestedAt), record tried suppliers + retry count,
	// accrue any hard reservation, and durably record the shadow. Then re-fulfill up the ladder
	// (which subtracts only the RESERVED liability — not the contingent shadow — from the budget).
	const reset = await prisma.phoneRental.updateMany({
		where: operationFence,
		data: {
			status: 'pending',
			hubOrderUuid: null,
			providerRef: null,
			phoneNumber: null,
			otp: null,
			smsMessage: null,
			otpRequestedAt: null,
			operationToken: null,
			operationLeaseExpiresAt: null,
			...shadowData,
			triedSuppliers: tried,
			retryCount: { increment: 1 },
			reservedLiabilityCents: { increment: reserveCents }
		}
	});
	if (reset.count === 0) {
		const current = await currentFulfillmentResult(orderItemId);
		return {
			ok: false,
			status: current.status,
			phoneNumber: current.phoneNumber,
			message: current.message
		};
	}

	const r = await fulfillPhoneOrder(orderId, 'retry', { excludeKeys: tried });
	if (r.status === 'awaiting_sms')
		return {
			ok: true,
			status: 'awaiting_sms',
			phoneNumber: r.phoneNumber,
			message: 'Here’s a fresh number — request your code again.'
		};
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
		where: {
			OR: [
				{ status: { in: ['pending', 'renting', 'awaiting_sms', 'cancelling', 'replacing'] } },
				{ status: 'failed', refundedAt: null }
			]
		},
		select: { orderItemId: true }
	});
	let acted = 0;
	for (const { orderItemId } of candidates) {
		const result = await pollPhoneRentalSms(orderItemId).catch(() => null);
		if (result && (result.status === 'received' || result.status === 'refunded')) acted += 1;
	}
	return acted;
}

// A stale pvapins "shadow" can't keep receiving forever — a pvapins activation expires. Past this
// age with no code, treat it as dead/free and stop tracking it.
const SHADOW_MAX_AGE_MS = 30 * 60_000;

/** Null out a resolved shadow (race-safe: only if it's still this exact shadow ref). Best-effort. */
async function clearShadow(orderItemId: string, shadowRef: string): Promise<void> {
	await prisma.phoneRental
		.updateMany({
			where: { orderItemId, shadowProviderRef: shadowRef },
			data: { shadowProviderRef: null, shadowCostCents: null, shadowStaleAt: null }
		})
		.catch(() => {});
}

/**
 * Reconcile abandoned "shadow" pvapins numbers (stale predecessors from "try another"). Because
 * pvapins is pay-on-success, an abandoned number can still receive a code later and bill us — a
 * leakage the customer never sees. This polls each open shadow (get_sms is NOT the ~5/min-limited
 * get_number endpoint) and resolves it:
 *  - received → the shadow LATE-CHARGED us: record it on its attempt (now auditable COGS) + alert.
 *  - expired / too old → dead/free: best-effort reject, then stop tracking.
 *  - waiting / error → leave it for the next pass.
 * Purely OBSERVATIONAL + best-effort — it never touches customer fulfillment, budgets, or refunds.
 */
export async function reconcilePhoneShadows(): Promise<{ reconciled: number; leaked: number }> {
	const shadows = await prisma.phoneRental
		.findMany({
			where: { shadowProviderRef: { not: null } },
			select: {
				orderItemId: true,
				shadowProviderRef: true,
				shadowCostCents: true,
				shadowStaleAt: true
			}
		})
		.catch(
			() =>
				[] as Array<{
					orderItemId: string;
					shadowProviderRef: string | null;
					shadowCostCents: number | null;
					shadowStaleAt: Date | null;
				}>
		);
	let reconciled = 0;
	let leaked = 0;
	for (const s of shadows) {
		const ref = s.shadowProviderRef;
		if (!ref) continue;
		try {
			const provider = getProvider('pvapins');
			const poll: ProviderSmsResult = await provider
				.pollSms(ref)
				.catch(() => ({ status: 'error', reason: 'poll failed' }) as ProviderSmsResult);
			const tooOld =
				s.shadowStaleAt != null && Date.now() - s.shadowStaleAt.getTime() > SHADOW_MAX_AGE_MS;
			if (poll.status === 'received') {
				// Leakage: an abandoned number received a code → pvapins charged us for a number the
				// customer never used. Make it auditable (its attempt's real COGS) and alert.
				await recordAttemptOtpReceived(s.orderItemId, ref, null, s.shadowCostCents);
				await sendCriticalAdminAlert({
					title: 'Numbers: abandoned pvapins number late-charged (leakage)',
					message: `Order item ${s.orderItemId}: a stale pvapins number received a code after the customer moved on — supplier cost ~$${((s.shadowCostCents ?? 0) / 100).toFixed(2)} leaked. If these become frequent, raise the replacement wait or the tier price.`,
					source: 'phone.shadow',
					dedupeKey: `phone-shadow-leak:${s.orderItemId}:${ref}`
				}).catch(() => {});
				await clearShadow(s.orderItemId, ref);
				leaked += 1;
				reconciled += 1;
			} else if (poll.status === 'expired' || tooOld) {
				const released = await provider.cancel(ref).catch(() => false);
				await recordAttemptRejection(s.orderItemId, ref, released, released ? 0 : undefined);
				await recordAttemptOtpTimeout(s.orderItemId, ref);
				await clearShadow(s.orderItemId, ref);
				reconciled += 1;
			}
			// waiting / error → leave it; the next sweep re-checks.
		} catch (error) {
			console.error('[phone.shadow] reconcile failed (ignored):', (error as Error).message);
		}
	}
	return { reconciled, leaked };
}
