import { describe, expect, it, vi } from 'vitest';
const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
vi.mock('$lib/prisma', () => ({ prisma: { order: { updateMany } } }));
import {
	holdUncertainInitialization,
	isDefinitiveInitializationFailure
} from './payment-initialization-recovery';

describe('ambiguous initialization', () => {
	it('fails closed to uncertainty unless rejection is explicit', () => {
		expect(isDefinitiveInitializationFailure({ errorCode: 'provider_initialization_failed' })).toBe(
			false
		);
		expect(isDefinitiveInitializationFailure({ failureCertainty: 'unknown' })).toBe(false);
		expect(isDefinitiveInitializationFailure({ errorCode: 'invalid_amount' })).toBe(true);
		expect(isDefinitiveInitializationFailure({ failureCertainty: 'rejected' })).toBe(true);
	});
	it('retains the reference and credit reservation without overwriting terminal states', async () => {
		await holdUncertainInitialization('order', 'reference');
		expect(updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					paymentReference: 'reference',
					status: { in: ['pending', 'pending_payment'] }
				}),
				data: {
					status: 'pending_payment',
					paymentStatus: 'processing',
					cancellationReason: 'initialization_unknown'
				}
			})
		);
	});
});
