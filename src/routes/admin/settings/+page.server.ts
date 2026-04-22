import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import {
	getAdminSettingsSnapshot,
	saveBusinessSettings,
	saveNotificationSettings
} from '$lib/services/admin-settings';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async () => {
	const settings = await getAdminSettingsSnapshot();

	return {
		settings,
		envConfig: {
			monnifyBaseUrl: (env.MONNIFY_BASE_URL || '').trim() || 'https://api.monnify.com',
			nodeEnv: (env.NODE_ENV || '').trim() || 'production',
			paymentMode: 'env-controlled'
		}
	};
};

export const actions: Actions = {
	saveBusiness: async ({ request }) => {
		const formData = await request.formData();
		const businessName = String(formData.get('businessName') || '').trim();
		const businessEmail = String(formData.get('businessEmail') || '')
			.trim()
			.toLowerCase();
		const whatsappNumber = String(formData.get('whatsappNumber') || '').trim();
		const currencyCode = String(formData.get('currencyCode') || '').trim().toUpperCase();

		if (!businessName) {
			return fail(400, { success: false, section: 'business', error: 'Business name is required.' });
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
			currencyCode: currencyCode || 'NGN'
		});

		return {
			success: true,
			section: 'business',
			message: 'Business profile settings saved.'
		};
	},

	saveNotifications: async ({ request }) => {
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
	}
};
