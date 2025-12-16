import {prisma }from '$lib/prisma';
// import type { User, AffiliateProgram } from '@prisma/client';

/**
 * Extract initials from a full name
 * Examples: "John Doe" -> "JD", "Alice" -> "A", "Mary Jane Watson" -> "MJW"
 */
export function extractInitials(fullName: string): string {
	if (!fullName || fullName.trim() === '') {
		return 'U'; // Default for users without names
	}

	const words = fullName.trim().toUpperCase().split(/\s+/);
	const initials = words.map((word) => word[0]).join('');

	return initials || 'U';
}

/**
 * Get the next running number for a given initial prefix
 * Returns the next available number (e.g., if JD001, JD002 exist, returns 3)
 */
export async function getNextRunningNumber(initials: string): Promise<number> {
	// Find all affiliate codes that start with these initials
	const existingCodes = await prisma.affiliateProgram.findMany({
		where: {
			affiliateCode: {
				startsWith: initials
			}
		},
		select: {
			affiliateCode: true
		}
	});

	if (existingCodes.length === 0) {
		return 1;
	}

	// Extract numbers from existing codes and find the max
	const numbers = existingCodes
		.map((record) => {
			const match = record.affiliateCode.match(new RegExp(`^${initials}(\\d+)$`));
			return match ? parseInt(match[1], 10) : 0;
		})
		.filter((num) => num > 0);

	const maxNumber = Math.max(...numbers, 0);
	return maxNumber + 1;
}

/**
 * Generate a unique affiliate code using initials + running number
 * Format: INITIALS + 3-digit number (e.g., "JD001", "A042", "MJW123")
 */
export async function generateAffiliateCode(userId: string): Promise<string> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { fullName: true }
	});

	if (!user) {
		throw new Error('User not found');
	}

	const initials = extractInitials(user.fullName || '');
	const runningNumber = await getNextRunningNumber(initials);

	// Format number with leading zeros (001, 002, etc.)
	const formattedNumber = runningNumber.toString().padStart(3, '0');
	const affiliateCode = `${initials}${formattedNumber}`;

	// Verify uniqueness (edge case protection)
	const existing = await prisma.affiliateProgram.findUnique({
		where: { affiliateCode }
	});

	if (existing) {
		// If somehow collision happened, recursively try the next number
		return generateAffiliateCode(userId);
	}

	return affiliateCode;
}

/**
 * Enable affiliate mode for a user
 * Creates AffiliateProgram record and updates user's isAffiliateEnabled flag
 */
export async function enableAffiliateMode(
	userId: string
): Promise<{ success: boolean; affiliateCode?: string; error?: string }> {
	try {
		// Check if user already has affiliate mode enabled
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: {
				affiliatePrograms: true
			}
		});

		if (!user) {
			return { success: false, error: 'User not found' };
		}

		if (user.isAffiliateEnabled && user.affiliatePrograms.length > 0) {
			return { success: false, error: 'Affiliate mode already enabled' };
		}

		// Generate unique code
		const affiliateCode = await generateAffiliateCode(userId);

		// Create affiliate program and update user in a transaction
		await prisma.$transaction([
			prisma.affiliateProgram.create({
				data: {
					userId,
					affiliateCode,
					commissionRate: 10.0, // Default 10% commission
					status: 'active'
				}
			}),
			prisma.user.update({
				where: { id: userId },
				data: { isAffiliateEnabled: true }
			})
		]);

		return { success: true, affiliateCode };
	} catch (error) {
		console.error('Error enabling affiliate mode:', error);
		return { success: false, error: 'Failed to enable affiliate mode' };
	}
}

/**
 * Get affiliate stats for a user
 */
export async function getAffiliateStats(userId: string): Promise<{
	success: boolean;
	data?: {
		affiliateCode: string;
		commissionRate: number;
		totalReferrals: number;
		totalSales: number;
		totalCommission: number;
		status: string;
	};
	error?: string;
}> {
	try {
		const affiliateProgram = await prisma.affiliateProgram.findFirst({
			where: { userId }
		});

		if (!affiliateProgram) {
			return { success: false, error: 'No affiliate program found' };
		}

		return {
			success: true,
			data: {
				affiliateCode: affiliateProgram.affiliateCode,
				commissionRate: Number(affiliateProgram.commissionRate),
				totalReferrals: affiliateProgram.totalReferrals,
				totalSales: Number(affiliateProgram.totalSales),
				totalCommission: Number(affiliateProgram.totalCommission),
				status: affiliateProgram.status
			}
		};
	} catch (error) {
		console.error('Error fetching affiliate stats:', error);
		return { success: false, error: 'Failed to fetch affiliate stats' };
	}
}

/**
 * Validate an affiliate code and return the affiliate user's info
 */
export async function validateAffiliateCode(code: string): Promise<{
	valid: boolean;
	userId?: string;
	affiliateProgramId?: string;
	commissionRate?: number;
}> {
	try {
		const affiliateProgram = await prisma.affiliateProgram.findUnique({
			where: {
				affiliateCode: code.toUpperCase(),
				status: 'active'
			},
			select: {
				id: true,
				userId: true,
				commissionRate: true
			}
		});

		if (!affiliateProgram) {
			return { valid: false };
		}

		return {
			valid: true,
			userId: affiliateProgram.userId,
			affiliateProgramId: affiliateProgram.id,
			commissionRate: Number(affiliateProgram.commissionRate)
		};
	} catch (error) {
		console.error('Error validating affiliate code:', error);
		return { valid: false };
	}
}

/**
 * Record commission when an order is completed with an affiliate code
 */
export async function recordCommission(
	orderId: string,
	affiliateCode: string,
	orderTotal: number
): Promise<{ success: boolean; commission?: number; error?: string }> {
	try {
		// Get affiliate program
		const affiliateProgram = await prisma.affiliateProgram.findUnique({
			where: { affiliateCode }
		});

		if (!affiliateProgram) {
			return { success: false, error: 'Affiliate program not found' };
		}

		// Calculate commission
		const commissionRate = Number(affiliateProgram.commissionRate);
		const commission = (orderTotal * commissionRate) / 100;

		// Update affiliate program stats
		await prisma.affiliateProgram.update({
			where: { id: affiliateProgram.id },
			data: {
				totalReferrals: { increment: 1 },
				totalSales: { increment: orderTotal },
				totalCommission: { increment: commission }
			}
		});

		return { success: true, commission };
	} catch (error) {
		console.error('Error recording commission:', error);
		return { success: false, error: 'Failed to record commission' };
	}
}
