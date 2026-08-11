import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolated file: getSms that throws + vitest's unhandled-rejection tracker interact badly when
// mixed with non-throwing tests. Covers cancelAndRefundRental's two throw branches.

const prismaMock = vi.hoisted(() => ({
	phoneRental: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
	orderItem: { findUnique: vi.fn(), findFirst: vi.fn() },
	order: { update: vi.fn() },
	$transaction: vi.fn()
}));
const getSmsMock = vi.hoisted(() => vi.fn());
const cancelRentMock = vi.hoisted(() => vi.fn());
const creditStoreCreditMock = vi.hoisted(() => vi.fn());
const getPhoneTierConfigMock = vi.hoisted(() => vi.fn());
const { HubmanError } = vi.hoisted(() => {
	class HubmanError extends Error {
		status: number;
		constructor(message: string, status: number) {
			super(message);
			this.name = 'HubmanError';
			this.status = status;
		}
	}
	return { HubmanError };
});

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./hubman', () => ({
	getSms: getSmsMock,
	cancelRent: cancelRentMock,
	rentActivationNumber: vi.fn(),
	getBalanceCents: vi.fn(),
	isHubmanConfigured: () => true,
	HubmanError
}));
vi.mock('./store-credit', () => ({ creditStoreCredit: creditStoreCreditMock, SC_CREDIT_REFUND: 'X' }));
vi.mock('./admin-alerts', () => ({ sendCriticalAdminAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./phone-pricing', () => ({ getPhonePricingConfig: vi.fn(), computeMaxPriceCentsForSale: vi.fn(), computeProcurementCeilingCents: () => 100000 }));
vi.mock('$lib/helpers/phone-tier-config', () => ({ getPhoneTierConfig: getPhoneTierConfigMock }));

import { cancelAndRefundRental } from './phone-fulfillment';

beforeEach(() => {
	vi.clearAllMocks();
	prismaMock.phoneRental.findUnique.mockResolvedValue({
		orderItemId: 'item-1',
		status: 'awaiting_sms',
		hubOrderUuid: 'hub-uuid-1',
		rentedAt: new Date(Date.now() - 5 * 60_000),
		createdAt: new Date(Date.now() - 6 * 60_000)
	});
	prismaMock.orderItem.findUnique.mockResolvedValue({ orderId: 'order-1' });
	prismaMock.orderItem.findFirst.mockResolvedValue({
		id: 'item-1',
		totalPrice: 1200,
		category: { metadata: {} },
		order: { userId: 'user-1', orderNumber: 'ORD-1' }
	});
	getPhoneTierConfigMock.mockReturnValue({ serviceId: 1, countryId: 2, serviceName: 'WA', countryName: 'US' });
	prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
		cb({
			phoneRental: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			order: { update: vi.fn().mockResolvedValue({}) }
		})
	);
});

describe('cancelAndRefundRental — throw branches', () => {
	it('a transient getSms failure yields pending and does NOT refund (never refund blind)', async () => {
		getSmsMock.mockImplementation(async () => {
			throw new Error('network');
		});
		let outcome: string;
		try {
			outcome = await cancelAndRefundRental('item-1', 'test');
		} catch (e) {
			outcome = `threw:${String(e)}`;
		}
		expect(outcome).toBe('pending');
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
		expect(cancelRentMock).not.toHaveBeenCalled();
	});

	it('a hub-man 422 (activation expired) is treated as no-code → cancel + refund', async () => {
		getSmsMock.mockImplementation(async () => {
			throw new HubmanError('expired', 422);
		});
		cancelRentMock.mockResolvedValue(true);
		let outcome: string;
		try {
			outcome = await cancelAndRefundRental('item-1', 'expired');
		} catch (e) {
			outcome = `threw:${String(e)}`;
		}
		expect(outcome).toBe('refunded');
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
	});
});
