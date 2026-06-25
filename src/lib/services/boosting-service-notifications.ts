import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from './email';
import { sendPushToUser } from './push-notifications';
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

	const notifiedSubscriptionIds = (
		await Promise.all(
			subscribers.map(async (subscriber) => {
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

				if (!emailResult.success) return null;

				await sendPushToUser(subscriber.userId, {
					title: `${serviceName} is now live`,
					body: 'Paste your link, pay, we deliver.',
					url: servicesUrl
				}).catch(() => {});

				return subscriber.id;
			})
		)
	).filter((id): id is string => id !== null);

	if (notifiedSubscriptionIds.length > 0) {
		await prisma.boostingServiceWaitlist.updateMany({
			where: { id: { in: notifiedSubscriptionIds } },
			data: { notifiedAt: new Date() }
		});
	}
}
