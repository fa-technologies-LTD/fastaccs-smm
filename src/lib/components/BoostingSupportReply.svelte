<script lang="ts">
	import type { BoostSupportState } from '$lib/helpers/boosting-support';
	let {
		support,
		orderId,
		itemId,
		previewReply,
		onSubmitted
	}: {
		support: BoostSupportState;
		orderId: string;
		itemId: string;
		previewReply?: (link: string) => void;
		onSubmitted?: () => void | Promise<void>;
	} = $props();
	let link = $state(''),
		note = $state(''),
		busy = $state(false),
		error = $state('');
	let sent = $state(false);
	let operationId = '',
		encoded = '';
	async function reply(event: SubmitEvent) {
		event.preventDefault();
		if (busy || sent) return;
		const input = {
			link: link.trim(),
			note: note.trim(),
			requestId: support.requestId,
			expectedRevision: support.revision
		};
		const body = JSON.stringify(input);
		if (body !== encoded) {
			operationId = crypto.randomUUID();
			encoded = body;
		}
		busy = true;
		error = '';
		try {
			if (previewReply) previewReply(input.link);
			else {
				const response = await fetch(
					`/api/orders/${encodeURIComponent(orderId)}/boosting-support/${encodeURIComponent(itemId)}`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ ...input, operationId })
					}
				);
				const result = await response.json();
				if (!response.ok || !result.success)
					throw new Error(result.error || 'Your reply could not be confirmed.');
			}
			sent = true;
			try {
				await onSubmitted?.();
			} catch {
				/* The reply is saved even if refreshing the order fails. */
			}
		} catch (cause) {
			error =
				cause instanceof Error
					? cause.message
					: 'Your reply could not be confirmed. Retry the same reply or refresh your order.';
		} finally {
			busy = false;
		}
	}
</script>

{#if support.state !== 'none'}
	<section class="customer-support" aria-label="Help with this delivery">
		{#if sent || support.state === 'reply_received'}
			<h5>Link received — we’ll review it</h5>
			<p>
				You don’t need to place another order. Your original order stays unchanged while support
				checks your link.
			</p>
		{:else if support.state === 'awaiting_customer'}
			<h5>Action needed: send a valid link</h5>
			<p>{support.message}</p>
			<form onsubmit={reply}>
				<label for={`support-link-${itemId}`}>Your public link</label><input
					id={`support-link-${itemId}`}
					type="url"
					bind:value={link}
					required
					maxlength="2048"
					placeholder="https://…"
					disabled={busy}
				/>
				<label for={`support-note-${itemId}`}>Note for support <span>(optional)</span></label
				><textarea
					id={`support-note-${itemId}`}
					bind:value={note}
					maxlength="500"
					rows="2"
					disabled={busy}
				></textarea>
				<p class="hint">
					Send only a public link. Never send passwords or verification codes. Support will review
					it before taking further action.
				</p>
				{#if error}<p role="alert">{error}</p>{/if}
				<button type="submit" disabled={busy || !link.trim()}
					>{busy ? 'Sending…' : 'Send link for review'}</button
				>
			</form>
		{:else if support.state === 'resolved'}
			<h5>Review resolved</h5>
			<p>{support.message}</p>
		{/if}
	</section>
{/if}

<style>
	.customer-support {
		margin-top: 16px;
		padding: 16px;
		border: 1px solid #3b82f644;
		border-radius: 12px;
		background: #3b82f60b;
	}
	h5 {
		font-size: 14px;
		font-weight: 700;
	}
	p {
		margin-top: 8px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-muted);
		white-space: pre-wrap;
	}
	label {
		display: block;
		margin-top: 14px;
		font-size: 13px;
		font-weight: 600;
	}
	label span {
		color: var(--text-muted);
		font-weight: 400;
	}
	input,
	textarea {
		display: block;
		margin-top: 6px;
		width: 100%;
		padding: 11px;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--bg);
		color: var(--text);
		font-size: 14px;
	}
	.hint {
		font-size: 11px;
	}
	button {
		margin-top: 14px;
		min-height: 44px;
		padding: 10px 16px;
		border-radius: 9px;
		background: var(--primary);
		color: #00150b;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	[role='alert'] {
		color: var(--status-danger, #f87171);
	}
</style>
