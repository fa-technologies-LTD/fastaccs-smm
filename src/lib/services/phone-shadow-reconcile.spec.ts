import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * reconcilePhoneShadows (P0): abandoned "shadow" pvapins numbers must reach a terminal financial
 * state even after the customer has moved on. A late code = leakage (recorded + alerted); a dead
 * number is cleared. Observational + best-effort — never touches customer fulfillment.
 */

const prismaMock = vi.hoisted(() => ({
	phoneRental: { findMany: vi.fn(), updateMany: vi.fn() }
}));
const pollSmsMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());
const recordOtpMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const alertMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./hubman', () => ({
	getSms: vi.fn(),
	cancelRent: vi.fn(),
	rentActivationNumber: vi.fn(),
	getBalanceCents: vi.fn(),
	isHubmanConfigured: () => true,
	HubmanError: class HubmanError extends Error {}
}));
vi.mock('./store-credit', () => ({ creditStoreCredit: vi.fn(), SC_CREDIT_REFUND: 'X' }));
vi.mock('./phone-telemetry', () => ({
	recordPhoneAttempt: () => Promise.resolve(null),
	recordAttemptOtpReceived: recordOtpMock,
	recordAttemptRejection: () => Promise.resolve(),
	classifyRentFailure: () => ({ outcome: 'error', category: 'provider_error' })
}));
vi.mock('./admin-alerts', () => ({ sendCriticalAdminAlert: alertMock }));
vi.mock('./phone-pricing', () => ({ getPhonePricingConfig: vi.fn(), computeProcurementCeilingCents: () => 100000 }));
vi.mock('./rate-limiter', () => ({
	acquireRateToken: () => Promise.resolve(true),
	pvapinsRateSpec: () => ({ capacity: 5, refillPerSec: 5 / 60 }),
	PVAPINS_GET_NUMBER_BUCKET: 'pvapins:get_number'
}));
vi.mock('./number-providers', () => ({
	getProvider: () => ({ pollSms: pollSmsMock, cancel: cancelMock }),
	providerForRental: vi.fn(),
	refForRental: vi.fn(),
	buildLiveCandidatePool: vi.fn(),
	candidateKeyFromRental: vi.fn()
}));
vi.mock('$lib/helpers/phone-tier-config', () => ({ getPhoneTierConfig: vi.fn() }));

import { reconcilePhoneShadows } from './phone-fulfillment';

const CLEARED = { shadowProviderRef: null, shadowCostCents: null, shadowStaleAt: null };
const shadow = (over: Record<string, unknown> = {}) => ({
	orderItemId: 'oi-1',
	shadowProviderRef: '1555|USA|Whatsapp24',
	shadowCostCents: 66,
	shadowStaleAt: new Date(Date.now() - 5 * 60_000),
	...over
});

beforeEach(() => {
	vi.clearAllMocks();
	prismaMock.phoneRental.updateMany.mockResolvedValue({ count: 1 });
	recordOtpMock.mockResolvedValue(undefined);
	alertMock.mockResolvedValue(undefined);
	cancelMock.mockResolvedValue(true);
});

describe('reconcilePhoneShadows', () => {
	it('LATE CHARGE: records the leakage as COGS, alerts, and clears the shadow', async () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([shadow()]);
		pollSmsMock.mockResolvedValue({ status: 'received', otp: '123456', message: '123456' });
		const r = await reconcilePhoneShadows();
		expect(r).toEqual({ reconciled: 1, leaked: 1 });
		expect(recordOtpMock).toHaveBeenCalledWith('oi-1', '1555|USA|Whatsapp24', null); // auditable COGS
		expect(alertMock).toHaveBeenCalled();
		expect(prismaMock.phoneRental.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: CLEARED })
		);
	});

	it('DEAD/EXPIRED: best-effort reject + clear, no leakage, no alert', async () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([shadow()]);
		pollSmsMock.mockResolvedValue({ status: 'expired' });
		const r = await reconcilePhoneShadows();
		expect(r).toEqual({ reconciled: 1, leaked: 0 });
		expect(cancelMock).toHaveBeenCalledWith('1555|USA|Whatsapp24');
		expect(alertMock).not.toHaveBeenCalled();
	});

	it('STILL WAITING: leaves the shadow for the next pass', async () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([shadow()]);
		pollSmsMock.mockResolvedValue({ status: 'waiting' });
		const r = await reconcilePhoneShadows();
		expect(r).toEqual({ reconciled: 0, leaked: 0 });
		expect(prismaMock.phoneRental.updateMany).not.toHaveBeenCalled();
	});

	it('TOO OLD: a long-waiting shadow is treated as dead and cleared (bounded)', async () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([shadow({ shadowStaleAt: new Date(Date.now() - 60 * 60_000) })]);
		pollSmsMock.mockResolvedValue({ status: 'waiting' });
		const r = await reconcilePhoneShadows();
		expect(r.reconciled).toBe(1);
		expect(cancelMock).toHaveBeenCalled();
	});

	it('best-effort: a poll failure never throws', async () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([shadow()]);
		pollSmsMock.mockRejectedValue(new Error('boom'));
		await expect(reconcilePhoneShadows()).resolves.toEqual({ reconciled: 0, leaked: 0 });
	});
});
