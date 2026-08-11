import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * fulfillPhoneOrder rent path (B.3b): rent the best candidate from the pool, fail over across
 * suppliers, protect the profit floor (ceiling filter), refund when nothing can supply, and
 * record which provider served it. Money code — these lock the behaviour.
 */

const prismaMock = vi.hoisted(() => ({
	phoneRental: { upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
	orderItem: { findFirst: vi.fn(), findUnique: vi.fn() },
	order: { update: vi.fn() },
	$transaction: vi.fn()
}));
const rentMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());
const getProviderMock = vi.hoisted(() => vi.fn());
const buildLiveCandidatePoolMock = vi.hoisted(() => vi.fn());
const creditStoreCreditMock = vi.hoisted(() => vi.fn());
const getPhoneTierConfigMock = vi.hoisted(() => vi.fn());
const getPhonePricingConfigMock = vi.hoisted(() => vi.fn());
const maxPriceMock = vi.hoisted(() => vi.fn(() => 100000));
const maxRentMock = vi.hoisted(() => vi.fn(() => 100000)); // hard procurement ceiling (USD cents)
const acquireRateTokenMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./number-providers', () => ({
	getProvider: getProviderMock,
	buildLiveCandidatePool: buildLiveCandidatePoolMock,
	providerForRental: vi.fn(),
	refForRental: vi.fn()
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
	computeMaxPriceCentsForSale: maxPriceMock,
	computeProcurementCeilingCents: maxRentMock
}));
vi.mock('./rate-limiter', () => ({
	acquireRateToken: acquireRateTokenMock,
	pvapinsRateSpec: () => ({ capacity: 5, refillPerSec: 5 / 60 }),
	PVAPINS_GET_NUMBER_BUCKET: 'pvapins:get_number'
}));
vi.mock('$lib/helpers/phone-tier-config', () => ({ getPhoneTierConfig: getPhoneTierConfigMock }));

import { fulfillPhoneOrder } from './phone-fulfillment';

const candidate = (over: Record<string, unknown> = {}) => ({
	provider: 'hubman',
	providerServiceRef: '1',
	providerCountryRef: '58',
	label: 'hubman:1',
	costCents: 50,
	available: 3,
	reliability: null,
	sampleSize: 0,
	...over
});

beforeEach(() => {
	vi.clearAllMocks();
	maxPriceMock.mockReturnValue(100000);
	maxRentMock.mockReturnValue(100000);
	acquireRateTokenMock.mockResolvedValue(true);
	prismaMock.phoneRental.upsert.mockResolvedValue({});
	prismaMock.phoneRental.updateMany.mockResolvedValue({ count: 1 }); // claim pending→renting
	prismaMock.phoneRental.update.mockResolvedValue({});
	prismaMock.order.update.mockResolvedValue({});
	prismaMock.orderItem.findFirst.mockResolvedValue({
		id: 'item-1',
		totalPrice: 4800,
		category: { metadata: {} },
		order: { userId: 'user-1', orderNumber: 'ORD-1' }
	});
	getPhoneTierConfigMock.mockReturnValue({
		serviceId: 1,
		countryId: 58,
		serviceName: 'WhatsApp',
		countryName: 'USA',
		countryCode: 'US',
		expectedCostCents: 66,
		availableCount: 5,
		autoHidden: false,
		hideReason: null
	});
	getPhonePricingConfigMock.mockResolvedValue({ usdNgnRate: 1500, marginPercent: 120, activationTimeoutMinutes: 20 });
	getProviderMock.mockReturnValue({ rent: rentMock, cancel: cancelMock });
	prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
		cb({ phoneRental: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, order: { update: vi.fn() } })
	);
});

