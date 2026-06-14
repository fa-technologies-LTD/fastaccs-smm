import type { Prisma } from '@prisma/client';
import { RATE_LIMIT_NOTIFICATION_TYPES } from '$lib/auth/rate-limit';

// "Failed" email_notifications rows that aren't real send failures:
// rate-limit bookkeeping (auth/restock-notify) and verification-code attempt
// logs (notificationType: 'verification', referenceId: 'code_attempt').
// Email-health metrics (admin dashboard issues, weekly digest) must exclude these.
export const EMAIL_FAILURE_NOISE_FILTER: Prisma.EmailNotificationWhereInput = {
	notificationType: { notIn: [...RATE_LIMIT_NOTIFICATION_TYPES] },
	NOT: {
		notificationType: 'verification',
		referenceId: 'code_attempt'
	}
};
