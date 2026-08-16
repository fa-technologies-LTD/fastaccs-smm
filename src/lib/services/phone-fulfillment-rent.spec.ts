import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * fulfillPhoneOrder rent path (B.3b): rent the best candidate from the pool, fail over across
 * suppliers, protect the profit floor (ceiling filter), refund when nothing can supply, and
 * record which provider served it. Money code — these lock the behaviour.
 */

const prismaMock = vi.hoisted(() => ({
	phoneRental: { upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
	orderItem: { findFirst: vi.fn(), findUnique: vi.fn() },
	order: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
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
vi.mock('./phone-telemetry', () => ({ recordPhoneAttempt: () => Promise.resolve(null), recordAttemptOtpReceived: () => Promise.resolve(), recordAttemptOtpTimeout: () => Promise.resolve(), recordAttemptRejection: () => Promise.resolve(), classifyRentFailure: () => ({ outcome: 'error', category: 'provider_error' }) }));
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

import { fulfillPhoneOrder, pollPhoneRentalSms } from './phone-fulfillment';

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
	prismaMock.phoneRental.findUnique.mockResolvedValue({ generation: 1, reservedLiabilityCents: 0, triedSuppliers: [], createdAt: new Date() });
	prismaMock.phoneRental.update.mockResolvedValue({});
	prismaMock.order.update.mockResolvedValue({});
	prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
	prismaMock.order.findUnique.mockResolvedValue({ userId: 'user-1' });
	prismaMock.orderItem.findFirst.mockResolvedValue({
		id: 'item-1',
		totalPrice: 4800,
		category: { metadata: {} },
		order: { userId: 'user-1', orderNumber: 'ORD-1', status: 'paid', paymentStatus: 'paid', deliveryStatus: 'processing' }
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
	getPhonePricingConfigMock.mockResolvedValue({ usdNgnRate: 1500, marginPercent: 120, activationTimeoutMinutes: 20, minFulfillmentProfitNgn: 500 });
	getProviderMock.mockReturnValue({ rent: rentMock, cancel: cancelMock });
	prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
		cb({
			$queryRaw: vi.fn().mockResolvedValue([]),
			phoneRental: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			order: { update: vi.fn() }
		})
	);
});

describe('fulfillPhoneOrder — candidate rent + failover', () => {
	it('rents the top candidate and records the provider (hub-man)', async () => {
		buildLiveCandidatePoolMock.mockResolvedValue([candidate()]);
		rentMock.mockResolvedValue({ providerRef: 'uuid-1', phoneNumber: '15551234567', costCents: 50, expiresAt: null });

		const res = await fulfillPhoneOrder('order-1', 'test');

		expect(res.status).toBe('awaiting_sms');
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
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
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
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
			expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) })
		);
	});

	it('rate-limited pvapins variants cannot starve an available hub-man candidate later in the ladder', async () => {
		acquireRateTokenMock.mockResolvedValue(false);
		buildLiveCandidatePoolMock.mockResolvedValue([
			...Array.from({ length: 15 }, (_, i) => pv(`Whatsapp${i}`, 40 + i)),
			candidate({ provider: 'hubman', providerServiceRef: '1', label: 'hubman:1', costCents: 80 })
		]);
		rentMock.mockResolvedValue({ providerRef: 'hub-available', phoneNumber: '15550000009', costCents: 80, expiresAt: null });

		const result = await fulfillPhoneOrder('order-1', 'test');

		expect(result.status).toBe('awaiting_sms');
		expect(rentMock).toHaveBeenCalledOnce();
		expect(rentMock.mock.calls[0][0]).toMatchObject({ providerServiceRef: '1' });
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

	it('hits the 12-attempt cap with untried affordable candidates left → SECURING, no refund, persists tried', async () => {
		// 20 affordable variants; a single pass tries 12 (all OOS). The batch cap must NOT be read as
		// "unavailable" while 8 untried affordable variants remain — keep securing, persist the tried 12.
		prismaMock.phoneRental.findUnique.mockResolvedValue({ reservedLiabilityCents: 0, createdAt: new Date() });
		buildLiveCandidatePoolMock.mockResolvedValue(
			Array.from({ length: 20 }, (_, i) => pv(`Whatsapp${i}`, 40))
		);
		rentMock.mockImplementation(() => {
			throw new Error('oos');
		});

		const res = await fulfillPhoneOrder('order-1', 'test');

		expect(res.status).toBe('awaiting_sms');
		expect(res.message).toMatch(/securing/i);
		expect(creditStoreCreditMock).not.toHaveBeenCalled(); // NOT a refund
		expect(rentMock).toHaveBeenCalledTimes(12); // the batch cap, not "no availability"
		const revert = prismaMock.phoneRental.updateMany.mock.calls.find(
			([arg]) => arg?.data?.status === 'pending' && Array.isArray(arg?.data?.triedSuppliers)
		);
		expect(revert).toBeTruthy();
		expect(revert![0].data.triedSuppliers).toHaveLength(12);
	});

	it('reaches candidate 13 on the NEXT pass (first 12 OOS) — proves passes CONTINUE, never restart', async () => {
		buildLiveCandidatePoolMock.mockResolvedValue(
			Array.from({ length: 15 }, (_, i) => pv(`Whatsapp${i}`, 40))
		);

		// Pass 1: the first 12 (Whatsapp0..11) are out of stock → securing, tried keys persisted.
		prismaMock.phoneRental.findUnique.mockResolvedValue({ reservedLiabilityCents: 0, createdAt: new Date() });
		rentMock.mockImplementation(() => {
			throw new Error('oos');
		});
		const pass1 = await fulfillPhoneOrder('order-1', 'test');
		expect(pass1.status).toBe('awaiting_sms');
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
		const revert = prismaMock.phoneRental.updateMany.mock.calls.find(
			([arg]) => arg?.data?.status === 'pending' && Array.isArray(arg?.data?.triedSuppliers)
		);
		const tried: string[] = revert![0].data.triedSuppliers;
		expect(tried).toContain('pvapins:Whatsapp11');
		expect(tried).not.toContain('pvapins:Whatsapp12');

		// Simulate persistence: the next pass reads those tried keys back from the row.
		prismaMock.phoneRental.findUnique.mockResolvedValue({ reservedLiabilityCents: 0, triedSuppliers: tried });

		// Pass 2: excludes 0..11, so candidate 13 (Whatsapp12) is tried FIRST and succeeds.
		rentMock.mockReset();
		rentMock.mockResolvedValueOnce({ providerRef: 'n|USA|Whatsapp12', phoneNumber: '15550000013', costCents: 40, expiresAt: null });
		const pass2 = await fulfillPhoneOrder('order-1', 'test');

		expect(pass2.status).toBe('awaiting_sms');
		expect(rentMock.mock.calls[0][0]).toMatchObject({ providerServiceRef: 'Whatsapp12' }); // NOT Whatsapp0
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ provider: 'pvapins', providerRef: 'n|USA|Whatsapp12' })
			})
		);
	});

	it('every affordable candidate tried and none in stock → genuinely unavailable → refund', async () => {
		// Small pool, all attempted, all OOS: no untried affordable remain, no rate-limit → refund is
		// correct here (this is the real "out of viable options" case, not a premature batch cut-off).
		buildLiveCandidatePoolMock.mockResolvedValue([pv('Whatsapp0', 40), pv('Whatsapp1', 40)]);
		rentMock.mockImplementation(() => {
			throw new Error('oos');
		});
		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('refunded');
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
	});

	it('a per-tier floor override can only RAISE above the global — a ₦800 tier floor is used', async () => {
		getPhoneTierConfigMock.mockReturnValue({
			serviceId: 1, countryId: 58, serviceName: 'WhatsApp', countryName: 'USA', countryCode: 'US',
			expectedCostCents: 66, availableCount: 5, autoHidden: false, hideReason: null,
			minFulfillmentProfitNgn: 800
		});
		buildLiveCandidatePoolMock.mockResolvedValue([pv('Whatsapp24', 60)]);
		rentMock.mockResolvedValue({ providerRef: 'n|USA|Whatsapp24', phoneNumber: '1555', costCents: 60, expiresAt: null });
		await fulfillPhoneOrder('order-1', 'test');
		expect(maxRentMock).toHaveBeenCalledWith(4800, 800, 1500); // tier floor > global → tier wins
	});

	it('a sub-global tier floor (₦200) is CLAMPED up to the global firewall (₦500)', async () => {
		getPhoneTierConfigMock.mockReturnValue({
			serviceId: 1, countryId: 58, serviceName: 'WhatsApp', countryName: 'USA', countryCode: 'US',
			expectedCostCents: 66, availableCount: 5, autoHidden: false, hideReason: null,
			minFulfillmentProfitNgn: 200
		});
		buildLiveCandidatePoolMock.mockResolvedValue([pv('Whatsapp24', 60)]);
		rentMock.mockResolvedValue({ providerRef: 'n|USA|Whatsapp24', phoneNumber: '1555', costCents: 60, expiresAt: null });
		await fulfillPhoneOrder('order-1', 'test');
		expect(maxRentMock).toHaveBeenCalledWith(4800, 500, 1500); // never below the global floor
	});

	it('serializes duplicate drivers for one rental generation — exactly one upstream rent', async () => {
		const state: Record<string, unknown> = {
			orderItemId: 'item-1',
			status: 'pending',
			generation: 0,
			provider: 'hubman',
			providerRef: null,
			hubOrderUuid: null,
			phoneNumber: null,
			reservedLiabilityCents: 0,
			triedSuppliers: [],
			createdAt: new Date()
		};
		prismaMock.phoneRental.updateMany.mockImplementation(async ({ where, data }) => {
			if (where.orderItemId !== 'item-1' || (where.status && where.status !== state.status)) {
				return { count: 0 };
			}
			if (where.rentLeaseToken && where.rentLeaseToken !== state.rentLeaseToken) return { count: 0 };
			if (data.generation?.increment) state.generation = Number(state.generation) + data.generation.increment;
			Object.assign(state, data, { generation: state.generation });
			return { count: 1 };
		});
		prismaMock.phoneRental.findUnique.mockImplementation(async () => ({ ...state }));
		buildLiveCandidatePoolMock.mockResolvedValue([candidate()]);
		rentMock.mockResolvedValue({ providerRef: 'uuid-one', phoneNumber: '15550000001', costCents: 50, expiresAt: null });

		const [a, b] = await Promise.all([
			fulfillPhoneOrder('order-1', 'poll'),
			fulfillPhoneOrder('order-1', 'cron')
		]);

		expect(rentMock).toHaveBeenCalledTimes(1);
		expect([a.status, b.status]).toEqual(['awaiting_sms', 'awaiting_sms']);
	});

	it('does not globally lock the storefront — two separate buyers rent concurrently', async () => {
		const states = new Map<string, Record<string, unknown>>([
			['item-a', { orderItemId: 'item-a', status: 'pending', generation: 0, provider: 'hubman', providerRef: null, hubOrderUuid: null, reservedLiabilityCents: 0, triedSuppliers: [], createdAt: new Date() }],
			['item-b', { orderItemId: 'item-b', status: 'pending', generation: 0, provider: 'hubman', providerRef: null, hubOrderUuid: null, reservedLiabilityCents: 0, triedSuppliers: [], createdAt: new Date() }]
		]);
		prismaMock.orderItem.findFirst.mockImplementation(async ({ where }) => ({
			id: where.orderId === 'order-a' ? 'item-a' : 'item-b',
			totalPrice: 4800,
			category: { metadata: {} },
			order: { userId: where.orderId === 'order-a' ? 'user-a' : 'user-b', orderNumber: where.orderId, status: 'paid', paymentStatus: 'paid', deliveryStatus: 'processing' }
		}));
		prismaMock.phoneRental.updateMany.mockImplementation(async ({ where, data }) => {
			const state = states.get(where.orderItemId);
			if (!state || (where.status && where.status !== state.status)) return { count: 0 };
			if (where.rentLeaseToken && where.rentLeaseToken !== state.rentLeaseToken) return { count: 0 };
			if (data.generation?.increment) state.generation = Number(state.generation) + data.generation.increment;
			Object.assign(state, data, { generation: state.generation });
			return { count: 1 };
		});
		prismaMock.phoneRental.findUnique.mockImplementation(async ({ where }) => ({ ...states.get(where.orderItemId)! }));
		buildLiveCandidatePoolMock.mockResolvedValue([candidate()]);
		rentMock
			.mockResolvedValueOnce({ providerRef: 'uuid-a', phoneNumber: '15550000001', costCents: 50, expiresAt: null })
			.mockResolvedValueOnce({ providerRef: 'uuid-b', phoneNumber: '15550000002', costCents: 50, expiresAt: null });

		const results = await Promise.all([
			fulfillPhoneOrder('order-a', 'poll'),
			fulfillPhoneOrder('order-b', 'poll')
		]);

		expect(rentMock).toHaveBeenCalledTimes(2);
		expect(results.every((r) => r.status === 'awaiting_sms')).toBe(true);
	});

	it('fences a late rent result after refund and releases only that stale provider reference', async () => {
		const state: Record<string, unknown> = {
			orderItemId: 'item-1', status: 'pending', generation: 0, provider: 'hubman', providerRef: null,
			hubOrderUuid: null, reservedLiabilityCents: 0, triedSuppliers: [], createdAt: new Date()
		};
		prismaMock.phoneRental.updateMany.mockImplementation(async ({ where, data }) => {
			if (where.status && where.status !== state.status) return { count: 0 };
			if (where.rentLeaseToken && where.rentLeaseToken !== state.rentLeaseToken) return { count: 0 };
			if (data.generation?.increment) state.generation = Number(state.generation) + data.generation.increment;
			Object.assign(state, data, { generation: state.generation });
			return { count: 1 };
		});
		prismaMock.phoneRental.findUnique.mockImplementation(async () => ({ ...state }));
		buildLiveCandidatePoolMock.mockResolvedValue([candidate({ provider: 'pvapins', providerServiceRef: 'Whatsapp161' })]);
		let releaseRent!: (value: unknown) => void;
		rentMock.mockImplementation(() => new Promise((resolve) => (releaseRent = resolve)));
		cancelMock.mockResolvedValue(true);

		const running = fulfillPhoneOrder('order-1', 'poll');
		await vi.waitFor(() => expect(rentMock).toHaveBeenCalledOnce());
		state.status = 'refunded';
		state.refundedAt = new Date();
		releaseRent({ providerRef: 'late|USA|Whatsapp161', phoneNumber: '16088011179', costCents: 195, expiresAt: null });
		const result = await running;

		expect(result.status).toBe('refunded');
		expect(cancelMock).toHaveBeenCalledWith('late|USA|Whatsapp161');
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
		expect(state.status).toBe('refunded');
	});

	it('keeps a slow pvapins rent with a live lease in preparing — never false-refunds it', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue({
			orderItemId: 'item-1', status: 'renting', generation: 3, provider: 'pvapins', providerRef: null,
			hubOrderUuid: null, rentLeaseToken: 'live-worker', rentLeaseExpiresAt: new Date(Date.now() + 60_000),
			rentCallStartedAt: new Date(), createdAt: new Date(Date.now() - 20 * 60_000)
		});

		const result = await pollPhoneRentalSms('item-1');

		expect(result.status).toBe('preparing');
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
		expect(rentMock).not.toHaveBeenCalled();
	});
});
