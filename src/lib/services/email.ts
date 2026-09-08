import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { prisma } from '$lib/prisma';
import { normalizeTierDeliveryMode } from '$lib/helpers/tier-delivery-config';
import { BOOSTING_TURNAROUND_MESSAGE } from '$lib/helpers/boosting-service-config';
import { buildWhatsAppSupportLink } from '$lib/helpers/whatsapp';
import { getAdminSettingsSnapshot } from '$lib/services/admin-settings';
import emailHeaderDataUrl from '$lib/assets/fa-email-header.png?inline';
import { randomInt } from 'crypto';

export type EmailNotificationType =
	| 'verification'
	| 'welcome'
	| 'onboarding_step'
	| 'nurture_step'
	| 'abandoned_order'
	| 'order_confirmation'
	| 'order_delivery'
	| 'restock_alert'
	| 'boosting_service_live'
	| 'win_back'
	| 'affiliate_unlock'
	| 'affiliate_introduction'
	| 'affiliate_activation_nudge'
	| 'affiliate_bank_details_nudge'
	| 'affiliate_progress'
	| 'affiliate_store_credit'
	| 'affiliate_payout'
	| 'marketing_campaign'
	| 'numbers_launch'
	| 'promo_reminder'
	| 'admin_broadcast';

export type EmailClassification = 'transactional' | 'marketing' | 'operational';
type EmailNotificationStatus = 'pending' | 'sent' | 'failed' | 'suppressed';

interface SendEmailParams {
	to: string;
	subject: string;
	body: string;
	highlight?: string | null;
	highlightLabel?: string | null;
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

function normalizeEmailActionUrl(candidate: string | null | undefined): string | null {
	if (!candidate) return null;
	try {
		const url = new URL(candidate.trim());
		return url.protocol === 'https:' ? url.toString() : null;
	} catch {
		return null;
	}
}

export function renderEmailBody(content: string): string {
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
			const blocks: string[] = [];
			let paragraphLines: string[] = [];
			let bulletLines: string[] = [];
			let detailLines: Array<{ label: string; value: string }> = [];
			const flushParagraph = () => {
				if (paragraphLines.length === 0) return;
				blocks.push(
					`<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#cbd6d0;">${paragraphLines.join('<br>')}</p>`
				);
				paragraphLines = [];
			};
			const flushBullets = () => {
				if (bulletLines.length === 0) return;
				const items = bulletLines
					.map((line) => `<li style="margin:0 0 9px 0;padding-left:2px;">${line}</li>`)
					.join('');
				blocks.push(
					`<ul style="margin:0 0 18px 20px;padding:0;color:#cbd6d0;font-size:15px;line-height:1.55;">${items}</ul>`
				);
				bulletLines = [];
			};
			const flushDetails = () => {
				if (detailLines.length === 0) return;
				const rows = detailLines
					.map(
						({ label, value }, index) =>
							`<tr><td style="padding:${index === 0 ? '14px 14px 8px' : '8px 14px'};color:#8fa198;font-size:12px;line-height:1.4;">${label}</td><td align="right" style="padding:${index === 0 ? '14px 14px 8px' : '8px 14px'};color:#f4f7f5;font-size:13px;line-height:1.4;font-weight:700;">${value}</td></tr>`
					)
					.join('');
				blocks.push(
					`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px 0;border:1px solid #21362d;border-radius:10px;background:#09130e;">${rows}<tr><td colspan="2" style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`
				);
				detailLines = [];
			};

			for (const line of lines) {
				const bullet = line.match(/^(?:-|•)\s+(.+)$/);
				const detail = line.match(
					/^(Order|Amount|Amount paid|Requested amount|Request reference|Your code):\s+(.+)$/i
				);
				if (bullet) {
					flushParagraph();
					flushDetails();
					bulletLines.push(bullet[1]);
				} else if (detail) {
					flushParagraph();
					flushBullets();
					detailLines.push({ label: detail[1], value: detail[2] });
				} else if (/^<strong>.+<\/strong>$/.test(line)) {
					flushParagraph();
					flushBullets();
					flushDetails();
					blocks.push(
						`<p style="margin:4px 0 10px 0;color:#ffffff;font-size:15px;line-height:1.45;font-weight:700;">${line}</p>`
					);
				} else {
					flushBullets();
					flushDetails();
					paragraphLines.push(line);
				}
			}
			flushParagraph();
			flushBullets();
			flushDetails();
			return blocks.join('');
		})
		.join('');
}

