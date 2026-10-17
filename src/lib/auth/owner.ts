import { isAdminEmail } from '$lib/auth/admin';
import type { AdminContext } from '$lib/auth/admin-roles';

/**
 * "Owner-only" controls (campaign switches, promo caps, one-off grants). There is no separate owner
 * role, so the owner is a FULL_ADMIN whose email is on the ADMIN_EMAILS allow-list.
 */
export function isOwnerAdmin(
	user: { email?: string | null } | null | undefined,
	adminContext: Pick<AdminContext, 'role'> | null | undefined
): boolean {
	return Boolean(user?.email && adminContext?.role === 'FULL_ADMIN' && isAdminEmail(user.email));
}
