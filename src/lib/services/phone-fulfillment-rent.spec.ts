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
	computeMaxPriceCentsForSale: maxPriceMock
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

	it('filters out over-ceiling candidates (protects the profit floor) and refunds if none remain', async () => {
		maxPriceMock.mockReturnValue(100); // ceiling 100 cents
		buildLiveCandidatePoolMock.mockResolvedValue([candidate({ costCents: 9999 })]); // too expensive
		const res = await fulfillPhoneOrder('order-1', 'test');
		expect(res.status).toBe('refunded');
		expect(rentMock).not.toHaveBeenCalled(); // never even attempted — over ceiling
	});
});
