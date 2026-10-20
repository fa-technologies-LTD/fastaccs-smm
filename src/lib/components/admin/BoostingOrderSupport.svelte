<script lang="ts">
	import { adminDialog } from '$lib/helpers/admin-dialog';
	import { getBoostSupportState, type BoostSupportState } from '$lib/helpers/boosting-support';
	let {
		itemId,
		orderId,
		productName,
		support = null,
		held = false,
		canRequestLink = true,
		canManage = false,
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
		onUpdated: () => void | Promise<void>;
		previewAction?: (input: { action: string; message: string }) => void;
	} = $props();
	let action = $state<'request_link' | 'message' | 'confirm_delivery' | null>(null);
	let message = $state('');
	let evidence = $state('');
	let confirmed = $state(false);
	let busy = $state(false);
	let error = $state('');
	let operationId = '';
	let operationBody = '';
	let refreshNeeded = $state(false);
	const supportState = $derived(support ?? getBoostSupportState([]));
	const title = $derived(
		action === 'request_link'
			? 'Request a valid link'
			: action === 'confirm_delivery'
				? 'Mark delivery completed'
				: 'Send a customer update'
	);
	function open(next: typeof action) {
		action = next;
		message =
			next === 'request_link'
				? 'Please send the correct public link for the service you ordered. We’ll review it before continuing.'
				: next === 'confirm_delivery'
					? 'Support has confirmed that your order was delivered. This review is now closed.'
					: '';
		evidence = '';
		confirmed = false;
		error = '';
		operationId = '';
		operationBody = '';
		refreshNeeded = false;
	}
	function close() {
		if (!busy) action = null;
	}
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !action) return;
		if (refreshNeeded) {
			await onUpdated();
			action = null;
			return;
		}
		const body = {
			action,
			message: message.trim(),
			evidence: evidence.trim(),
			confirmed,
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
			action = null;
			await onUpdated();
		} catch (cause) {
			error =
				cause instanceof Error
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
			<strong>Customer replied — review their link</strong><a
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
			<button type="button" onclick={() => open('message')}>Customer update</button>
			{#if held}
				{#if canRequestLink}<button type="button" onclick={() => open('request_link')}
						>Request valid link</button
					>{/if}
				<button type="button" class="primary" onclick={() => open('confirm_delivery')}
					>Mark completed</button
				>
			{/if}
			<a href={previewAction ? '#preview-refunds' : `/admin/orders/${encodeURIComponent(orderId)}`}
				>Refund / order details</a
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
				{#if action === 'confirm_delivery'}
					<p class="muted">
						Completes this delivery and closes its review together. It leaves the active list and
						stays in history. The whole order is completed when all its deliveries are complete.
						Recorded charges stay unchanged. If delivery did not happen, use Refund / order details.
					</p>
					<label
						>What delivery evidence did you check? <span class="muted">(admin only)</span><textarea
							bind:value={evidence}
							minlength="10"
							maxlength="1000"
							required
							disabled={busy}
							rows="3"
							placeholder="For example: customer confirmed receipt; include the date and where you checked."
						></textarea></label
					>
					<label class="confirmation"
						><input type="checkbox" bind:checked={confirmed} required disabled={busy} />I checked
						that the customer received the delivery. A supplier’s status alone is not proof.</label
					>
				{:else if action === 'request_link'}
					<p class="muted">
						The customer sees this request on their order and in their notification bell. Their
						reply comes back here for review; it will not change or resubmit the supplier order.
					</p>
				{:else}
					<p class="muted">
						Shown on the customer’s order and in their notification bell. This does not change
						delivery or send an email.
					</p>
				{/if}
				<label
					>Message the customer will see<textarea
						bind:value={message}
						minlength="5"
						maxlength="500"
						required
						disabled={busy}
						rows="4"
					></textarea></label
				>
				{#if error}<p role="alert" class="error">{error}</p>{/if}
				<footer>
					<button type="button" onclick={close} disabled={busy}>Cancel</button><button
						class="primary"
						type="submit"
						disabled={busy ||
							(!refreshNeeded &&
								(message.trim().length < 5 ||
									(action === 'confirm_delivery' && (!confirmed || evidence.trim().length < 10))))}
						>{busy
							? 'Saving…'
							: refreshNeeded
								? 'Refresh review'
								: action === 'confirm_delivery'
									? 'Confirm completion'
									: 'Send to customer'}</button
					>
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
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: var(--bg-elev-1);
		padding: 24px;
	}
	header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
	}
	h2 {
		font-size: 20px;
		font-weight: 700;
	}
	label {
		display: block;
		margin-top: 16px;
		font-size: 13px;
		font-weight: 600;
	}
	textarea {
		display: block;
		margin-top: 8px;
		width: 100%;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		padding: 12px;
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
		margin-top: 20px;
		display: flex;
		justify-content: end;
		gap: 10px;
	}
	.error {
		margin-top: 12px;
		font-size: 13px;
		color: var(--status-danger, #f87171);
	}
	@media (max-width: 480px) {
		.support-dialog {
			padding: 18px;
		}
		footer {
			flex-wrap: wrap;
		}
		footer button {
			flex: 1;
		}
	}
</style>