const INBOX_REMINDER_LINE =
	'**Inbox tip:** Move Fast Accounts to Primary so you do not miss important updates.';

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
	if (params.notificationType === 'verification') return true;
	if (params.classification === 'marketing') return true;
	return params.notificationType === 'admin_broadcast' && Boolean(params.broadcastId);
}

function appendInboxReminderIfMissing(body: string): string {
	if (/not spam/i.test(body) && /primary/i.test(body)) return body;
	return `${body}\n\n${INBOX_REMINDER_LINE}`;
}

function getEmailEyebrow(params: SendEmailParams): string {
	if (params.classification === 'operational') return 'OPERATIONS';

	switch (params.notificationType) {
		case 'verification':
			return 'SECURITY';
		case 'order_confirmation':
		case 'order_delivery':
		case 'abandoned_order':
			return 'ORDER UPDATE';
		case 'affiliate_unlock':
		case 'affiliate_introduction':
		case 'affiliate_activation_nudge':
		case 'affiliate_bank_details_nudge':
		case 'affiliate_progress':
		case 'affiliate_store_credit':
		case 'affiliate_payout':
			return 'AFFILIATE';
		case 'restock_alert':
			return 'BACK IN STOCK';
		case 'boosting_service_live':
			return 'BOOSTING';
		case 'numbers_launch':
			return 'NUMBERS';
		case 'promo_reminder':
			return 'YOUR REWARD';
		case 'welcome':
		case 'onboarding_step':
		case 'nurture_step':
			return 'GET STARTED';
		default:
			return params.classification === 'marketing' ? 'FAST ACCOUNTS' : 'UPDATE';
	}
}