describe('fulfillPhoneOrder — candidate rent + failover', () => {
	it('rents the top candidate and records the provider (hub-man)', async () => {
		buildLiveCandidatePoolMock.mockResolvedValue([candidate()]);
		rentMock.mockResolvedValue({ providerRef: 'uuid-1', phoneNumber: '15551234567', costCents: 50, expiresAt: null });

		const res = await fulfillPhoneOrder('order-1', 'test');

		expect(res.status).toBe('awaiting_sms');
		expect(prismaMock.phoneRental.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ provider: 'hubman', providerRef: 'uuid-1', hubOrderUuid: 'uuid-1' })
			})
		);
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
	});

	it('fails over to the next supplier when the first is out of stock', async () => {
		buildLiveCandidatePoolMock.mockResolvedValue([
			candidate({ label: 'hubman:1' }),
			candidate({ provider: 'pvapins', providerServiceRef: 'Whatsapp24', providerCountryRef: 'USA', label: 'pvapins:Whatsapp24', costCents: 66 })
		]);
		rentMock
			.mockImplementationOnce(() => {
				throw new Error('out of stock');
			})
			.mockResolvedValueOnce({ providerRef: '19012306415|USA|Whatsapp24', phoneNumber: '19012306415', costCents: 66, expiresAt: null });

		const res = await fulfillPhoneOrder('order-1', 'test');

		expect(res.status).toBe('awaiting_sms');
		// Persisted the pvapins supplier; hubOrderUuid null for non-hub-man.
		expect(prismaMock.phoneRental.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					provider: 'pvapins',
					providerRef: '19012306415|USA|Whatsapp24',
					hubOrderUuid: null
				})
			})
		);
	});

	it('refunds when every candidate fails', async () => {
		buildLiveCandidatePoolMock.mockResolvedValue([candidate(), candidate({ provider: 'pvapins', label: 'pvapins:Whatsapp24' })]);
		rentMock.mockImplementation(() => {
			throw new Error('out of stock');
		});

		const res = await fulfillPhoneOrder('order-1', 'test');

		expect(res.status).toBe('refunded');
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
	});

	it('refunds when the pool is empty', async () => {
		buildLiveCandidatePoolMock.mockResolvedValue([]);
		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('refunded');
		expect(rentMock).not.toHaveBeenCalled();
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
	});

	it('filters out over-ceiling candidates and refunds if none remain', async () => {
		maxRentMock.mockReturnValue(100); // hard procurement ceiling 100 cents
		buildLiveCandidatePoolMock.mockResolvedValue([candidate({ costCents: 9999 })]); // too expensive
		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('refunded');
		expect(rentMock).not.toHaveBeenCalled(); // never even attempted — over ceiling
	});

	// The price-ladder sweep. The hard procurement ceiling is set per-test via maxRentMock (USD cents).
	const pv = (ref: string, costCents: number) =>
		candidate({ provider: 'pvapins', providerServiceRef: ref, providerCountryRef: 'USA', label: `pvapins:${ref}`, costCents });

	it('climbs past many out-of-stock suppliers (NOT capped at 4) until one is in stock', async () => {
		buildLiveCandidatePoolMock.mockResolvedValue(
			[50, 60, 70, 80, 90, 100].map((c, i) => pv(`Whatsapp${i}`, c))
		);
		rentMock
			.mockImplementationOnce(() => { throw new Error('oos'); })
			.mockImplementationOnce(() => { throw new Error('oos'); })
			.mockImplementationOnce(() => { throw new Error('oos'); })
			.mockImplementationOnce(() => { throw new Error('oos'); })
			.mockImplementationOnce(() => { throw new Error('oos'); })
			.mockResolvedValueOnce({ providerRef: 'n|USA|Whatsapp5', phoneNumber: '15550000006', costCents: 100, expiresAt: null });

		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('awaiting_sms');
		expect(rentMock).toHaveBeenCalledTimes(6); // proves it did not stop at 4
	});

	it('sweeps in the ranker\'s order — does NOT re-sort by cost (reliability wins)', async () => {
		// The pool arrives pre-ranked (reliability band, then cost). A pricier but more-reliable
		// candidate is first; fulfilment must try it first, not jump to the cheaper one.
		buildLiveCandidatePoolMock.mockResolvedValue([pv('reliable', 90), pv('cheapButDry', 40)]);
		rentMock.mockResolvedValue({ providerRef: 'n|USA|reliable', phoneNumber: '1555', costCents: 90, expiresAt: null });
		await fulfillPhoneOrder('order-1', 'test');
		expect(rentMock.mock.calls[0][0]).toMatchObject({ providerServiceRef: 'reliable', expectedCostCents: 90 });
	});

	it('compresses margin: takes a pricier variant that still clears the ₦500 floor rather than refunding', async () => {
		// Hard ceiling 400¢ (= sale − ₦500 profit). A 300¢ variant is within it → rent it, still
		// profitable (never a loss). We climb to save the order but never below the floor.
		maxRentMock.mockReturnValue(400);
		buildLiveCandidatePoolMock.mockResolvedValue([pv('Whatsapp24', 300)]);
		rentMock.mockResolvedValue({ providerRef: 'n|USA|Whatsapp24', phoneNumber: '1555', costCents: 300, expiresAt: null });
		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('awaiting_sms');
		expect(rentMock).toHaveBeenCalledOnce();
	});

	it('refuses to rent above the hard ₦500 floor (never a loss/near-zero margin) → refund', async () => {
		maxRentMock.mockReturnValue(400); // hard ceiling 400¢ (sale − ₦500)
		buildLiveCandidatePoolMock.mockResolvedValue([pv('Whatsapp99', 500)]); // 500¢ > 400¢ ceiling
		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('refunded');
		expect(rentMock).not.toHaveBeenCalled();
	});

	it('subtracts unresolved prior-attempt liability from the ceiling (order-wide ₦500 floor)', async () => {
		// Full budget 400¢, but ₦-equivalent 300¢ is reserved for a prior number that could still bill.
		// Remaining = 100¢, so a 200¢ candidate that would fit the FULL budget is refused → refund.
		maxRentMock.mockReturnValue(400);
		prismaMock.phoneRental.findUnique.mockResolvedValue({ reservedLiabilityCents: 300 });
		buildLiveCandidatePoolMock.mockResolvedValue([pv('Whatsapp24', 200)]);
		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('refunded');
		expect(rentMock).not.toHaveBeenCalled();
	});

	it('pvapins rate-limited → keeps SECURING (no refund), reverts to pending', async () => {
		acquireRateTokenMock.mockResolvedValue(false); // global limiter has no token right now
		buildLiveCandidatePoolMock.mockResolvedValue([pv('Whatsapp24', 40)]);
		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('awaiting_sms');
		expect(res.message).toMatch(/securing/i);
		expect(rentMock).not.toHaveBeenCalled(); // token denied → pvapins never called
		expect(creditStoreCreditMock).not.toHaveBeenCalled(); // rate-limit is NOT a refund
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: { status: 'pending' } })
		);
	});

	it('rate-limited but PAST the activation window → refund (bounded, never loops forever)', async () => {
		acquireRateTokenMock.mockResolvedValue(false);
		prismaMock.phoneRental.findUnique.mockResolvedValue({
			reservedLiabilityCents: 0,
			createdAt: new Date(Date.now() - 60 * 60_000) // 1h ago, well past the 20-min window
		});
		buildLiveCandidatePoolMock.mockResolvedValue([pv('Whatsapp24', 40)]);
		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('refunded');
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
	});

	it('uses the per-tier floor override (₦200) over the global default when set', async () => {
		getPhoneTierConfigMock.mockReturnValue({
			serviceId: 1, countryId: 58, serviceName: 'WhatsApp', countryName: 'USA', countryCode: 'US',
			expectedCostCents: 66, availableCount: 5, autoHidden: false, hideReason: null,
			minFulfillmentProfitNgn: 200
		});
		buildLiveCandidatePoolMock.mockResolvedValue([pv('Whatsapp24', 60)]);
		rentMock.mockResolvedValue({ providerRef: 'n|USA|Whatsapp24', phoneNumber: '1555', costCents: 60, expiresAt: null });
		await fulfillPhoneOrder('order-1', 'test');
		// ceiling computed from the tier's ₦200 floor, not the global — sale ₦4,800, rate 1500.
		expect(maxRentMock).toHaveBeenCalledWith(4800, 200, 1500);
	});
});
