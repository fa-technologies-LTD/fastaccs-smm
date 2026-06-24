import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from './email';
import { env } from '$env/dynamic/private';

export async function triggerBoostingWaitlistNotifications(
	serviceId: string,
	serviceName: string
): Promise<void> {
	const subscribers = await prisma.boostingServiceWaitlist.findMany({
		where: {
			serviceId,
			notifiedAt: null
		}
	});

	if (subscribers.length === 0) return;

	const baseUrl = (
		env.PUBLIC_BASE_URL ||
		process.env.PUBLIC_BASE_URL ||
		'https://smm.fastaccs.com'
	).replace(/\/+$/, '');
	const servicesUrl = `${baseUrl}/services`;

	for (const subscriber of subscribers) {
		const emailResult = await sendMarketingEmail({
			to: subscriber.email,
			subject: `${serviceName} is now live`,
			body: `${serviceName} is now available. Paste your link, pay, we deliver.`,
			ctaText: 'Browse Boosting Services',
			ctaUrl: servicesUrl,
			userId: subscriber.userId,
			notificationType: 'boosting_service_live',
			referenceId: serviceId,
			campaignKey: `boosting-waitlist:${subscriber.id}`
		});

		if (emailResult.success) {
			await prisma.boostingServiceWaitlist.update({
				where: { id: subscriber.id },
				data: { notifiedAt: new Date() }
			});
		}
	}
}
