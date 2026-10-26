/**
 * One on-brand question at a time, answered in the page instead of the browser's own confirm box.
 * `askDecision` resolves true for the confirm action and false for cancel, Escape or the backdrop.
 * The host (DecisionHost) is mounted once in the root layout.
 */
export interface DecisionRequest {
	title: string;
	message: string;
	confirmLabel: string;
	cancelLabel: string;
	/** `danger` when confirming throws something away. The safe choice is always the default. */
	tone?: 'neutral' | 'danger';
}

interface PendingDecision extends DecisionRequest {
	resolve: (confirmed: boolean) => void;
}

let pending = $state<PendingDecision | null>(null);

export const decision = {
	get current(): PendingDecision | null {
		return pending;
	},
	answer(confirmed: boolean): void {
		const open = pending;
		pending = null;
		open?.resolve(confirmed);
	}
};

export function askDecision(request: DecisionRequest): Promise<boolean> {
	// A newer question replaces an unanswered one, which counts as "cancel".
	pending?.resolve(false);
	return new Promise((resolve) => {
		pending = { ...request, resolve };
	});
}