export function renderEmailTemplate(params: {
	firstName?: string | null;
	body: string;
	title?: string | null;
	eyebrow?: string | null;
	highlight?: string | null;
	highlightLabel?: string | null;
	preheader?: string | null;
	ctaText?: string | null;
	ctaUrl?: string | null;
	showCta?: boolean;
	marketingPreferenceUrl?: string | null;
}): string {
	const safeCtaUrl = normalizeEmailActionUrl(params.ctaUrl);
	const showCta = Boolean(params.showCta && params.ctaText && safeCtaUrl);
	const baseUrl = getBaseUrl();
	const supportEmail = env.SMTP_FROM_EMAIL || env.GMAIL_USER || 'support@fastaccs.com';
	const preheader = String(params.preheader || '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 160);
	const title = String(params.title || '').trim();
	const eyebrow = String(params.eyebrow || '').trim();
	const highlight = String(params.highlight || '').trim();
	const highlightLabel = String(params.highlightLabel || '').trim();
	const currentYear = new Date().getUTCFullYear();

	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
	<meta name="color-scheme" content="dark light" />
	<meta name="supported-color-schemes" content="dark light" />
	<style>
	  @media only screen and (max-width: 620px) {
		.fa-shell { padding: 16px 10px !important; }
		.fa-card-cell { padding: 24px 20px !important; }
		.fa-title { font-size: 25px !important; line-height: 1.2 !important; }
		.fa-cta { display: block !important; text-align: center !important; }
	  }
	</style>
  </head>
	<body style="margin:0;padding:0;background:#07100c;color:#f4f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
	${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
	<table class="fa-shell" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#07100c;">
      <tr>
        <td align="center">
		  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;">
            <tr>
			  <td align="center" style="padding:0 0 16px 0;line-height:1;">
				<img src="cid:${EMAIL_HEADER_CID}" alt="FAST ACCOUNTS — ALL SOCIALS. ONE PLUG." width="620" style="display:block;width:100%;max-width:620px;height:auto;border:1px solid #18382a;border-radius:16px;outline:none;text-decoration:none;color:#25B570;font-size:22px;font-weight:800;line-height:1.2;letter-spacing:0.6px;" />
              </td>
            </tr>
            <tr>
              <td>
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0e1713;border-radius:16px;border:1px solid #234435;overflow:hidden;box-shadow:0 14px 36px rgba(0,0,0,0.24);">
				  <tr>
					<td class="fa-card-cell" style="padding:32px;">
					  ${eyebrow ? `<div style="display:inline-block;margin:0 0 14px 0;padding:6px 10px;border:1px solid #246f4b;border-radius:999px;background:#102a1e;color:#55d996;font-size:11px;font-weight:800;line-height:1;letter-spacing:1.1px;">${escapeHtml(eyebrow)}</div>` : ''}
					  ${title ? `<h1 class="fa-title" style="margin:0 0 20px 0;color:#ffffff;font-size:29px;line-height:1.22;font-weight:800;letter-spacing:-0.5px;">${escapeHtml(title)}</h1>` : ''}
					  ${highlight ? `<div style="margin:0 0 20px 0;padding:18px;border:1px solid #246f4b;border-radius:12px;background:#09130e;text-align:center;">${highlightLabel ? `<div style="margin:0 0 8px 0;color:#8fa198;font-size:10px;font-weight:800;line-height:1;letter-spacing:1.2px;">${escapeHtml(highlightLabel)}</div>` : ''}<div style="color:#55d996;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:800;line-height:1.15;letter-spacing:5px;">${escapeHtml(highlight)}</div></div>` : ''}
					  ${params.firstName ? `<p style="margin:0 0 14px 0;color:#cbd6d0;font-size:15px;line-height:1.65;">Hi ${escapeHtml(params.firstName)},</p>` : ''}
                      ${params.body}
                      ${
												showCta
													? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;"><tr><td style="border-radius:10px;background:#25b570;">
						<a class="fa-cta" href="${escapeHtml(safeCtaUrl || '')}" style="display:inline-block;border-radius:10px;background:#25b570;color:#04140c;padding:14px 24px;font-size:15px;font-weight:800;line-height:1.2;text-decoration:none;">${escapeHtml(params.ctaText || '')} &rarr;</a>
					  </td></tr></table>`
													: ''
											}
                    </td>
                  </tr>
                  <tr>
					<td style="padding:20px 32px;border-top:1px solid #21362d;color:#8fa198;font-size:12px;line-height:1.65;background:#0a120f;">
					  <div style="color:#dce8e1;font-weight:700;">Need help?</div>
					  <div style="margin-top:5px;">
						<a href="https://wa.link/fast_accounts" style="color:#55d996;text-decoration:none;">WhatsApp</a>
						&nbsp;&nbsp;&middot;&nbsp;&nbsp;
						<a href="mailto:${escapeHtml(supportEmail)}" style="color:#55d996;text-decoration:none;">Email support</a>
					  </div>
					  ${
							params.marketingPreferenceUrl
								? `<div style="margin-top:12px;">You can stop optional emails at any time.</div>
					  <div style="margin-top:4px;"><a href="${escapeHtml(params.marketingPreferenceUrl)}" style="color:#aebcb5;text-decoration:underline;">Manage preferences or unsubscribe</a></div>`
								: ''
						}
					  <div style="margin-top:14px;color:#6f8178;">ALL SOCIALS. ONE PLUG.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
			<tr>
			  <td align="center" style="padding:16px 12px 0;color:#62736a;font-size:11px;line-height:1.5;">
				&copy; ${currentYear} FA Technologies LTD &nbsp;&middot;&nbsp; <a href="${baseUrl}" style="color:#7f9389;text-decoration:none;">smm.fastaccs.com</a>
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

	const bodyHtml = renderEmailBody(body);
	const html = renderEmailTemplate({
		body: bodyHtml,
		title: subject,
		eyebrow: getEmailEyebrow(params),
		highlight: params.highlight || null,
		highlightLabel: params.highlightLabel || null,
		preheader: subject,
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
					userId: params.userId || null,
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
				userId: params.userId || null,
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
				userId: params.userId || null,
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
		subject: 'Welcome — your account is ready',
		body: `Hi ${firstName},

Welcome to Fast Accounts.

- Buy ready-to-use social accounts
- Get verification numbers
- Add followers, likes, and views

Everything stays in one dashboard.`,
		ctaText: 'Explore Fast Accounts',
		ctaUrl: getBaseUrl(),
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
			category: { metadata: unknown } | null;
			boostTargetUrl: string | null;
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
				orderItems: {
					include: {
						category: {
							select: { metadata: true }
						}
					}
				},
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
			`- ${item.productName} x${item.quantity} (₦${Number(item.totalPrice).toLocaleString('en-US')})`
	);
	const normalizedOrderSuffix = order.orderNumber.replace(/^ORD-?/i, '');
	const humanOrderNumber = `FA-${normalizedOrderSuffix}`;

	const isBoosting = order.orderItems.some((item) => Boolean(item.boostTargetUrl));
	const isPhone =
		!isBoosting &&
		order.orderItems.some(
			(item) =>
				normalizeTierDeliveryMode(
					(item.category?.metadata as Record<string, unknown> | null)?.delivery_mode
				) === 'auto_sms'
		);
	const isManualHandover =
		!isBoosting &&
		!isPhone &&
		order.orderItems.some(
			(item) =>
				normalizeTierDeliveryMode(
					(item.category?.metadata as Record<string, unknown> | null)?.delivery_mode
				) === 'manual_handover'
		);

	const orderSummary = `Your payment was successful and your order has been confirmed.

Order: ${humanOrderNumber}
Amount paid: ₦${Number(order.totalAmount).toLocaleString('en-US')}

Items:
${itemLines.join('\n')}`;

	const waMessage = `Hi, I'm sending my payment receipt for order ${humanOrderNumber}.`;
	const settings = isManualHandover ? await getAdminSettingsSnapshot().catch(() => null) : null;
	const waLink =
		buildWhatsAppSupportLink(settings?.business.whatsappNumber, waMessage) ||
		'https://wa.link/fast_accounts';

	const body = isBoosting
		? `${orderSummary}

Your boost is now queued and will begin processing shortly. ${BOOSTING_TURNAROUND_MESSAGE} Track its status anytime from your order page.`
		: isPhone
			? `${orderSummary}

Open your order page to see your number and get your one-time code — it appears automatically once it arrives. If no code comes through within the activation window, you're automatically refunded to your store credit.`
			: isManualHandover
				? `${orderSummary}

This is a manual handover order. To receive your full account login details, send your payment receipt to our team on WhatsApp. Tap the button below — your order number is pre-filled.`
				: `${orderSummary}

Your account details are ready. Open your dashboard to view your login. Anything off? Message support and we'll sort it fast.`;

	const ctaText = isBoosting
		? 'View order status'
		: isPhone
			? 'View your number'
			: isManualHandover
				? 'Send receipt on WhatsApp'
				: 'View account details';
	const ctaUrl = isBoosting
		? `${getBaseUrl()}/order/${order.id}`
		: isPhone
			? `${getBaseUrl()}/order/${order.id}`
			: isManualHandover
				? waLink
				: `${getBaseUrl()}/dashboard?tab=purchases`;

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
		ctaText,
		ctaUrl,
		userId: order.userId || null,
		notificationType: 'order_confirmation',
		referenceId: order.id,
		notificationId
	});
}
