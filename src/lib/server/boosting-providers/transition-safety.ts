export interface BoostTransitionState {
	status: string;
	supplierOrderId: string | null;
	submittedAt: Date | null;
	leaseToken: string | null;
	leaseExpiresAt: Date | null;
	attempts: Array<{ type: string; outcome: string }>;
}

const DEFINITELY_SUBMITTED_STATUSES = new Set(['submitted', 'in_progress', 'completed']);
const UNCERTAIN_OR_ACCEPTED_OUTCOMES = new Set(['started', 'accepted', 'submission_unknown']);

/**
 * A target may only be changed or re-queued when we can prove no supplier order exists.
 * A definitive provider rejection is safe to retry; an in-flight/unknown attempt is not.
 */
export function supplierSubmissionMayExist(
	fulfillment: BoostTransitionState | null,
	now = new Date()
): boolean {
	if (!fulfillment) return false;
	if (fulfillment.supplierOrderId || fulfillment.submittedAt) return true;
	if (DEFINITELY_SUBMITTED_STATUSES.has(fulfillment.status)) return true;
	if (
		fulfillment.leaseToken &&
		fulfillment.leaseExpiresAt &&
		fulfillment.leaseExpiresAt.getTime() > now.getTime()
	)
		return true;
	const lastAttempt = fulfillment.attempts[0];
	return Boolean(
		lastAttempt?.type === 'submission' && UNCERTAIN_OR_ACCEPTED_OUTCOMES.has(lastAttempt.outcome)
	);
}
