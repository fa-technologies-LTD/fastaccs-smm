import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { prisma } from '$lib/prisma';
import emailHeaderDataUrl from '$lib/assets/fa-email-header.png?inline';
import { randomInt } from 'crypto';

export type EmailNotificationType =
	| 'verification'
	| 'welcome'
	| 'onboarding_step'
	| 'abandoned_order'
	| 'order_confirmation'
	| 'order_delivery'
	| 'restock_alert'
	| 'win_back'
	| 'affiliate_unlock'
	| 'affiliate_introduction'
	| 'affiliate_progress'
	| 'affiliate_store_credit'
	| 'affiliate_payout'
	| 'marketing_campaign'
	| 'admin_broadcast';

export type EmailClassification = 'transactional' | 'marketing' | 'operational';
type EmailNotificationStatus = 'pending' | 'sent' | 'failed' | 'suppressed';

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
	classification?: EmailClassification;
	campaignKey?: string | null;
	marketingPreferenceToken?: string | null;
}

interface SendEmailResult {
	success: boolean;
	messageId?: string;
	error?: string;
	suppressed?: boolean;
	suppressionReason?: string;
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
	classification?: EmailClassification;
	campaignKey?: string | null;
	suppressionReason?: string | null;
}

let transporterCache: Transporter | null = null;

const CANONICAL_PUBLIC_BASE_URL = 'https://smm.fastaccs.com';
const EMAIL_HEADER_CID = 'fastaccounts-email-header';
const EMAIL_HEADER_CONTENT = Buffer.from(emailHeaderDataUrl.split(',')[1] || '', 'base64');
const MARKETING_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const QUEUED_MARKETING_STALE_MS = 15 * 60 * 1000;

function normalizePublicBaseUrl(candidate: string): string | null {
	try {
		const url = new URL(candidate.trim());
		if (url.protocol !== 'https:') return null;
		return url.origin;
	} catch {
		return null;
	}
}

