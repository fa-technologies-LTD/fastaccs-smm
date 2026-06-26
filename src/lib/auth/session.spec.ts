import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, User } from '@prisma/client';

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	findUser: vi.fn(),
	deleteMany: vi.fn(),
	deleteSession: vi.fn(),
	updateSession: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		user: {
			findUnique: mocks.findUser
		},
		session: {
			findUnique: mocks.findUnique,
			deleteMany: mocks.deleteMany,
			delete: mocks.deleteSession,
			update: mocks.updateSession
		}
	}
}));

import { invalidateUserSessionCache, validateSessionToken } from './session';

function buildUser(emailVerified: boolean): User {
	const now = new Date();
	return {
		id: 'cache-user',
		email: 'buyer@example.com',
		googleId: null,
		passwordHash: 'private-hash',
		fullName: 'Buyer',
		avatarUrl: null,
		phone: null,
		guestSessionId: null,
		dailyPurchaseLimit: 100,
		totalPurchaseLimit: 1000,
		restrictedCategories: [],
		isActive: true,
		emailVerified,
		emailVerifiedAt: emailVerified ? now : null,
		registeredAt: now,
		lastLogin: now,
		lastSeenAt: now,
		createdAt: now,
		updatedAt: now,
		userType: 'REGISTERED',
		preferredDeliveryMethod: 'EMAIL',
		isAffiliateEnabled: false,
		marketingEmailEnabled: true,
		marketingUnsubscribedAt: null,
		marketingSuppressedAt: null,
		marketingSuppressReason: null,
		marketingPreferenceToken: 'marketing-preference-token',
		affiliateWelcomePopupSeenAt: null,
		affiliateProgress50PopupSeenAt: null,
		affiliateProgress80PopupSeenAt: null,
		affiliateProgress95PopupSeenAt: null,
		affiliateUnlockedPopupSeenAt: null,
		firstPurchasePopupSeenAt: null,
		catalogUpdatesLastSeenAt: null,
		boostingLaunchPopupSeenAt: null,
		bankDetailsPopupSeenAt: null
	};
}

function buildSession(): Session {
	const now = new Date();
	return {
		id: 'stored-session-hash',
		userId: 'cache-user',
		expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		createdAt: now,
		lastRefreshedAt: now
	};
}

describe('session cache invalidation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		invalidateUserSessionCache('cache-user');
	});

	it('reloads user state on a cached session so verification is authoritative across instances', async () => {
		const session = buildSession();
		mocks.findUnique.mockResolvedValueOnce({ ...session, user: buildUser(false) });
		mocks.findUser.mockResolvedValueOnce(buildUser(true));

		const first = await validateSessionToken('verification-cache-token');
		const refreshed = await validateSessionToken('verification-cache-token');
		expect(first.user?.emailVerified).toBe(false);
		expect(refreshed.user?.emailVerified).toBe(true);
		expect(mocks.findUnique).toHaveBeenCalledTimes(1);
		expect(mocks.findUser).toHaveBeenCalledWith({ where: { id: 'cache-user' } });
	});
});
