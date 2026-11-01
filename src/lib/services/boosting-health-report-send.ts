import { prisma } from '$lib/prisma';
import { getAdminEmails } from '$lib/auth/admin';
import { sendEmail } from '$lib/services/email';
import { buildBoostingHealthReport, formatBoostingHealthReport } from './boosting-health-report';

/** Build the report and email it to the admins. The owner asked for it to stay off Telegram. */
export async function sendBoostingHealthReport(now: Date = new Date()) {
	const report = await buildBoostingHealthReport(prisma, now);
	const text = formatBoostingHealthReport(report);
	const summary = {
		processed: report.orders.newOrders,
		failures: report.failures.reduce((sum, f) => sum + f.orders, 0),
		openComplaints: report.complaints.open,
		stuck: report.stuck.length
	};

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
