export const BOOST_SUPPORT_EVENT_TYPES = [
	'boosting_support_requested',
	'boosting_support_replied',
	'boosting_support_resolved'
] as const;

export interface BoostSupportEvent {
	id: string;
	type: string;
	description: string | null;
	metadata: unknown;
	occurredAt: Date | string;
}

export interface BoostSupportState {
	revision: string | null;
	state: 'none' | 'awaiting_customer' | 'reply_received' | 'resolved';
	requestId: string | null;
	message: string | null;
	updatedAt: string | null;
	reply: { link: string; note: string | null } | null;
}

const text = (value: unknown, max: number) =>
	typeof value === 'string' ? value.slice(0, max) : null;
export function getBoostSupportState(events: BoostSupportEvent[]): BoostSupportState {
	const state: BoostSupportState = {
		revision: null,
		state: 'none',
		requestId: null,
		message: null,
		updatedAt: null,
		reply: null
	};
	const relevant = events
		.filter((event) => BOOST_SUPPORT_EVENT_TYPES.includes(event.type as never))
		.filter((event) => Number.isFinite(new Date(event.occurredAt).getTime()))
		.sort(
			(a, b) =>
				new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() ||
				a.id.localeCompare(b.id)
		);
	for (const event of relevant) {
		const metadata =
			event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
				? (event.metadata as Record<string, unknown>)
				: {};
		if (event.type === 'boosting_support_requested') {
			state.state = 'awaiting_customer';
			state.requestId = event.id;
			state.message = text(event.description, 500);
			state.reply = null;
		} else if (event.type === 'boosting_support_replied') {
			if (metadata.requestId !== state.requestId || state.state !== 'awaiting_customer') continue;
			const link = text(metadata.link, 2048);
			if (!link || !/^https:\/\//i.test(link)) continue;
			state.state = 'reply_received';
			state.reply = { link, note: text(event.description, 500) };
		} else {
			state.state = 'resolved';
			state.requestId = null;
			state.message = text(event.description, 500);
			state.reply = null;
		}
		state.revision = event.id;
		state.updatedAt = new Date(event.occurredAt).toISOString();
	}
	return state;
}

/** A support deadline is not evidence that delivery is still running. */
export function boostReviewNotice(reason: string | null | undefined): string {
	if (reason === 'provider_cancelled' || reason === 'provider_refunded')
		return 'Supplier reported cancellation. Review delivery and the customer’s payment before resolving.';
	if (reason === 'provider_failed')
		return 'Supplier reported failure. Review delivery and the customer’s payment before resolving.';
	if (reason === 'provider_partial')
		return 'Supplier reported partial delivery. Check what the customer received before resolving.';
	return '24-hour review due. Check the latest delivery evidence; elapsed time alone does not confirm failure.';
}
