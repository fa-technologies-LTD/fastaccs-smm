import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * customerRetryPhoneRental (B.3b): the button-gated "try another number". Locks the guards —
 * a just-arrived code is never dropped, the retry cap refunds instead of looping forever, and a
 * retry releases the current supplier + re-rents a DIFFERENT one.
 */

const prismaMock = vi.hoisted(() => ({
	phoneRental: { upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
	orderItem: { findFirst: vi.fn(), findUnique: vi.fn() },
	order: { update: vi.fn() },
	$transaction: vi.fn()
}));
const pollSmsMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());
const rentMock = vi.hoisted(() => vi.fn());
const buildLiveCandidatePoolMock = vi.hoisted(() => vi.fn());
const creditStoreCreditMock = vi.hoisted(() => vi.fn());
const getPhoneTierConfigMock = vi.hoisted(() => vi.fn());
const getPhonePricingConfigMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./number-providers', () => ({
	getProvider: () => ({ rent: rentMock, cancel: cancelMock, pollSms: pollSmsMock }),
	buildLiveCandidatePool: buildLiveCandidatePoolMock,
	providerForRental: () => ({ pollSms: pollSmsMock, cancel: cancelMock, rent: rentMock }),
	refForRental: (r: { providerRef: string | null; hubOrderUuid: string | null; provider: string }) =>
		r.provider === 'pvapins' ? r.providerRef : r.hubOrderUuid,
	candidateKeyFromRental: (r: { provider: string; serviceId: number }) => `${r.provider}:${r.serviceId}`
}));
vi.mock('./hubman', () => ({
	isHubmanConfigured: () => true,
	cancelRent: vi.fn(),
	getBalanceCents: vi.fn(),
	getSms: vi.fn(),
	rentActivationNumber: vi.fn(),
	HubmanError: class HubmanError extends Error {}
}));
vi.mock('./store-credit', () => ({ creditStoreCredit: creditStoreCreditMock, SC_CREDIT_REFUND: 'X' }));
vi.mock('./admin-alerts', () => ({ sendCriticalAdminAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: getPhonePricingConfigMock,
	computeMaxPriceCentsForSale: () => 100000,
	computeProcurementCeilingCents: () => 100000
}));
vi.mock('./rate-limiter', () => ({
	acquireRateToken: () => Promise.resolve(true),
	pvapinsRateSpec: () => ({ capacity: 5, refillPerSec: 5 / 60 }),
	PVAPINS_GET_NUMBER_BUCKET: 'pvapins:get_number'
}));
vi.mock('$lib/helpers/phone-tier-config', () => ({ getPhoneTierConfig: getPhoneTierConfigMock }));

import { customerRetryPhoneRental } from './phone-fulfillment';

const oldEnough = new Date(Date.now() - 130_000); // past the ~120s replacement wait

const rental = (over: Record<string, unknown> = {}) => ({
	orderItemId: 'item-1',
	status: 'awaiting_sms',
	provider: 'pvapins',
	providerRef: 'old|USA|Whatsapp46',
	hubOrderUuid: null,
	phoneNumber: '19999999999',
	rentedAt: oldEnough,
	createdAt: oldEnough,
	otpRequestedAt: oldEnough, // customer requested the code long enough ago to allow a replacement
	shadowProviderRef: null,
	costCents: 66,
	retryCount: 0,
	serviceId: 1,
	...over
});

beforeEach(() => {
	vi.clearAllMocks();
	pollSmsMock.mockResolvedValue({ status: 'waiting' });
	cancelMock.mockResolvedValue(true);
	rentMock.mockResolvedValue({ providerRef: 'new|USA|Whatsapp24', phoneNumber: '15551112222', costCents: 66, expiresAt: null });
	buildLiveCandidatePoolMock.mockResolvedValue([]);
	prismaMock.phoneRental.updateMany.mockResolvedValue({ count: 1 });
	prismaMock.phoneRental.upsert.mockResolvedValue({});
	prismaMock.phoneRental.update.mockResolvedValue({});
	prismaMock.order.update.mockResolvedValue({});
	prismaMock.orderItem.findUnique.mockResolvedValue({ orderId: 'order-1' });
	prismaMock.orderItem.findFirst.mockResolvedValue({
		id: 'item-1',
		totalPrice: 4800,
		category: { metadata: {} },
		order: { userId: 'user-1', orderNumber: 'ORD-1' }
	});
	getPhoneTierConfigMock.mockReturnValue({
		serviceId: 1, countryId: 58, serviceName: 'WhatsApp', countryName: 'USA', countryCode: 'US',
		expectedCostCents: 66, availableCount: 5, autoHidden: false, hideReason: null
	});
	getPhonePricingConfigMock.mockResolvedValue({ usdNgnRate: 1500, marginPercent: 120, activationTimeoutMinutes: 20 });
	prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
		cb({ phoneRental: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, order: { update: vi.fn() } })
	);
});

