import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findCode: vi.fn(),
	deleteCodes: vi.fn(),
	updateUser: vi.fn(),
	transaction: vi.fn(),
	logEmailNotification: vi.fn(),
	sendWelcomeEmailIfNeeded: vi.fn(),
	invalidateUserSessionCache: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		verificationCode: {
			findUnique: mocks.findCode,
			deleteMany: mocks.deleteCodes,
			count: vi.fn(),
			update: vi.fn(),
			upsert: vi.fn()
		},
		emailNotification: {
			count: vi.fn()
		},
		user: {
			update: mocks.updateUser
		},
		$transaction: mocks.transaction
	}
}));

vi.mock('./email', () => ({
	generateVerificationCode: vi.fn(),
	logEmailNotification: mocks.logEmailNotification,
	maskEmailAddress: vi.fn(),
	sendEmail: vi.fn(),
	sendWelcomeEmailIfNeeded: mocks.sendWelcomeEmailIfNeeded
}));

vi.mock('$lib/auth/session', () => ({
	invalidateUserSessionCache: mocks.invalidateUserSessionCache
}));

import { verifyEmailCode } from './email-verification';

describe('email verification session refresh', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findCode.mockResolvedValue({
			code: '123456',
			attempts: 0,
			expiresAt: new Date(Date.now() + 60_000)
		});
		mocks.updateUser.mockResolvedValue({});
		mocks.deleteCodes.mockResolvedValue({});
		mocks.transaction.mockResolvedValue([]);
		mocks.logEmailNotification.mockResolvedValue({});
		mocks.sendWelcomeEmailIfNeeded.mockResolvedValue({});
	});

	it('invalidates cached user state immediately after a successful verification write', async () => {
		const result = await verifyEmailCode(
			{
				id: 'buyer-1',
				email: 'buyer@example.com',
				emailVerified: false,
				fullName: 'Buyer'
			},
			'123456'
		);

		expect(result).toEqual({ success: true });
		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.invalidateUserSessionCache).toHaveBeenCalledWith('buyer-1');
	});
});
