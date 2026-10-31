import type { BoostSupportState } from './boosting-support';

export interface BoostOrderWorkflowInput {
	support: Pick<BoostSupportState, 'state'>;
	status?: string;
	held: boolean;
	refunded?: boolean;
}
/** One action policy for the screen and write endpoint; a message never changes delivery. */
export function boostOrderWorkflow(input: BoostOrderWorkflowInput) {
	const waiting = input.support.state === 'awaiting_customer' || input.status === 'needs_link';
	const completed =
		(input.status === 'completed' || input.support.state === 'resolved') && !input.held;
	const refunded = Boolean(input.refunded) || input.status === 'refunded';
	const terminal = refunded || completed;
	return {
		state: refunded
			? 'refunded'
			: waiting
				? 'waiting_link'
				: input.support.state === 'reply_received'
					? 'link_received'
					: completed
						? 'completed'
						: input.held
							? 'needs_review'
							: 'delivering',
		canRequestLink: !terminal && !waiting && input.held,
		// A manager may finish an item that they delivered outside the automated supplier path.
		// The write endpoint applies the stronger acknowledgement and concurrency guards.
		canConfirmDelivery: !terminal && !waiting,
		canConfirmFailure: !terminal && !waiting,
		canWithdrawLink: waiting && !terminal,
		canResolve: !terminal
	};
}
