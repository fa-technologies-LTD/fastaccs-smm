import { json } from '@sveltejs/kit';
import { sendEmail } from '$lib/services/email';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { to, subject, content } = await request.json();
		const recipient = typeof to === 'string' ? to.trim() : '';
		const emailSubject = typeof subject === 'string' ? subject.trim() : '';
		const emailBody = typeof content === 'string' ? content.trim() : '';

		if (!recipient || !emailSubject || !emailBody) {
			return json({ error: 'to, subject and content are required' }, { status: 400 });
		}

		const result = await sendEmail({
			to: recipient,
			subject: emailSubject,
			body: emailBody,
			notificationType: 'admin_broadcast',
			userId: locals.user.id
		});

		if (!result.success) {
			return json({ error: result.error || 'Failed to send email' }, { status: 500 });
		}

		return json({
			success: true,
			messageId: result.messageId
		});
	} catch (error) {
		console.error('Error sending email:', error);
		return json(
			{
				error: 'Failed to send email: ' + (error instanceof Error ? error.message : 'Unknown error')
			},
				{ status: 500 }
			);
	}
};
