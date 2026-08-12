import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	phoneAttempt: { create: vi.fn(), updateMany: vi.fn() }
}));
vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));

import {
	recordPhoneAttempt,
	recordAttemptOtpReceived,
	recordAttemptRejection,
	classifyRentFailure
} from './phone-telemetry';

beforeEach(() => vi.clearAllMocks());

describe('classifyRentFailure — inventory vs operational', () => {
	it('maps out-of-stock to an OOS inventory signal', () => {
		expect(classifyRentFailure('Out of stock. Please try again shortly.')).toEqual({
			outcome: 'oos',
			category: 'out_of_stock'
		});
	});
	it('maps a rate-limit message to rate_limited (not OOS)', () => {
		expect(classifyRentFailure('429 too many requests').outcome).toBe('rate_limited');
	});
	it('maps a bad mapping and a timeout to operational errors (not stock)', () => {
		expect(classifyRentFailure('App Not Found.').category).toBe('invalid_mapping');
		expect(classifyRentFailure('socket timeout').category).toBe('provider_timeout');
	});
	it('falls back to a generic provider error', () => {
		expect(classifyRentFailure('weird upstream boom')).toEqual({
			outcome: 'error',
			category: 'provider_error'
		});
	});
});

describe('telemetry writes are best-effort — never throw', () => {
	it('recordPhoneAttempt returns the id on success', async () => {
		prismaMock.phoneAttempt.create.mockResolvedValue({ id: 'att-1' });
		const id = await recordPhoneAttempt({
			orderItemId: 'oi-1',
			attemptNumber: 1,
			provider: 'pvapins',
			providerServiceRef: 'Whatsapp24',
			outcome: 'rented'
		});
		expect(id).toBe('att-1');
	});

	it('recordPhoneAttempt swallows a DB error and returns null (money path unaffected)', async () => {
		prismaMock.phoneAttempt.create.mockRejectedValue(new Error('db down'));
		const id = await recordPhoneAttempt({
			orderItemId: 'oi-1',
			attemptNumber: 1,
			provider: 'pvapins',
			providerServiceRef: 'Whatsapp24',
			outcome: 'oos'
		});
		expect(id).toBeNull();
	});

	it('recordAttemptOtpReceived is a no-op without a providerRef and swallows errors', async () => {
		await expect(recordAttemptOtpReceived('oi-1', null, 43)).resolves.toBeUndefined();
		expect(prismaMock.phoneAttempt.updateMany).not.toHaveBeenCalled();
		prismaMock.phoneAttempt.updateMany.mockRejectedValue(new Error('db down'));
		await expect(recordAttemptOtpReceived('oi-1', 'ref-1', 43)).resolves.toBeUndefined();
	});

	it('recordAttemptRejection is a no-op without a providerRef and swallows errors', async () => {
		await expect(recordAttemptRejection('oi-1', undefined, true)).resolves.toBeUndefined();
		expect(prismaMock.phoneAttempt.updateMany).not.toHaveBeenCalled();
		prismaMock.phoneAttempt.updateMany.mockRejectedValue(new Error('db down'));
		await expect(recordAttemptRejection('oi-1', 'ref-1', false)).resolves.toBeUndefined();
	});
});
