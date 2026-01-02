import { json } from '@sveltejs/kit';
import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';

export async function POST({ request }) {
	try {
		const { to, subject, content } = await request.json();

		// Gmail SMTP configuration
		const gmailUser = env.GMAIL_USER;
		const gmailPassword = env.GMAIL_APP_PASSWORD; // Use App Password, not regular password

		if (!gmailUser || !gmailPassword) {
			console.error('Gmail configuration missing');
			return json({ error: 'Email service not configured' }, { status: 500 });
		}

		// Create transporter
		const transporter = nodemailer.createTransport({
			service: 'gmail',
			auth: {
				user: gmailUser,
				pass: gmailPassword
			}
		});

		// Email options
		const mailOptions = {
			from: `"FastAccs" <${gmailUser}>`,
			to: to,
			subject: subject,
			text: content,
			html: formatEmailContent(content)
		};

		// Send email
		const result = await transporter.sendMail(mailOptions);
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
}

/**
 * Format email content as HTML
 */
function formatEmailContent(content: string): string {
	return content
		.replace(/\n/g, '<br>')
		.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
		.replace(/^- (.*$)/gim, '<li>$1</li>')
		.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
}