function getBaseUrl(): string {
	const candidates = [
		publicEnv.PUBLIC_BASE_URL,
		process.env.PUBLIC_BASE_URL,
		CANONICAL_PUBLIC_BASE_URL
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		const normalized = normalizePublicBaseUrl(candidate);
		if (normalized) return normalized;
	}

	return CANONICAL_PUBLIC_BASE_URL;
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

const INBOX_REMINDER_LINE =
	'**Important:** To avoid missing future updates, mark this email as Not Spam and move it to your Primary inbox.';

export function resolveEmailLogoUrl(baseUrl: string): string {
	const normalizedBaseUrl = normalizePublicBaseUrl(baseUrl) || CANONICAL_PUBLIC_BASE_URL;
	return `${normalizedBaseUrl}/fa-email-logo.png`;
}

function isOperationalAdminAlert(params: SendEmailParams): boolean {
	if (params.notificationType !== 'admin_broadcast') return false;
	const referenceId = String(params.referenceId || '')
		.trim()
		.toLowerCase();
	return (
		referenceId.startsWith('critical:') ||
		referenceId.startsWith('low_stock_alert:') ||
		referenceId.startsWith('weekly_business_digest:')
	);
}

function shouldShowInboxReminder(params: SendEmailParams): boolean {
	if (isOperationalAdminAlert(params)) return false;
	if (params.notificationType !== 'admin_broadcast') return true;
	return Boolean(params.broadcastId);
}

function appendInboxReminderIfMissing(body: string): string {
	if (/not spam/i.test(body) && /primary/i.test(body)) return body;
	return `${body}\n\n${INBOX_REMINDER_LINE}`;
}

export function renderEmailTemplate(params: {
	firstName?: string | null;
	body: string;
	ctaText?: string | null;
	ctaUrl?: string | null;
	showCta?: boolean;
	marketingPreferenceUrl?: string | null;
}): string {
	const showCta = Boolean(params.showCta && params.ctaText && params.ctaUrl);
	const baseUrl = getBaseUrl();
	const supportEmail = env.SMTP_FROM_EMAIL || env.GMAIL_USER || 'support@fastaccs.com';

	return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#080A0B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#080A0B;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
            <tr>
              <td align="center" style="padding:0 0 18px 0;line-height:1;">
                <img src="cid:${EMAIL_HEADER_CID}" alt="FAST ACCOUNTS" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;outline:none;text-decoration:none;color:#25B570;font-size:22px;font-weight:800;line-height:1.2;letter-spacing:0.6px;" />
              </td>
            </tr>
            <tr>
              <td>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#141414;border-radius:14px;border:1px solid #2B2F33;overflow:hidden;">
                  <tr>
                    <td style="padding:28px;">
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
                    <td style="padding:20px 28px;border-top:1px solid #2B2F33;color:#9A9A9A;font-size:12px;line-height:1.6;background:#101213;">
                      <div style="color:#E4E4E4;font-weight:600;">Fast Accounts</div>
                      <div style="margin-top:6px;">
                        <a href="https://wa.link/fast_accounts" style="color:#9A9A9A;text-decoration:underline;">WhatsApp Support</a>
                        &nbsp;|&nbsp;
                        <a href="mailto:${escapeHtml(supportEmail)}" style="color:#9A9A9A;text-decoration:underline;">Support Email</a>
                      </div>
                      <div style="margin-top:6px;">© 2026 FA Technologies LTD</div>
                      <div style="margin-top:10px;">You received this because you have an account on Fast Accounts.</div>
                      ${
												params.marketingPreferenceUrl
													? `<div style="margin-top:8px;">You are receiving this because you may be interested in relevant Fast Accounts updates.</div>
                      <div style="margin-top:6px;">
                        <a href="${escapeHtml(params.marketingPreferenceUrl)}" style="color:#9A9A9A;text-decoration:underline;">Manage email preferences</a>
                        &nbsp;|&nbsp;
                        <a href="${escapeHtml(params.marketingPreferenceUrl)}" style="color:#9A9A9A;text-decoration:underline;">Unsubscribe</a>
                      </div>`
													: ''
											}
                      <div style="margin-top:8px;">
                        <a href="${baseUrl}" style="color:#9A9A9A;text-decoration:underline;">${baseUrl}</a>
                      </div>
                    </td>
                  </tr>
                </table>
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
				classification: params.classification || 'transactional',
				campaignKey: params.campaignKey || null,
				referenceId: params.referenceId || null,
				subject: params.subject || null,
				body: params.body || null,
				status: params.status,
				sentAt: params.status === 'sent' ? new Date() : null,
				failedAt: params.status === 'failed' ? new Date() : null,
				errorMessage: params.errorMessage || null,
				suppressionReason: params.suppressionReason || null,
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
				processingAt: null,
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
	const rawBody = params.body.trim();
	const body = shouldShowInboxReminder(params) ? appendInboxReminderIfMissing(rawBody) : rawBody;

	const bodyHtml = toBodyHtml(body);
	const html = renderEmailTemplate({
		body: bodyHtml,
		ctaText: params.ctaText || null,
		ctaUrl: params.ctaUrl || null,
		showCta: params.showCta !== false,
		marketingPreferenceUrl: params.marketingPreferenceToken
			? `${getBaseUrl()}/email/preferences/${params.marketingPreferenceToken}`
			: null
	});

	try {
		const transporter = getTransporter();
		const result = await transporter.sendMail({
			from: getFromAddress(),
			to: recipient,
			subject,
			text: body,
			html,
			attachments: [
				{
					filename: 'fastaccounts-email-header.png',
					content: EMAIL_HEADER_CONTENT,
					cid: EMAIL_HEADER_CID,
					contentType: 'image/png',
					contentDisposition: 'inline'
				}
			]
		});

		if (params.notificationId) {
			await updateEmailLog(params.notificationId, 'sent', null);
		} else {
			await createEmailLog({
				userId: params.userId || null,
				email: recipient,
				notificationType: params.notificationType,
				classification: params.classification || 'transactional',
				campaignKey: params.campaignKey || null,
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
				classification: params.classification || 'transactional',
				campaignKey: params.campaignKey || null,
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

interface MarketingReservation {
	notificationId: string;
	email: string;
	preferenceToken: string;
}

async function reserveMarketingEmail(params: SendEmailParams & { campaignKey: string }): Promise<{
	reservation?: MarketingReservation;
	suppressionReason?: string;
}> {
	if (!params.userId) {
		return { suppressionReason: 'marketing_requires_user' };
	}

	return prisma.$transaction(async (tx) => {
		const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM users
			WHERE id = ${params.userId}::uuid
			FOR UPDATE
		`;
		if (lockedUsers.length === 0) {
			return { suppressionReason: 'user_not_found' };
		}

		const user = await tx.user.findUnique({
			where: { id: params.userId as string },
			select: {
				email: true,
				isActive: true,
				emailVerified: true,
				marketingEmailEnabled: true,
				marketingSuppressedAt: true,
				marketingPreferenceToken: true
			}
		});
		if (!user?.email) return { suppressionReason: 'missing_email' };

		const duplicate = await tx.emailNotification.findFirst({
			where: {
				userId: params.userId,
				campaignKey: params.campaignKey,
				status: { in: ['pending', 'sent'] }
			},
			select: { id: true }
		});
		if (duplicate) return { suppressionReason: 'duplicate_campaign' };

		const recentSuppression = await tx.emailNotification.findFirst({
			where: {
				userId: params.userId,
				campaignKey: params.campaignKey,
				status: 'suppressed',
				createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
			},
			select: { id: true }
		});
		if (recentSuppression) return { suppressionReason: 'recently_suppressed' };

		let suppressionReason: string | null = null;
		if (!user.isActive) suppressionReason = 'inactive_user';
		else if (!user.emailVerified) suppressionReason = 'unverified_email';
		else if (!user.marketingEmailEnabled) suppressionReason = 'unsubscribed';
		else if (user.marketingSuppressedAt) suppressionReason = 'suppressed_address';

		if (!suppressionReason) {
			const recentMarketing = await tx.emailNotification.findFirst({
				where: {
					userId: params.userId,
					classification: 'marketing',
					status: 'sent',
					sentAt: {
						gte: new Date(Date.now() - MARKETING_COOLDOWN_MS)
					}
				},
				select: { id: true }
			});
			if (recentMarketing) suppressionReason = 'seven_day_marketing_limit';
		}

		if (suppressionReason) {
			await tx.emailNotification.create({
				data: {
					userId: params.userId,
					email: user.email.toLowerCase(),
					notificationType: params.notificationType,
					classification: 'marketing',
					campaignKey: params.campaignKey,
					referenceId: params.referenceId || null,
					subject: params.subject,
					body: params.body,
					status: 'suppressed',
					suppressionReason
				}
			});
			return { suppressionReason };
		}

		const notification = await tx.emailNotification.create({
			data: {
				userId: params.userId,
				email: user.email.toLowerCase(),
				notificationType: params.notificationType,
				classification: 'marketing',
				campaignKey: params.campaignKey,
				referenceId: params.referenceId || null,
				subject: params.subject,
				body: params.body,
				status: 'pending'
			},
			select: { id: true }
		});

		return {
			reservation: {
				notificationId: notification.id,
				email: user.email,
				preferenceToken: user.marketingPreferenceToken
			}
		};
	});
}

export async function sendMarketingEmail(
	params: SendEmailParams & { userId: string; campaignKey: string }
): Promise<SendEmailResult> {
	const claim = await reserveMarketingEmail(params);
	if (!claim.reservation) {
		return {
			success: false,
			suppressed: true,
			suppressionReason: claim.suppressionReason || 'not_eligible'
		};
	}

	return sendEmail({
		...params,
		to: claim.reservation.email,
		classification: 'marketing',
		notificationId: claim.reservation.notificationId,
		marketingPreferenceToken: claim.reservation.preferenceToken
	});
}

interface QueuedMarketingReservation {
	notificationId: string;
	email: string;
	subject: string;
	body: string;
	notificationType: EmailNotificationType;
	referenceId: string | null;
	broadcastId: string | null;
	campaignKey: string;
	userId: string;
	preferenceToken: string;
}

export async function sendQueuedMarketingEmail(notificationId: string): Promise<SendEmailResult> {
	const claim = await prisma.$transaction(async (tx) => {
		const lockedNotifications = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM email_notifications
			WHERE id = ${notificationId}::uuid
			FOR UPDATE
		`;
		if (lockedNotifications.length === 0) {
			return { suppressionReason: 'notification_not_found' };
		}

		const notification = await tx.emailNotification.findUnique({
			where: { id: notificationId },
			select: {
				id: true,
				userId: true,
				email: true,
				notificationType: true,
				referenceId: true,
				subject: true,
				body: true,
				status: true,
				processingAt: true,
				broadcastId: true,
				campaignKey: true
			}
		});
		if (!notification?.userId) return { suppressionReason: 'marketing_requires_user' };
		if (!notification.subject?.trim() || !notification.body?.trim()) {
			await tx.emailNotification.update({
				where: { id: notificationId },
				data: {
					status: 'failed',
					processingAt: null,
					failedAt: new Date(),
					errorMessage: 'Missing subject or body for queued marketing email.'
				}
			});
			return { suppressionReason: 'missing_subject_or_body' };
		}

		const staleBefore = new Date(Date.now() - QUEUED_MARKETING_STALE_MS);
		const isClaimable =
			notification.status === 'pending' ||
			(notification.status === 'processing' &&
				Boolean(notification.processingAt && notification.processingAt < staleBefore));
		if (!isClaimable) return { suppressionReason: 'already_processed_or_claimed' };

		const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM users
			WHERE id = ${notification.userId}::uuid
			FOR UPDATE
		`;
		if (lockedUsers.length === 0) {
			return { suppressionReason: 'user_not_found' };
		}

		const user = await tx.user.findUnique({
			where: { id: notification.userId },
			select: {
				email: true,
				isActive: true,
				emailVerified: true,
				marketingEmailEnabled: true,
				marketingSuppressedAt: true,
				marketingPreferenceToken: true
			}
		});
		if (!user?.email) return { suppressionReason: 'missing_email' };

		const campaignKey =
			notification.campaignKey ||
			`queued-marketing:${notification.broadcastId || notification.id}:${notification.userId}`;
		const duplicate = await tx.emailNotification.findFirst({
			where: {
				id: { not: notification.id },
				userId: notification.userId,
				campaignKey,
				status: { in: ['processing', 'pending', 'sent'] }
			},
			select: { id: true }
		});

		// Admin broadcasts are a deliberate, infrequent send the admin controls directly,
		// so they skip the rolling marketing cooldown that throttles automated campaigns
		// (winback/onboarding/etc.) against each other.
		let suppressionReason: string | null = null;
		if (duplicate) suppressionReason = 'duplicate_campaign';
		else if (!user.isActive) suppressionReason = 'inactive_user';
		else if (!user.emailVerified) suppressionReason = 'unverified_email';
		else if (!user.marketingEmailEnabled) suppressionReason = 'unsubscribed';
		else if (user.marketingSuppressedAt) suppressionReason = 'suppressed_address';

		if (suppressionReason) {
			await tx.emailNotification.update({
				where: { id: notification.id },
				data: {
					email: user.email.toLowerCase(),
					classification: 'marketing',
					campaignKey,
					status: 'suppressed',
					processingAt: null,
					suppressionReason,
					errorMessage: null
				}
			});
			return { suppressionReason };
		}

		await tx.emailNotification.update({
			where: { id: notification.id },
			data: {
				email: user.email.toLowerCase(),
				classification: 'marketing',
				campaignKey,
				status: 'processing',
				processingAt: new Date(),
				suppressionReason: null,
				errorMessage: null,
				failedAt: null
			}
		});

		return {
			reservation: {
				notificationId: notification.id,
				email: user.email,
				subject: notification.subject.trim(),
				body: notification.body.trim(),
				notificationType: notification.notificationType as EmailNotificationType,
				referenceId: notification.referenceId,
				broadcastId: notification.broadcastId,
				campaignKey,
				userId: notification.userId,
				preferenceToken: user.marketingPreferenceToken
			} satisfies QueuedMarketingReservation
		};
	});

	if (!claim.reservation) {
		return {
			success: false,
			suppressed: true,
			suppressionReason: claim.suppressionReason || 'not_eligible'
		};
	}

	const reservation = claim.reservation;
	return sendEmail({
		to: reservation.email,
		subject: reservation.subject,
		body: reservation.body,
		showCta: false,
		userId: reservation.userId,
		notificationType: reservation.notificationType,
		referenceId: reservation.referenceId,
		broadcastId: reservation.broadcastId,
		notificationId: reservation.notificationId,
		classification: 'marketing',
		campaignKey: reservation.campaignKey,
		marketingPreferenceToken: reservation.preferenceToken
	});
}

export function generateVerificationCode(): string {
	return randomInt(100000, 1_000_000).toString();
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
}): Promise<boolean> {
	const notificationId = await prisma.$transaction(async (tx) => {
		const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM users
			WHERE id = ${params.userId}::uuid
			FOR UPDATE
		`;
		if (lockedUsers.length === 0) return null;

		const existing = await tx.emailNotification.findFirst({
			where: {
				userId: params.userId,
				notificationType: 'welcome',
				status: { in: ['pending', 'sent'] }
			},
			orderBy: { createdAt: 'desc' },
			select: { id: true, status: true, createdAt: true }
		});
		if (existing?.status === 'sent') return null;
		if (
			existing?.status === 'pending' &&
			Date.now() - existing.createdAt.getTime() < 10 * 60 * 1000
		) {
			return null;
		}

		const notification = await tx.emailNotification.create({
			data: {
				userId: params.userId,
				email: params.email.toLowerCase(),
				notificationType: 'welcome',
				classification: 'transactional',
				referenceId: `welcome:${params.userId}`,
				status: 'pending'
			},
			select: { id: true }
		});
		return notification.id;
	});

	if (!notificationId) return false;

	const firstName = params.firstName?.trim() || params.email.split('@')[0] || 'there';

	const result = await sendEmail({
		to: params.email,
		subject: 'Welcome to Fast Accounts',
		body: `Hi ${firstName},

Welcome to Fast Accounts. Your account is ready.

You can now:
- See available accounts
- Complete secure checkout
- View orders and purchases from your dashboard
- Get help quickly whenever you need it

Start with any account that fits what you need.`,
		ctaText: 'See available accounts',
		ctaUrl: `${getBaseUrl()}/platforms`,
		userId: params.userId,
		notificationType: 'welcome',
		referenceId: `welcome:${params.userId}`,
		notificationId
	});
	return result.success;
}

const ORDER_CONFIRMATION_PENDING_STALE_MS = 10 * 60 * 1000;

interface ReservedOrderConfirmation {
	notificationId: string;
	targetEmail: string;
	order: {
		id: string;
		orderNumber: string;
		totalAmount: unknown;
		userId: string | null;
		guestEmail: string | null;
		orderItems: Array<{
			productName: string;
			quantity: number;
			totalPrice: unknown;
		}>;
		user: {
			email: string | null;
		} | null;
	};
}

async function reserveOrderConfirmationNotification(
	orderId: string
): Promise<ReservedOrderConfirmation | null> {
	return prisma.$transaction(async (tx) => {
		const lockedOrders = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM orders
			WHERE id = ${orderId}::uuid
			FOR UPDATE
		`;
		if (lockedOrders.length === 0) {
			return null;
		}

		const existing = await tx.emailNotification.findFirst({
			where: {
				referenceId: orderId,
				notificationType: 'order_confirmation',
				status: {
					in: ['pending', 'sent']
				}
			},
			orderBy: {
				createdAt: 'desc'
			},
			select: {
				id: true,
				status: true,
				createdAt: true
			}
		});

		if (existing?.status === 'sent') {
			return null;
		}

		const order = await tx.order.findUnique({
			where: { id: orderId },
			include: {
				orderItems: true,
				user: true
			}
		});
		if (!order) {
			return null;
		}

		const targetEmail = (order.user?.email || order.guestEmail || '').trim().toLowerCase();
		if (!targetEmail) {
			return null;
		}

		if (existing?.status === 'pending') {
			const ageMs = Date.now() - existing.createdAt.getTime();
			if (ageMs < ORDER_CONFIRMATION_PENDING_STALE_MS) {
				return null;
			}

			await tx.emailNotification.update({
				where: { id: existing.id },
				data: {
					userId: order.userId || null,
					email: targetEmail,
					status: 'pending',
					errorMessage: null,
					failedAt: null
				}
			});

			return {
				notificationId: existing.id,
				order,
				targetEmail
			};
		}

		const created = await tx.emailNotification.create({
			data: {
				userId: order.userId || null,
				email: targetEmail,
				notificationType: 'order_confirmation',
				referenceId: order.id,
				status: 'pending'
			},
			select: {
				id: true
			}
		});

		return {
			notificationId: created.id,
			order,
			targetEmail
		};
	});
}

export async function sendOrderConfirmationEmailIfNeeded(orderId: string): Promise<void> {
	const reservation = await reserveOrderConfirmationNotification(orderId);
	if (!reservation?.order) return;

	const { order, targetEmail, notificationId } = reservation;

	const itemLines = order.orderItems.map(
		(item) =>
			`- ${item.productName} x${item.quantity} (${Number(item.totalPrice).toLocaleString('en-US')})`
	);
	const normalizedOrderSuffix = order.orderNumber.replace(/^ORD-?/i, '');
	const humanOrderNumber = `FA-${normalizedOrderSuffix}`;

	const body = `Your payment was successful and your order has been confirmed.

Order: ${humanOrderNumber}
Amount paid: ₦${Number(order.totalAmount).toLocaleString('en-US')}

Items:
${itemLines.join('\n')}

Your account credentials are available on your dashboard. For security, we never send login details via email.`;

	await prisma.emailNotification.update({
		where: { id: notificationId },
		data: {
			subject: `Order confirmed — ${humanOrderNumber}`,
			body
		}
	});

	await sendEmail({
		to: targetEmail,
		subject: `Order confirmed — ${humanOrderNumber}`,
		body,
		ctaText: 'View your account details',
		ctaUrl: `${getBaseUrl()}/dashboard?tab=purchases`,
		userId: order.userId || null,
		notificationType: 'order_confirmation',
		referenceId: order.id,
		notificationId
	});
}
