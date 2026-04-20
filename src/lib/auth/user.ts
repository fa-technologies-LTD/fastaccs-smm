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

	return await prisma.user.create({
		data: {
			googleId: googleUser.sub,
			email: googleUser.email,
			fullName: googleUser.name,
			avatarUrl: googleUser.picture,
			userType,
			emailVerified: false,
			emailVerifiedAt: null,
			registeredAt: new Date(),
			lastLogin: new Date()
		}
	});
}

// Update user's last login
export async function updateUserLastLogin(userId: string): Promise<void> {
	await prisma.user.update({
		where: { id: userId },
		data: { lastLogin: new Date() }
	});
}

// Update user from Google data (in case profile changes)
export async function updateUserFromGoogle(
	userId: string,
	googleUser: GoogleUserData
): Promise<User> {
	return await prisma.user.update({
		where: { id: userId },
		data: {
			fullName: googleUser.name,
			avatarUrl: googleUser.picture,
			lastLogin: new Date()
		}
	});
}
