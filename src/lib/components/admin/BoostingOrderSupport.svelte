<script lang="ts">
	import { adminDialog } from '$lib/helpers/admin-dialog';
	import { getBoostSupportState, type BoostSupportState } from '$lib/helpers/boosting-support';
	import { boostOrderWorkflow } from '$lib/helpers/boosting-order-workflow';
	let {
		itemId,
		orderId,
		productName,
		support = null,
		held = false,
		canRequestLink = true,
		canManage = false,
		status,
		quantity = 1,
		onUpdated,
		previewAction
	}: {
		itemId: string;
		orderId: string;
		productName: string;
		support?: BoostSupportState | null;
		held?: boolean;
		canRequestLink?: boolean;
		canManage?: boolean;
		status?: string;
		quantity?: number;
		onUpdated: () => void | Promise<void>;
		previewAction?: (input: { action: string; message: string }) => void;
	} = $props();
	let action = $state<
		'request_link' | 'message' | 'confirm_delivery' | 'confirm_failure' | 'withdraw_link' | null
	>(null);
	let missingQuantity = $state(1);
	let message = $state('');
	let evidence = $state('');
	let confirmed = $state(false);
	let busy = $state(false);
	let error = $state('');
	let operationId = '';
	let operationBody = '';
	let refreshNeeded = $state(false);
	let savedUpdate = $state(false);
	const supportState = $derived(support ?? getBoostSupportState([]));
	const workflow = $derived(boostOrderWorkflow({ support: supportState, held, status }));
	const completionHint = $derived(
		evidence.trim().length < 10
			? 'Add a short evidence note (at least 10 characters).'
			: !confirmed
				? 'Tick the box to confirm the customer received the delivery.'
				: ''
	);
	const title = $derived(
		action === 'confirm_failure'
			? 'Confirm missing delivery'
			: action === 'withdraw_link'
				? 'Withdraw link request'
				: action === 'request_link'
					? 'Request a valid link'
					: action === 'confirm_delivery'
						? 'Mark delivery completed'
						: 'Send a customer update'
	);
	function open(next: typeof action) {
		action = next;
		message =
			next === 'confirm_failure'
				? 'We’ve confirmed missing delivery. Support is reviewing your order. You do not need to pay again.'
				: next === 'withdraw_link'
					? 'Support is reviewing a different resolution. You no longer need to send a new link.'
					: next === 'request_link'
						? 'Please send the correct public link for the service you ordered. We’ll review it before continuing.'
						: next === 'confirm_delivery'
							? 'Your delivery is confirmed. This review is closed.'
							: '';
		evidence = '';
		missingQuantity = quantity;
		confirmed = false;
		error = '';
		operationId = '';
		operationBody = '';
		refreshNeeded = false;
		savedUpdate = false;
	}
	function close() {
		if (!busy) action = null;
	}
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !action) return;
		if (refreshNeeded) {
			busy = true;
			error = '';
			try {
				await onUpdated();
				action = null;
			} catch {
				error = savedUpdate
					? 'Your update was saved, but the list could not refresh. Try Refresh review; do not submit the action again.'
					: 'The list could not refresh. Try again before changing this order.';
			} finally {
				busy = false;
			}
			return;
		}
		const body = {
			action,
			message: message.trim(),
			evidence: evidence.trim(),
			confirmed,
			...(action === 'confirm_failure' ? { quantity: missingQuantity } : {}),
			expectedRevision: supportState.revision
		};
		const encoded = JSON.stringify(body);
		if (encoded !== operationBody) {
			operationId = crypto.randomUUID();
			operationBody = encoded;
		}
		busy = true;
		error = '';
		try {
			if (previewAction) previewAction(body);
			else {
				const response = await fetch(
					`/api/admin/boosting-orders/${encodeURIComponent(itemId)}/support`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ ...body, operationId })
					}
				);
				const result = await response.json();
				if (!response.ok || !result.success) {
					refreshNeeded = response.status === 409;
					throw new Error(result.error || 'This update could not be confirmed.');
				}
			}
			savedUpdate = true;
			refreshNeeded = true;
			await onUpdated();
			action = null;
		} catch (cause) {
			error = savedUpdate
				? 'Your update was saved, but the list could not refresh. Use Refresh review; the action will not be sent twice.'
				: cause instanceof Error
					? cause.message
					: 'The result is uncertain. Retry the same action or refresh the order before changing it.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="support-actions" aria-label={`Support controls for ${productName}`}>
	{#if supportState.state === 'awaiting_customer'}
		<div class="support-status">
			<strong>Waiting for the customer’s link</strong>
			<p>{supportState.message}</p>
		</div>
	{:else if supportState.state === 'reply_received'}
		<div class="support-status">
			<strong>Customer supplied a new link</strong><a
				href={supportState.reply?.link}
				target="_blank"
				rel="noopener noreferrer">{supportState.reply?.link}</a
			>{#if supportState.reply?.note}<p>{supportState.reply.note}</p>{/if}
			<p class="muted">
				Saved for review only. The supplier target is unchanged; no order was resubmitted.
			</p>
		</div>
	{:else if supportState.state === 'resolved'}
		<div class="support-status">
			<strong>Review resolved by support</strong>
			<p>{supportState.message}</p>
		</div>
	{/if}
	{#if canManage}
		<div class="actions">
			{#if workflow.canResolve}
				<details class="resolution-menu">
					<summary class="primary"
						>{workflow.canWithdrawLink ? 'Change resolution' : 'Resolve order'}</summary
					>
					<div class="resolution-options">
						<a
							href={previewAction
								? '#preview-refunds'
								: `/admin/orders/${encodeURIComponent(orderId)}`}>Review refund options</a
						>
						{#if workflow.canRequestLink && canRequestLink}<button
								type="button"
								onclick={() => open('request_link')}>Request valid link</button
							>{/if}
						{#if workflow.canConfirmFailure}<button
								type="button"
								onclick={() => open('confirm_failure')}>Confirm delivery failed</button
							>{/if}
						{#if workflow.canConfirmDelivery}<button
								type="button"
								onclick={() => open('confirm_delivery')}>Mark completed</button
							>{/if}
						{#if workflow.canWithdrawLink}<button
								type="button"
								onclick={() => open('withdraw_link')}>Withdraw link request</button
							>{/if}
					</div>
				</details>
			{/if}
			<button type="button" onclick={() => open('message')}>Customer update</button>
			<a href={previewAction ? '#preview-refunds' : `/admin/orders/${encodeURIComponent(orderId)}`}
				>Order details</a
			>
		</div>
	{/if}
</section>

{#if action}
	<div class="dialog-backdrop">
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="support-action-title"
			tabindex="-1"
			use:adminDialog={close}
			class="support-dialog"
			aria-busy={busy}
		>
			<form onsubmit={submit}>
				<header>
					<div>
						<p class="muted">{productName}</p>
						<h2 id="support-action-title">{title}</h2>
					</div>
					<button type="button" onclick={close} disabled={busy} aria-label="Close support action"
						>✕</button
					>
				</header>
				<div class="dialog-fields">
					{#if action === 'confirm_failure'}
						<p class="muted">
							Records missing delivery—not supplier closure. This opens a support review; it does
							not place another supplier order or issue a refund.
						</p>
						<label
							>What failed and how did you check?<textarea
								bind:value={evidence}
								required
								minlength="10"
								maxlength="1000"
								rows="2"
								disabled={busy}
								placeholder="Record the delivery evidence you checked."
							></textarea></label
						>
						<label
							>Quantity still missing<input
								type="number"
								min="1"
								max={quantity}
								step="1"
								bind:value={missingQuantity}
								required
								disabled={busy}
							/></label
						>
						<label class="confirmation"
							><input type="checkbox" bind:checked={confirmed} required disabled={busy} />I checked
							the target link and confirmed this quantity was not delivered.</label
						>
					{:else if action === 'withdraw_link'}
						<p class="muted">
							Cancels the outstanding link request, not the paid order. You can then choose delivery
							confirmation or a refund. Neither happens automatically.
						</p>
					{:else if action === 'confirm_delivery'}
						<p class="muted">Closes this review. History and charges stay unchanged.</p>
						<label
							>What delivery evidence did you check?<textarea
								bind:value={evidence}
								minlength="10"
								maxlength="1000"
								required
								disabled={busy}
								rows="2"
								aria-describedby="completion-evidence-help"
								placeholder="For example: customer confirmed receipt; include the date and where you checked."
							></textarea></label
						>
						<p id="completion-evidence-help" class="muted evidence-help">
							Admin only · at least 10 characters.
						</p>
						<label class="confirmation"
							><input type="checkbox" bind:checked={confirmed} required disabled={busy} />I verified
							that the customer received the delivery—not just the supplier’s status.</label
						>
					{:else if action === 'request_link'}
						<p class="muted">
							Shown on the customer’s order and notifications. Their reply comes here for review; it
							does not resubmit the order.
						</p>
					{:else}
						<p class="muted">
							Shown on their order and notifications. No delivery change or email.
						</p>
					{/if}
					<label
						>Message the customer will see<textarea
							bind:value={message}
							minlength="5"
							maxlength="500"
							required
							disabled={busy}
							rows={action === 'confirm_delivery' ? 2 : 4}
						></textarea></label
					>
					{#if error}<p role="alert" class="error">{error}</p>{/if}
				</div>
				<footer>
					{#if action === 'confirm_delivery' && !refreshNeeded && completionHint}
						<p class="muted completion-hint" role="status">{completionHint}</p>
					{/if}
					<div class="dialog-buttons">
						<button type="button" onclick={close} disabled={busy}>Cancel</button><button
							class="primary"
							type="submit"
							disabled={busy ||
								(!refreshNeeded &&
									(message.trim().length < 5 ||
										((action === 'confirm_delivery' || action === 'confirm_failure') &&
											(!confirmed || evidence.trim().length < 10))))}
							>{busy
								? 'Saving…'
								: refreshNeeded
									? 'Refresh review'
									: action === 'confirm_failure'
										? 'Confirm failure'
										: action === 'withdraw_link'
											? 'Withdraw request'
											: action === 'confirm_delivery'
												? 'Confirm completion'
												: 'Send to customer'}</button
						>
					</div>
				</footer>
			</form>
		</div>
	</div>
{/if}

<style>
	.support-actions {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	button,
	summary,
	.actions a {
		min-height: 40px;
		border: 1px solid var(--border);
		border-radius: 9px;
		padding: 8px 12px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text);
		cursor: pointer;
	}
	button:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.primary {
		background: var(--primary);
		color: #00150b;
		border-color: var(--primary);
	}
	.resolution-options {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 8px;
	}
	.resolution-options button {
		text-align: left;
	}
	.resolution-menu[open] {
		flex-basis: 100%;
	}
	.resolution-menu summary {
		cursor: pointer;
	}
	input[type='number'] {
		display: block;
		margin-top: 6px;
		padding: 8px;
		width: 100%;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: 16px;
	}
	.support-status {
		margin-bottom: 12px;
		padding: 12px;
		border-radius: 10px;
		background: rgba(59, 130, 246, 0.08);
		border: 1px solid rgba(59, 130, 246, 0.25);
		font-size: 13px;
	}
	.support-status p,
	.support-status a {
		display: block;
		margin-top: 6px;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.support-status a {
		text-decoration: underline;
	}
	.muted {
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.6;
	}
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: #000b;
		display: grid;
		place-items: center;
		padding: 16px;
	}
	.support-dialog {
		width: min(540px, 100%);
		max-height: calc(100dvh - 32px);
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: var(--bg-elev-1);
		padding: 20px;
	}
	form {
		display: flex;
		flex-direction: column;
		max-height: calc(100dvh - 74px);
	}
	.dialog-fields {
		overflow-y: auto;
		min-height: 0;
		padding: 0 2px;
		overscroll-behavior: contain;
	}
	header {
		flex-shrink: 0;
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 10px;
	}
	h2 {
		font-size: 20px;
		font-weight: 700;
	}
	label {
		display: block;
		margin-top: 12px;
		font-size: 13px;
		font-weight: 600;
	}
	textarea {
		display: block;
		margin-top: 6px;
		width: 100%;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		padding: 10px;
		font-size: 16px;
		font-weight: 400;
		line-height: 1.4;
		color: var(--text);
		resize: vertical;
	}
	.confirmation {
		display: flex;
		gap: 10px;
		align-items: start;
		font-weight: 400;
		line-height: 1.6;
	}
	.confirmation input {
		margin-top: 4px;
		flex-shrink: 0;
	}
	footer {
		flex-shrink: 0;
		margin-top: 12px;
	}
	.dialog-buttons {
		display: flex;
		justify-content: end;
		gap: 10px;
	}
	.evidence-help {
		margin-top: 4px;
	}
	.completion-hint {
		margin-bottom: 8px;
	}
	.error {
		margin-top: 12px;
		font-size: 13px;
		color: var(--status-danger, #f87171);
	}
	@media (max-width: 480px) {
		.support-dialog {
			padding: 16px;
		}
		form {
			max-height: calc(100dvh - 66px);
		}
		footer button {
			flex: 1;
		}
	}
</style>
