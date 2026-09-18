import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { sendEmail } from '$lib/services/email';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	if (!dev) {
		return json({ status: 'error', error: 'Not found' }, { status: 404 });
	}

	try {
		const recipient = String(env.ADMIN_EMAILS || '')
			.split(',')
			.map((email) => email.trim())
			.find(Boolean);

		if (!recipient) {
			return json({ status: 'error', error: 'No primary admin email configured' }, { status: 500 });
		}

		const result = await sendEmail({
			to: recipient,
			subject: 'Fast Accounts email header preview',
			body: 'The email header and shared layout are rendering correctly.',
			ctaText: 'Open Fast Accounts',
			ctaUrl: 'https://smm.fastaccs.com',
			notificationType: 'admin_broadcast',
			classification: 'operational',
			referenceId: `email_header_preview:${new Date().toISOString()}`
		});

		return json({
			status: result.success ? 'success' : 'error',
			result
		});
	} catch (error) {
		return json({
			status: 'error',
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
};
