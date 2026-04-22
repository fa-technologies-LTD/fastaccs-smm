import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { prisma } from '$lib/prisma';

export type EmailNotificationType =
	| 'verification'
	| 'welcome'
	| 'order_confirmation'
	| 'order_delivery'
	| 'restock_alert'
	| 'win_back'
	| 'admin_broadcast';

type EmailNotificationStatus = 'pending' | 'sent' | 'failed';

interface SendEmailParams {
	to: string;
	subject: string;
	body: string;
	ctaText?: string | null;
	ctaUrl?: string | null;
	showCta?: boolean;
	userId?: string | null;
	notificationType: EmailNotificationType;
	referenceId?: string | null;
	broadcastId?: string | null;
	notificationId?: string | null;
}

interface SendEmailResult {
	success: boolean;
	messageId?: string;
	error?: string;
}

interface EmailLogParams {
	userId?: string | null;
	email: string;
	notificationType: EmailNotificationType;
	referenceId?: string | null;
	subject?: string | null;
	body?: string | null;
	status: EmailNotificationStatus;
	errorMessage?: string | null;
	broadcastId?: string | null;
}

let transporterCache: Transporter | null = null;

function getBaseUrl(): string {
	const candidate = (env.PUBLIC_BASE_URL || PUBLIC_BASE_URL || '').trim();
	if (candidate) {
		return candidate.replace(/\/+$/, '');
	}
	return 'http://localhost:5173';
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function toBodyHtml(content: string): string {
	const withEscaped = escapeHtml(content);

	const withLinks = withEscaped.replace(
		/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,
		'<a href="$2" style="color:#25B570;text-decoration:underline;">$1</a>'
	);
	const withBold = withLinks.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

	return withBold
		.split(/\n{2,}/)
		.map((segment) => {
			const trimmed = segment.trim();
			if (!trimmed) return '';

			const lines = trimmed.split('\n').map((line) => line.trim());
			const bulletLines = lines.filter((line) => line.startsWith('- '));
			if (bulletLines.length === lines.length) {
				const items = bulletLines
					.map((line) => `<li style="margin:0 0 8px 0;">${line.slice(2)}</li>`)
					.join('');
				return `<ul style="margin:0 0 16px 20px;padding:0;color:#CCCCCC;">${items}</ul>`;
			}

			return `<p style="margin:0 0 16px 0;line-height:1.6;color:#CCCCCC;">${lines.join('<br>')}</p>`;
		})
		.join('');
}

function renderEmailTemplate(params: {
	firstName?: string | null;
	body: string;
	ctaText?: string | null;
	ctaUrl?: string | null;
	showCta?: boolean;
}): string {
	const showCta = Boolean(params.showCta && params.ctaText && params.ctaUrl);
	const baseUrl = getBaseUrl();
	const supportEmail = env.SMTP_FROM_EMAIL || env.GMAIL_USER || 'support@fastaccs.com';

	return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#141414;border-radius:8px;border:1px solid #232323;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #232323;">
                <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">FAST ACCOUNTS</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${params.firstName ? `<p style="margin:0 0 14px 0;color:#CCCCCC;">Hi ${escapeHtml(params.firstName)},</p>` : ''}
                ${params.body}
                ${
									showCta
										? `<div style="margin-top:20px;">
                  <a href="${params.ctaUrl}" style="display:inline-block;background:#25B570;color:#ffffff;border-radius:6px;padding:12px 24px;font-weight:600;text-decoration:none;">${escapeHtml(params.ctaText || '')}</a>
                </div>`
										: ''
								}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;border-top:1px solid #232323;color:#9A9A9A;font-size:12px;line-height:1.6;">
                <div style="color:#E4E4E4;font-weight:600;">Fast Accounts by Teerex</div>
                <div style="margin-top:6px;">
                  <a href="https://wa.me/2347047914208" style="color:#9A9A9A;text-decoration:underline;">WhatsApp Support</a>
                  &nbsp;|&nbsp;
                  <a href="mailto:${escapeHtml(supportEmail)}" style="color:#9A9A9A;text-decoration:underline;">Support Email</a>
                </div>
                <div style="margin-top:6px;">© 2026 FA Technologies LTD</div>
                <div style="margin-top:10px;">You received this because you have an account on Fast Accounts.</div>
                <div style="margin-top:8px;">
                  <a href="${baseUrl}" style="color:#9A9A9A;text-decoration:underline;">${baseUrl}</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function getTransporter(): Transporter {
	if (transporterCache) return transporterCache;

	const smtpHost = (env.SMTP_HOST || '').trim();
	const smtpPort = Number(env.SMTP_PORT || 0);
	const smtpUser = (env.SMTP_USER || '').trim();
	const smtpPassword = env.SMTP_PASSWORD || '';
	const smtpSecure = (env.SMTP_SECURE || '').toLowerCase() === 'true';

	if (smtpHost && smtpPort > 0 && smtpUser && smtpPassword) {
		transporterCache = nodemailer.createTransport({
			host: smtpHost,
			port: smtpPort,
			secure: smtpSecure,
			auth: {
				user: smtpUser,
				pass: smtpPassword
			}
		});
		return transporterCache;
	}

	const gmailUser = (env.GMAIL_USER || '').trim();
	const gmailPassword = env.GMAIL_APP_PASSWORD || '';

	if (gmailUser && gmailPassword) {
		transporterCache = nodemailer.createTransport({
			service: 'gmail',
			auth: {
				user: gmailUser,
				pass: gmailPassword
			}
		});
		return transporterCache;
	}

	throw new Error('SMTP transport not configured');
}

function getFromAddress(): string {
	const fromName = (env.SMTP_FROM_NAME || 'Fast Accounts').trim();
	const fromEmail = (env.SMTP_FROM_EMAIL || env.GMAIL_USER || 'no-reply@fastaccs.com').trim();
	return `"${fromName}" <${fromEmail}>`;
}

async function createEmailLog(params: EmailLogParams): Promise<string | null> {
	try {
		const record = await prisma.emailNotification.create({
			data: {
				userId: params.userId || null,
				email: params.email,
				notificationType: params.notificationType,
				referenceId: params.referenceId || null,
				subject: params.subject || null,
				body: params.body || null,
				status: params.status,
				sentAt: params.status === 'sent' ? new Date() : null,
				failedAt: params.status === 'failed' ? new Date() : null,
				errorMessage: params.errorMessage || null,
				broadcastId: params.broadcastId || null
			},
			select: { id: true }
		});
		return record.id;
	} catch (error) {
		console.error('createEmailLog failed:', error);
		return null;
	}
}

async function updateEmailLog(
	notificationId: string,
	status: EmailNotificationStatus,
	errorMessage?: string | null
): Promise<void> {
	try {
		await prisma.emailNotification.update({
			where: { id: notificationId },
			data: {
				status,
				sentAt: status === 'sent' ? new Date() : null,
				failedAt: status === 'failed' ? new Date() : null,
				errorMessage: errorMessage || null
			}
		});
	} catch (error) {
		console.error('updateEmailLog failed:', error);
	}
}

export async function logEmailNotification(params: EmailLogParams): Promise<string | null> {
	return createEmailLog(params);
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
	const recipient = params.to.trim().toLowerCase();
	const subject = params.subject.trim();
	const body = params.body.trim();

	const bodyHtml = toBodyHtml(body);
	const html = renderEmailTemplate({
		body: bodyHtml,
		ctaText: params.ctaText || null,
		ctaUrl: params.ctaUrl || null,
		showCta: params.showCta !== false
	});

	try {
		const transporter = getTransporter();
		const result = await transporter.sendMail({
			from: getFromAddress(),
			to: recipient,
			subject,
			text: body,
			html
		});

		if (params.notificationId) {
			await updateEmailLog(params.notificationId, 'sent', null);
		} else {
			await createEmailLog({
				userId: params.userId || null,
				email: recipient,
				notificationType: params.notificationType,
				referenceId: params.referenceId || null,
				subject,
				body,
				status: 'sent',
				broadcastId: params.broadcastId || null
			});
		}

		return {
			success: true,
			messageId: result.messageId
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
		console.error('sendEmail failed:', errorMessage);

		if (params.notificationId) {
			await updateEmailLog(params.notificationId, 'failed', errorMessage);
		} else {
			await createEmailLog({
				userId: params.userId || null,
				email: recipient,
				notificationType: params.notificationType,
				referenceId: params.referenceId || null,
				subject,
				body,
				status: 'failed',
				errorMessage,
				broadcastId: params.broadcastId || null
			});
		}

		return {
			success: false,
			error: errorMessage
		};
	}
}

export function generateVerificationCode(): string {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

export function maskEmailAddress(email: string): string {
	const normalized = email.trim();
	const [localPart, domain] = normalized.split('@');
	if (!localPart || !domain) return normalized;

	const visible = localPart.slice(0, 1);
	return `${visible}${'•'.repeat(Math.max(localPart.length - 1, 1))}@${domain}`;
}

export function markdownToEmailBody(markdown: string): string {
	const normalized = markdown
		.replace(/\r\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	if (!normalized) return '';

	return normalized
		.split('\n')
		.map((line) => {
			const trimmed = line.trim();
			if (!trimmed) return '';

			if (trimmed.startsWith('- ')) {
				return trimmed;
			}

			return trimmed;
		})
		.join('\n');
}

export async function sendWelcomeEmailIfNeeded(params: {
	userId: string;
	email: string;
	firstName?: string | null;
}): Promise<void> {
	const existing = await prisma.emailNotification.findFirst({
		where: {
			userId: params.userId,
			notificationType: 'welcome',
			status: 'sent'
		},
		select: { id: true }
	});

	if (existing) return;

	await sendEmail({
		to: params.email,
		subject: 'Welcome to Fast Accounts',
		body: `Welcome to Fast Accounts.

You are all set to browse premium account tiers, complete secure checkout, and access purchases from your dashboard.

Head to platforms to find the right accounts for your needs.`,
		ctaText: 'Browse Accounts',
		ctaUrl: `${getBaseUrl()}/platforms`,
		userId: params.userId,
		notificationType: 'welcome'
	});
}

export async function sendOrderConfirmationEmailIfNeeded(orderId: string): Promise<void> {
	const existing = await prisma.emailNotification.findFirst({
		where: {
			referenceId: orderId,
			notificationType: 'order_confirmation',
			status: 'sent'
		},
		select: { id: true }
	});

	if (existing) return;

	const order = await prisma.order.findUnique({
		where: { id: orderId },
		include: {
			orderItems: true,
			user: true
		}
	});

	if (!order) return;
	const targetEmail = (order.user?.email || order.guestEmail || '').trim();
	if (!targetEmail) return;

	const itemLines = order.orderItems.map(
		(item) => `- ${item.productName} x${item.quantity} (${Number(item.totalPrice).toLocaleString('en-US')})`
	);
	const normalizedOrderSuffix = order.orderNumber.replace(/^ORD-?/i, '');
	const humanOrderNumber = `FA-${normalizedOrderSuffix}`;

	const body = `Your payment was successful and your order has been confirmed.

Order: ${humanOrderNumber}
Amount paid: ₦${Number(order.totalAmount).toLocaleString('en-US')}

Items:
${itemLines.join('\n')}

Your account credentials are available on your dashboard. For security, we never send login details via email.`;

	await sendEmail({
		to: targetEmail,
		subject: `Order confirmed — ${humanOrderNumber}`,
		body,
		ctaText: 'View your account details',
		ctaUrl: `${getBaseUrl()}/dashboard?tab=purchases`,
		userId: order.userId || null,
		notificationType: 'order_confirmation',
		referenceId: order.id
	});
}
