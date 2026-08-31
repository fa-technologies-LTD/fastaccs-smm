import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { enableAffiliateMode } from '$lib/services/affiliate';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { createAdminAuditLog } from '$lib/services/admin-audit';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:affiliates:manage')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const actorUserId = locals.user.id;

	const { userId } = params;

	if (!userId) {
		return json({ success: false, error: 'User ID is required' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const { isAffiliateEnabled } = body;
		const affiliateType = String(body?.affiliateType || 'regular')
			.trim()
			.toLowerCase();

		if (typeof isAffiliateEnabled !== 'boolean') {
			return json(
				{ success: false, error: 'isAffiliateEnabled must be a boolean' },
				{ status: 400 }
			);
		}
		if (!['regular', 'super'].includes(affiliateType)) {
			return json(
				{ success: false, error: 'affiliateType must be regular or super' },
				{ status: 400 }
			);
		}

		const before = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true }
		});
		if (!before) {
			return json({ success: false, error: 'User not found.' }, { status: 404 });
		}

		if (isAffiliateEnabled) {
			const enabled = await enableAffiliateMode(userId, {
				force: true,
				affiliateType: affiliateType as 'regular' | 'super',
				adminActorUserId: actorUserId
			});
			if (!enabled.success) {
				return json(
					{ success: false, error: enabled.error || 'Failed to enable affiliate user.' },
					{ status: 400 }
				);
			}
		} else {
			await prisma.$transaction(async (tx) => {
				await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
				const [liveUser, liveProgram] = await Promise.all([
					tx.user.findUnique({
						where: { id: userId },
						select: { id: true, isAffiliateEnabled: true }
					}),
					tx.affiliateProgram.findUnique({
						where: { userId },
						select: { id: true, status: true, isSuperAffiliate: true }
					})
				]);
				if (!liveUser) throw new Error('User disappeared while disabling affiliate access.');
				if (!liveUser.isAffiliateEnabled && (!liveProgram || liveProgram.status === 'inactive')) {
					return;
				}
				await tx.affiliateProgram.updateMany({
					where: { userId },
					data: { status: 'inactive' }
				});

				await tx.user.update({
					where: { id: userId },
					data: { isAffiliateEnabled: false }
				});
				await createAdminAuditLog(
					{
						actorUserId,
						targetUserId: userId,
						action: 'affiliate_access_disabled',
						resourceType: 'affiliate_program',
						resourceId: liveProgram?.id || undefined,
						description: 'Affiliate access disabled',
						metadata: {
							beforeEnabled: liveUser.isAffiliateEnabled,
							beforeStatus: liveProgram?.status || null,
							beforeType: liveProgram?.isSuperAffiliate ? 'super' : 'regular',
							afterEnabled: false,
							afterStatus: 'inactive',
							afterType: liveProgram?.isSuperAffiliate ? 'super' : 'regular'
						},
						required: true
					},
					tx
				);
			});
		}

		const updatedUser = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				email: true,
				fullName: true,
				isAffiliateEnabled: true,
				affiliatePrograms: {
					select: { status: true, isSuperAffiliate: true },
					take: 1
				}
			}
		});

		if (!updatedUser) {
			return json({ success: false, error: 'User not found after update.' }, { status: 404 });
		}

		const afterProgram = updatedUser.affiliatePrograms[0] || null;
		return json({
			success: true,
			user: {
				id: updatedUser.id,
				email: updatedUser.email,
				fullName: updatedUser.fullName,
				isAffiliateEnabled: updatedUser.isAffiliateEnabled,
				affiliateType: afterProgram?.isSuperAffiliate ? 'super' : 'regular',
				programStatus: afterProgram?.status || null
			}
		});
	} catch (error) {
		console.error('Error toggling affiliate status:', error);
		return json({ success: false, error: 'Failed to update affiliate status' }, { status: 500 });
	}
};
