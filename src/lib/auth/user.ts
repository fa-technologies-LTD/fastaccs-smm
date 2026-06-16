// User management service
import { prisma } from '$lib/prisma';
import { getUserTypeFromEmail } from './admin';
import type { User } from '@prisma/client';

export interface GoogleUserData {
	sub: string; // Google ID
	email: string;
	name: string;
	picture?: string;
}

// Get user by Google ID
export async function getUserFromGoogleId(googleId: string): Promise<User | null> {
	return await prisma.user.findUnique({
		where: { googleId }
	});
}

// Get user by email
export async function getUserFromEmail(email: string): Promise<User | null> {
	return await prisma.user.findUnique({
		where: { email }
	});
}

// Create new user from Google OAuth data
export async function createUserFromGoogle(googleUser: GoogleUserData): Promise<User> {
	const userType = getUserTypeFromEmail(googleUser.email);
	// Google already verified the email; trust it
	const now = new Date();

	return await prisma.user.create({
		data: {
			googleId: googleUser.sub,
			email: googleUser.email,
			fullName: googleUser.name,
			avatarUrl: googleUser.picture,
			userType,
			emailVerified: true,
			emailVerifiedAt: now,
			registeredAt: now,
			lastLogin: now,
			lastSeenAt: now
		}
	});
}

// Update user's last login
export async function updateUserLastLogin(userId: string): Promise<void> {
	await prisma.user.update({
		where: { id: userId },
		data: { lastLogin: new Date(), lastSeenAt: new Date() }
	});
}

// Update user from Google data (in case profile changes)
export async function updateUserFromGoogle(
	userId: string,
	googleUser: GoogleUserData
): Promise<User> {
	const userType = getUserTypeFromEmail(googleUser.email);

	return await prisma.user.update({
		where: { id: userId },
		data: {
			fullName: googleUser.name,
			avatarUrl: googleUser.picture,
			...(userType === 'ADMIN' ? { userType } : {}),
			lastLogin: new Date(),
			lastSeenAt: new Date()
		}
	});
}