describe('customerRetryPhoneRental', () => {
	it('NEVER drops a code that arrived — marks received instead of retrying', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(rental());
		pollSmsMock.mockResolvedValue({ status: 'received', otp: '123456', message: '123456' });

		const res = await customerRetryPhoneRental('item-1');

		expect(res.status).toBe('received');
		expect(cancelMock).not.toHaveBeenCalled();
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
	});

	it('refunds once the retry cap is reached instead of looping forever', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(rental({ retryCount: 3 }));
		pollSmsMock.mockResolvedValue({ status: 'waiting' });

		const res = await customerRetryPhoneRental('item-1');

		expect(res.status).toBe('refunded');
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
	});

	it('blocks a too-soon retry — within the ~120s wait after the code was requested', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(rental({ otpRequestedAt: new Date() })); // just now
		const res = await customerRetryPhoneRental('item-1');
		expect(res.ok).toBe(false);
		expect(res.status).toBe('awaiting_sms');
		expect(cancelMock).not.toHaveBeenCalled();
	});

	it('blocks a retry when the customer has not requested the code yet', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(rental({ otpRequestedAt: null }));
		const res = await customerRetryPhoneRental('item-1');
		expect(res.ok).toBe(false);
		expect(res.status).toBe('awaiting_sms');
		expect(cancelMock).not.toHaveBeenCalled();
	});

	it('releases the current supplier and re-rents a DIFFERENT one', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(rental());
		pollSmsMock.mockResolvedValue({ status: 'waiting' }); // no code
		cancelMock.mockResolvedValue(true);
		buildLiveCandidatePoolMock.mockResolvedValue([
			{ provider: 'pvapins', providerServiceRef: 'Whatsapp24', providerCountryRef: 'USA', label: 'pvapins:Whatsapp24', costCents: 66, available: 1, reliability: null, sampleSize: 0 }
		]);
		rentMock.mockResolvedValue({ providerRef: 'new|USA|Whatsapp24', phoneNumber: '15551112222', costCents: 66, expiresAt: null });

		const res = await customerRetryPhoneRental('item-1');

		expect(cancelMock).toHaveBeenCalled(); // released the old number
		expect(res.status).toBe('awaiting_sms');
		// The reset bumped the retry counter.
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ retryCount: { increment: 1 } }) })
		);
	});

	it('confirmed release reserves NO liability', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(rental({ costCents: 66 }));
		cancelMock.mockResolvedValue(true); // provider confirmed the number is released
		await customerRetryPhoneRental('item-1');
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ reservedLiabilityCents: { increment: 0 } }) })
		);
	});

	it('stale pvapins + unconfirmed release → reopens headroom (reserve 0) and records a shadow', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(rental({ costCents: 66, provider: 'pvapins' }));
		cancelMock.mockResolvedValue(false); // "Not able to reject." — contingent, likely dead after 120s
		await customerRetryPhoneRental('item-1');
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					reservedLiabilityCents: { increment: 0 }, // headroom NOT reduced
					shadowProviderRef: 'old|USA|Whatsapp46', // durable shadow for reconciliation
					otpRequestedAt: null
				})
			})
		);
	});

	it('second overlapping stale pvapins (shadow already exists) → reserves it (overlap cap)', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(
			rental({ costCents: 66, provider: 'pvapins', shadowProviderRef: 'earlier|USA|Whatsapp1' })
		);
		cancelMock.mockResolvedValue(false);
		await customerRetryPhoneRental('item-1');
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ reservedLiabilityCents: { increment: 66 } }) })
		);
	});

	it('hub-man unconfirmed cancel reserves the committed cost (pay-on-rent, no shadow)', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(
			rental({ provider: 'hubman', hubOrderUuid: 'hub-uuid-1', providerRef: null, costCents: 80 })
		);
		cancelMock.mockResolvedValue(false);
		await customerRetryPhoneRental('item-1');
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ reservedLiabilityCents: { increment: 80 } }) })
		);
	});
});
