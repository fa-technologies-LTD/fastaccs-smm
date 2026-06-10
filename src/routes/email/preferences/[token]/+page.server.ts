import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';

async function getPreference(token: string) {
	return prisma.user.findUnique({
		where: { marketingPreferenceToken: token },
		select: {
			email: true,
			marketingEmailEnabled: true,
			marketingUnsubscribedAt: true
		}
	});
}

export const load: PageServerLoad = async ({ params }) => {
	const preference = await getPreference(params.token);
	if (!preference) throw error(404, 'Email preference link not found');

	return {
		email: preference.email,
		marketingEmailEnabled: preference.marketingEmailEnabled,
		marketingUnsubscribedAt: preference.marketingUnsubscribedAt?.toISOString() || null
	};
};

export const actions: Actions = {
	default: async ({ params, request }) => {
		const preference = await getPreference(params.token);
		if (!preference) return fail(404, { message: 'Email preference link not found' });

		const formData = await request.formData();
		const enabled = formData.get('enabled') === 'true';
		await prisma.user.update({
			where: { marketingPreferenceToken: params.token },
			data: {
				marketingEmailEnabled: enabled,
				marketingUnsubscribedAt: enabled ? null : new Date()
			}
		});

		return {
			success: true,
			enabled,
			message: enabled
				? 'Relevant Fast Accounts updates are enabled.'
				: 'You have unsubscribed from optional marketing emails.'
		};
	}
};
