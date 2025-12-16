import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return {
				affiliates: [],
				stats: {
					totalAffiliates: 0,
					activeAffiliates: 0,
					totalCommissions: 0,
					totalReferrals: 0
				}
			};
		}

		// Get all users with affiliate mode enabled
		const affiliates = await prisma.user.findMany({
			where: {
				isAffiliateEnabled: true
			},
			include: {
				affiliatePrograms: true
			},
			orderBy: {
				createdAt: 'desc'
			}
		});

		// Calculate stats
		const activeAffiliates = affiliates.filter((a) => a.isAffiliateEnabled).length;

		const totalCommissions = affiliates.reduce(
			(sum, affiliate) => sum + Number(affiliate.affiliatePrograms[0]?.totalCommission || 0),
			0
		);

		const totalReferrals = affiliates.reduce(
			(sum, affiliate) => sum + (affiliate.affiliatePrograms[0]?.totalReferrals || 0),
			0
		);

		// Serialize all data - convert Decimal types and ensure plain objects
		const serializedAffiliates = JSON.parse(
			JSON.stringify(affiliates, (key, value) => {
				if (typeof value === 'bigint') {
					return value.toString();
				}
				if (
					value &&
					typeof value === 'object' &&
					value.constructor &&
					value.constructor.name === 'Decimal'
				) {
					return Number(value);
				}
				return value;
			})
		);

		return {
			affiliates: serializedAffiliates,
			stats: {
				totalAffiliates: affiliates.length,
				activeAffiliates,
				totalCommissions,
				totalReferrals
			}
		};
	} catch (error) {
		console.error('Error loading affiliate data:', error);
		return {
			affiliates: [],
			stats: {
				totalAffiliates: 0,
				activeAffiliates: 0,
				totalCommissions: 0,
				totalReferrals: 0
			}
		};
	}
};
