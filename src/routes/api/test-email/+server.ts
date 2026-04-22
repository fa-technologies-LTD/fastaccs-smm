import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { sendEmail } from '$lib/services/email';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	if (!dev) {
		return json({ status: 'error', error: 'Not found' }, { status: 404 });
	}

	try {
		const result = await sendEmail({
			to: 'test@example.com',
			subject: 'FastAccs Test Email',
			body: 'This is a test email from FastAccs.\n\n**Bold text**\n- List item 1\n- List item 2',
			notificationType: 'admin_broadcast'
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
