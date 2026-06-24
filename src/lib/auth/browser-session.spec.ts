import { describe, expect, it } from 'vitest';
import type { Session, User } from '@prisma/client';
import { ORDER_CUSTOMER_USER_SELECT, toBrowserSession, toBrowserUser } from './browser-session';

function buildUser(overrides: Partial<User> = {}): User {
	const now = new Date();
	return {
		id: 'user-1',
		email: 'buyer@example.com',
		googleId: 'google-private-id',
		passwordHash: 'private-password-hash',
		fullName: 'Fast Buyer',
		avatarUrl: null,
		phone: '+2348000000000',
		guestSessionId: 'private-guest-session',
		dailyPurchaseLimit: 100,
		totalPurchaseLimit: 1000,
		restrictedCategories: ['private-category'],
		isActive: true,
		emailVerified: true,
		emailVerifiedAt: now,
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
		bankDetailsPopupSeenAt: null,
		...overrides
	};
}

describe('browser-safe auth serialization', () => {
	it('only exposes the storefront fields required by the signed-in user experience', () => {
		const browserUser = toBrowserUser(buildUser());

		expect(browserUser).toEqual({
			id: 'user-1',
			email: 'buyer@example.com',
			fullName: 'Fast Buyer',
			avatarUrl: null,
			phone: '+2348000000000',
			userType: 'REGISTERED',
			isActive: true,
			emailVerified: true,
			isAffiliateEnabled: false
		});
		expect(browserUser).not.toHaveProperty('passwordHash');
		expect(browserUser).not.toHaveProperty('googleId');
		expect(browserUser).not.toHaveProperty('guestSessionId');
		expect(browserUser).not.toHaveProperty('dailyPurchaseLimit');
		expect(browserUser).not.toHaveProperty('restrictedCategories');
	});

	it('never exposes the stored session identifier or user identifier', () => {
		const now = new Date();
		const session: Session = {
			id: 'private-session-hash',
			userId: 'user-1',
			expiresAt: now,
			createdAt: now,
			lastRefreshedAt: now
		};

		expect(toBrowserSession(session)).toEqual({ expiresAt: now });
		expect(toBrowserSession(session)).not.toHaveProperty('id');
		expect(toBrowserSession(session)).not.toHaveProperty('userId');
	});

	it('keeps order customer joins limited to their display identity', () => {
		expect(ORDER_CUSTOMER_USER_SELECT).toEqual({
			id: true,
			email: true,
			fullName: true
		});
		expect(ORDER_CUSTOMER_USER_SELECT).not.toHaveProperty('passwordHash');
	});
});
