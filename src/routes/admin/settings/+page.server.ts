import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import {
	getAdminSettingsSnapshot,
	getSmtpHealthSnapshot,
	saveBusinessSettings,
	saveNotificationSettings,
	savePaymentSettings,
	saveStoreControlSettings
} from '$lib/services/admin-settings';
import {
	getAnnouncementBannerConfig,
	getAnnouncementBannerFormState,
	saveAnnouncementBannerConfig
} from '$lib/services/announcement-banner';
import { env } from '$env/dynamic/private';
import { getFeatureFlagSnapshot, saveFeatureFlags } from '$lib/services/feature-flags';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { invalidateSession } from '$lib/auth/session';
import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';

function maskSecret(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return 'Not set';
	if (trimmed.length <= 6) return '*'.repeat(trimmed.length);
	return `${trimmed.slice(0, 3)}${'*'.repeat(Math.max(4, trimmed.length - 6))}${trimmed.slice(-3)}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const [settings, featureFlags, admins, sessions, announcementBannerConfig] = await Promise.all([
		getAdminSettingsSnapshot(),
		getFeatureFlagSnapshot(),
		prisma.user.findMany({
			where: { userType: 'ADMIN' },
			select: {
				id: true,
				email: true,
				fullName: true,
				adminRoleAssignment: {
					select: {
						role: true
					}
				}
			},
			orderBy: { createdAt: 'asc' }
		}),
		prisma.session.findMany({
			select: {
				id: true,
				userId: true,
				createdAt: true,
				lastRefreshedAt: true,
				expiresAt: true,
				user: {
					select: {
						email: true,
						fullName: true,
						userType: true,
						isActive: true
					}
				}
			},
			orderBy: { createdAt: 'desc' },
			take: 40
		}),
		getAnnouncementBannerConfig()
	]);
	const canManageSettings = Boolean(
		locals.adminContext && hasAdminPermission(locals.adminContext, 'admin:settings:manage')
	);
	const canManageRoles = Boolean(
		locals.adminContext &&
			featureFlags.adminRoleManagement &&
			hasAdminPermission(locals.adminContext, 'admin:users:manage')
	);

	return {
		settings,
		announcementBanner: getAnnouncementBannerFormState(
			announcementBannerConfig,
			settings.business.businessTimezone || 'Africa/Lagos'
		),
		featureFlags,
		smtpHealth: getSmtpHealthSnapshot(),
		sessions: sessions.map((session) => ({
			id: session.id,
			userId: session.userId,
			createdAt: session.createdAt,
			lastRefreshedAt: session.lastRefreshedAt,
			expiresAt: session.expiresAt,
			user: {
				email: session.user.email,
				fullName: session.user.fullName,
				userType: session.user.userType,
				isActive: session.user.isActive
			}
		})),
			admins: admins.map((admin) => ({
				id: admin.id,
				email: admin.email,
				fullName: admin.fullName,
				role: admin.adminRoleAssignment?.role || 'UNASSIGNED'
			})),
		canManageSettings,
		canManageRoles,
		envConfig: {
			monnifyBaseUrl: (env.MONNIFY_BASE_URL || '').trim() || 'https://api.monnify.com',
			nodeEnv: (env.NODE_ENV || '').trim() || 'production',
			paymentMode: 'env-controlled',
			monnifyApiKeyMasked: maskSecret(env.MONNIFY_API_KEY || ''),
			monnifySecretMasked: maskSecret(env.MONNIFY_SECRET_KEY || ''),
			monnifyContractCodeMasked: maskSecret(env.MONNIFY_CONTRACT_CODE || '')
		}
	};
};

export const actions: Actions = {
	saveBusiness: async ({ request, locals }) => {
		if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
			return fail(403, { success: false, error: 'Forbidden' });
		}

		const formData = await request.formData();
		const businessName = String(formData.get('businessName') || '').trim();
		const businessEmail = String(formData.get('businessEmail') || '')
			.trim()
			.toLowerCase();
		const whatsappNumber = String(formData.get('whatsappNumber') || '').trim();
		const currencyCode = String(formData.get('currencyCode') || '')
			.trim()
			.toUpperCase();

		if (!businessName) {
			return fail(400, {
				success: false,
				section: 'business',
				error: 'Business name is required.'
			});
		}

		if (!businessEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
			return fail(400, {
				success: false,
				section: 'business',
				error: 'A valid business email is required.'
			});
		}

		await saveBusinessSettings({
			businessName,
			businessEmail,
			whatsappNumber,
			currencyCode: currencyCode || 'NGN',
			businessTimezone: String(formData.get('businessTimezone') || 'Africa/Lagos').trim()
		});

		return {
			success: true,
			section: 'business',
			message: 'Business profile settings saved.'
		};
	},

	saveNotifications: async ({ request, locals }) => {
		if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
			return fail(403, { success: false, error: 'Forbidden' });
		}

		const formData = await request.formData();

		await saveNotificationSettings({
			adminRecipients: String(formData.get('adminRecipients') || ''),
			lowStockThreshold: String(formData.get('lowStockThreshold') || ''),
			winbackDaysThreshold: String(formData.get('winbackDaysThreshold') || ''),
			broadcastBatchSize: String(formData.get('broadcastBatchSize') || ''),
			broadcastBatchDelayMs: String(formData.get('broadcastBatchDelayMs') || '')
		});

		return {
			success: true,
			section: 'notifications',
			message: 'Notification thresholds updated.'
		};
	},

	savePayment: async ({ request, locals }) => {
		if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
			return fail(403, { success: false, error: 'Forbidden' });
		}

		const formData = await request.formData();

		await savePaymentSettings({
			minOrderValue: String(formData.get('minOrderValue') || ''),
			processingFeeEnabled: formData.get('processingFeeEnabled') === 'on'
		});

		return {
			success: true,
			section: 'payment',
			message: 'Payment configuration saved.'
		};
	},

	saveStoreControls: async ({ request, locals }) => {
		if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
			return fail(403, { success: false, error: 'Forbidden' });
		}

		const formData = await request.formData();

		await saveStoreControlSettings({
			maintenanceMode: formData.get('maintenanceMode') === 'on',
			checkoutEnabled: formData.get('checkoutEnabled') === 'on',
			autoDeliveryPaused: formData.get('autoDeliveryPaused') === 'on'
		});

		return {
			success: true,
			section: 'store',
			message: 'Store controls updated.'
		};
	},

	saveFeatureFlags: async ({ request, locals }) => {
		if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
			return fail(403, { success: false, error: 'Forbidden' });
		}

		const formData = await request.formData();
		await saveFeatureFlags({
			adminPromotions: formData.get('adminPromotions') === 'on',
			adminAnnouncementBanner: formData.get('adminAnnouncementBanner') === 'on',
			adminAdvancedAnalytics: formData.get('adminAdvancedAnalytics') === 'on',
			adminRoleManagement: formData.get('adminRoleManagement') === 'on',
			adminStoreControls: formData.get('adminStoreControls') === 'on'
		});

		return {
			success: true,
			section: 'flags',
			message: 'Feature flags saved.'
		};
	},

	saveAnnouncementBanner: async ({ request, locals }) => {
		if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
			return fail(403, { success: false, error: 'Forbidden' });
		}

		const formData = await request.formData();
		const settings = await getAdminSettingsSnapshot();
		const businessTimezone = settings.business.businessTimezone || 'Africa/Lagos';

		try {
			await saveAnnouncementBannerConfig({
				enabled: formData.get('enabled') === 'on',
				text: String(formData.get('text') || ''),
				link: String(formData.get('link') || ''),
				dismissible: formData.get('dismissible') === 'on',
				startsAt: String(formData.get('startsAt') || ''),
				endsAt: String(formData.get('endsAt') || ''),
				version: String(formData.get('version') || ''),
				timezone: businessTimezone
			});
		} catch (error) {
			return fail(400, {
				success: false,
				section: 'announcement',
				error: error instanceof Error ? error.message : 'Failed to save announcement banner settings.'
			});
		}

		return {
			success: true,
			section: 'announcement',
			message: 'Announcement banner settings saved.'
		};
	},

	sendTestEmail: async ({ request, locals }) => {
		if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
			return fail(403, { success: false, error: 'Forbidden' });
		}

		const formData = await request.formData();
		const candidate = String(formData.get('testEmail') || locals.user?.email || '')
			.trim()
			.toLowerCase();
		if (!candidate || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
			return fail(400, {
				success: false,
				section: 'smtp',
				error: 'Provide a valid test email address.'
			});
		}

		const smtpHealth = getSmtpHealthSnapshot();
		if (!smtpHealth.configured) {
			return fail(400, {
				success: false,
				section: 'smtp',
				error: `SMTP is not fully configured. Missing: ${smtpHealth.missing.join(', ')}`
			});
		}

		const result = await sendEmail({
			to: candidate,
			subject: 'FastAccs SMTP Test',
			body: `SMTP test sent from Admin Settings.\n\nTime: ${new Date().toISOString()}`,
			notificationType: 'admin_broadcast',
			userId: locals.user?.id || null
		});

		if (!result.success) {
			return fail(500, {
				success: false,
				section: 'smtp',
				error: result.error || 'Failed to send SMTP test email.'
			});
		}

		return {
			success: true,
			section: 'smtp',
			message: `Test email sent to ${candidate}.`
		};
	},

	revokeSession: async ({ request, locals }) => {
		if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
			return fail(403, { success: false, error: 'Forbidden' });
		}

		const formData = await request.formData();
		const sessionId = String(formData.get('sessionId') || '').trim();
		if (!sessionId) {
			return fail(400, { success: false, section: 'security', error: 'Session ID is required.' });
		}

		await invalidateSession(sessionId);
		return {
			success: true,
			section: 'security',
			message: 'Session revoked successfully.'
		};
	}
};
