export const BOOST_COMPLAINT_TYPES = ['nothing_delivered', 'delivery_stopped', 'dropped'] as const;
export type BoostComplaintType = (typeof BOOST_COMPLAINT_TYPES)[number];

export interface BoostComplaintEligibility {
	allowedTypes: BoostComplaintType[];
	refillEndsAt: string | null;
	note: string;
}

function snapshotRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function getBoostComplaintEligibility(input: {
	offerSnapshot: unknown;
	completedAt: Date | string | null;
	submittedAt?: Date | string | null;
	fulfillmentStatus?: string;
	paymentConfirmed: boolean;
	now?: Date;
}): BoostComplaintEligibility {
	if (!input.paymentConfirmed) {
		return { allowedTypes: [], refillEndsAt: null, note: 'Payment must be confirmed first.' };
	}
	const allowedTypes: BoostComplaintType[] = ['nothing_delivered', 'delivery_stopped'];
	const snapshot = snapshotRecord(input.offerSnapshot);
	const suppliedDays = Number(snapshot.refillDays);
	const refillDays =
		Number.isInteger(suppliedDays) && suppliedDays > 0 && suppliedDays <= 365 ? suppliedDays : 0;
	const completedAt = input.completedAt ? new Date(input.completedAt) : null;
	const now = input.now ?? new Date();
	let refillEndsAt: Date | null = null;
	const submittedAt = input.submittedAt ? new Date(input.submittedAt) : null;
	if (
		refillDays > 0 &&
		completedAt &&
		!Number.isNaN(completedAt.getTime()) &&
		(!input.fulfillmentStatus || input.fulfillmentStatus === 'completed')
	) {
		// Until a provider's clock is verified, use the earlier start and never extend protection.
		const start =
			submittedAt && !Number.isNaN(submittedAt.getTime())
				? Math.min(submittedAt.getTime(), completedAt.getTime())
				: completedAt.getTime();
		refillEndsAt = new Date(start + refillDays * 24 * 60 * 60 * 1000);
		if (now <= refillEndsAt) allowedTypes.push('dropped');
	}
	return {
		allowedTypes,
		refillEndsAt: refillEndsAt?.toISOString() ?? null,
		note: allowedTypes.includes('dropped')
			? 'Keep the original link and username unchanged.'
			: refillDays > 0
				? 'The refill window is no longer active. You can still report missing or stopped delivery.'
				: 'This choice did not include drop/refill protection. You can still report missing or stopped delivery.'
	};
}

export function canEscalateBoostRefill(input: {
	offerSnapshot: unknown;
	completedAt: Date | string | null;
	submittedAt?: Date | string | null;
	fulfillmentStatus: string;
	paymentConfirmed: boolean;
	originalTargetUrl: unknown;
	targetUrl: string;
	now?: Date;
}): boolean {
	return (
		input.originalTargetUrl === input.targetUrl &&
		getBoostComplaintEligibility(input).allowedTypes.includes('dropped')
	);
}

export function isBoostComplaintType(value: unknown): value is BoostComplaintType {
	return BOOST_COMPLAINT_TYPES.includes(value as BoostComplaintType);
}
