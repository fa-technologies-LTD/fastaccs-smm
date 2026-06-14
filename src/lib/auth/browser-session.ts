import type { Prisma, Session, User, UserType } from '@prisma/client';

export interface BrowserUser {
	id: string;
	email: string | null;
	fullName: string | null;
	avatarUrl: string | null;
	phone: string | null;
	userType: UserType;
	isActive: boolean;
	emailVerified: boolean;
	isAffiliateEnabled: boolean;
}

export interface BrowserSession {
	expiresAt: Date;
}

export const ORDER_CUSTOMER_USER_SELECT = {
	id: true,
	email: true,
	fullName: true
} satisfies Prisma.UserSelect;

export function toBrowserUser(user: User): BrowserUser;
export function toBrowserUser(user: null | undefined): null;
export function toBrowserUser(user: User | null | undefined): BrowserUser | null;
export function toBrowserUser(user: User | null | undefined): BrowserUser | null {
	if (!user) return null;

	return {
		id: user.id,
		email: user.email,
		fullName: user.fullName,
		avatarUrl: user.avatarUrl,
		phone: user.phone,
		userType: user.userType,
		isActive: user.isActive,
		emailVerified: user.emailVerified,
		isAffiliateEnabled: user.isAffiliateEnabled
	};
}

export function toBrowserSession(session: Session): BrowserSession;
export function toBrowserSession(session: null | undefined): null;
export function toBrowserSession(session: Session | null | undefined): BrowserSession | null;
export function toBrowserSession(session: Session | null | undefined): BrowserSession | null {
	if (!session) return null;

	return {
		expiresAt: session.expiresAt
	};
}
