import { prisma } from '$lib/prisma';
import { getAdminEmails } from '$lib/auth/admin';
import { sendEmail } from '$lib/services/email';
import { botConfigured, botSend } from '$lib/server/autopilot/bot';
import { getAutopilotSettings } from '$lib/server/autopilot/state';
import { buildBoostingHealthReport, formatBoostingHealthReport } from './boosting-health-report';

/** Build the report and send it to the owner's Telegram bot, or by email if the bot isn't connected. */
export async function sendBoostingHealthReport(now: Date = new Date()) {
	const report = await buildBoostingHealthReport(prisma, now);
	const text = formatBoostingHealthReport(report);
	const summary = {
		processed: report.orders.newOrders,
		failures: report.failures.reduce((sum, f) => sum + f.orders, 0),
		openComplaints: report.complaints.open,
		stuck: report.stuck.length
	};

	const settings = await getAutopilotSettings().catch(() => null);
	if (botConfigured() && settings?.ownerChatId) {
		try {
			await botSend(settings.ownerChatId, text);
			return { ...summary, sentTo: 'telegram' };
		} catch (error) {
			console.error('[boosting-health-report] Telegram send failed, falling back to email:', error);
		}
	}
	let emailed = 0;
	for (const email of getAdminEmails()) {
		const result = await sendEmail({
			to: email,
			subject: `Boosting check — ${report.orders.delivered} delivered, ${summary.failures} failed, ${summary.openComplaints} open reports`,
			body: text,
			notificationType: 'admin_broadcast',
			classification: 'operational',
			showCta: false
		});
		if (result.success) emailed += 1;
	}
	return { ...summary, sentTo: emailed ? 'email' : 'none', emailed };
}
