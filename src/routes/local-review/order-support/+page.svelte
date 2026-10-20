<script lang="ts">
	import BoostingOrderSupport from '$lib/components/admin/BoostingOrderSupport.svelte';
	import BoostingSupportReply from '$lib/components/BoostingSupportReply.svelte';
	import { getBoostSupportState, type BoostSupportState } from '$lib/helpers/boosting-support';
	import { validateLinkForAction } from '$lib/helpers/social-link-validator';
	const itemId = '11111111-1111-4111-8111-111111111111',
		orderId = '22222222-2222-4222-8222-222222222222';
	let support = $state<BoostSupportState>(getBoostSupportState([]));
	let resolved = $state(false),
		showAll = $state(false),
		latestMessage = $state('');
	function act(input: { action: string; message: string }) {
		if (input.action === 'message') {
			latestMessage = input.message;
			return;
		}
		const id = crypto.randomUUID();
		if (input.action === 'request_link')
			support = {
				revision: id,
				state: 'awaiting_customer',
				requestId: id,
				message: input.message,
				updatedAt: new Date().toISOString(),
				reply: null
			};
		else {
			support = {
				revision: id,
				state: 'resolved',
				requestId: null,
				message: input.message,
				updatedAt: new Date().toISOString(),
				reply: null
			};
			resolved = true;
		}
	}
	function reply(link: string) {
		const checked = validateLinkForAction('instagram', 'followers', link);
		if (!checked.valid || !checked.normalizedUrl)
			throw new Error(checked.reason || 'Enter a public Instagram profile link.');
		support = {
			...support,
			revision: crypto.randomUUID(),
			state: 'reply_received',
			reply: { link: checked.normalizedUrl, note: null }
		};
	}
</script>

<svelte:head
	><title>Order support preview | Local review</title><meta
		name="robots"
		content="noindex, nofollow"
	/></svelte:head
>
<main class="preview">
	<header>
		<p class="eyebrow">LOCAL PREVIEW · FICTIONAL ORDER</p>
		<h1>Resolve the review. Keep the customer informed.</h1>
		<p>
			No database, supplier, payment, email or production changes. Reloading resets this example.
		</p>
	</header>
	<div class="preview-grid">
		<section aria-label="Admin preview">
			<div class="section-heading">
				<h2>Your admin view</h2>
				<button
					onclick={() => {
						showAll = !showAll;
					}}>{showAll ? 'Show active reviews' : 'Show all orders'}</button
				>
			</div>
			<p class="count">Active reviews: {resolved ? 0 : 1}</p>
			{#if !resolved || showAll}<article>
					<div class="item-header">
						<strong>Instagram Followers</strong><span
							>{resolved
								? 'Completed'
								: support.state === 'awaiting_customer'
									? 'Needs customer link'
									: 'Needs review'}</span
						>
					</div>
					<p class="muted">500 followers · DEMO-ORDER · customer example</p>
					<div class="review-reason">
						<strong
							>{resolved ? 'Delivery confirmed by support' : 'Why this order needs review'}</strong
						>
						<p>
							{resolved
								? 'You recorded delivery evidence and resolved this review. It is no longer in the active queue.'
								: 'Supplier reported cancellation. Review delivery and the customer’s payment before resolving.'}
						</p>
					</div>
					<p class="muted">
						Supplier last reported: Cancelled. Historical result and charges are preserved.
					</p>
					<BoostingOrderSupport
						{itemId}
						{orderId}
						productName="Instagram Followers"
						{support}
						held={!resolved}
						canManage
						onUpdated={() => {}}
						previewAction={act}
					/>
				</article>
			{:else}<article class="empty">
					<strong>No active reviews.</strong>
					<p>This order is kept in history, not deleted.</p>
					<button
						onclick={() => {
							showAll = true;
						}}>Show completed order</button
					>
				</article>{/if}
		</section>
		<section aria-label="Customer preview">
			<h2>What the customer sees</h2>
			<article>
				<div class="item-header">
					<strong>Instagram Followers</strong><span
						>{resolved
							? 'Completed'
							: support.state === 'awaiting_customer'
								? 'Action needed'
								: 'Under review'}</span
					>
				</div>
				<p class="muted">Payment confirmed · 500 followers</p>
				{#if latestMessage}<div class="customer-message">
						<strong>Update from support</strong>
						<p>{latestMessage}</p>
					</div>{/if}{#if support.state === 'none'}<p class="muted">
						We’re reviewing this order. No need to buy again.
					</p>{:else}{#key support.revision}<BoostingSupportReply
							{support}
							{itemId}
							{orderId}
							previewReply={reply}
						/>{/key}{/if}
			</article>
		</section>
	</div>
	<p id="preview-refunds" class="muted">
		Refunds use the existing order-details flow with its own confirmation. No refund is performed by
		this demo or by closing a review.
	</p>
</main>

<style>
	.preview {
		max-width: 1180px;
		margin: auto;
		padding: 36px 20px 64px;
		color: var(--text);
	}
	header {
		margin-bottom: 32px;
		max-width: 760px;
	}
	h1 {
		font-size: clamp(24px, 4vw, 34px);
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.03em;
		margin: 10px 0 12px;
	}
	header > p:last-child,
	.muted {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-muted);
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 0.15em;
		color: var(--primary);
		font-weight: 700;
	}
	.preview-grid {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 28px;
		margin-bottom: 24px;
	}
	h2 {
		font-size: 16px;
		font-weight: 700;
		margin-bottom: 16px;
	}
	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: 12px;
	}
	.section-heading button,
	.empty button {
		border: 1px solid var(--border);
		border-radius: 9px;
		padding: 8px 10px;
		font-size: 12px;
		cursor: pointer;
	}
	.count {
		color: var(--text-muted);
		font-size: 12px;
		margin: -8px 0 14px;
	}
	article {
		padding: 22px;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--bg-elev-1);
	}
	.item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 8px;
	}
	.item-header > strong {
		font-size: 14px;
	}
	.item-header span {
		font-size: 11px;
		color: var(--primary);
		background: #10b98115;
		border-radius: 6px;
		padding: 4px 8px;
		white-space: nowrap;
	}
	.review-reason {
		margin: 18px 0;
		padding: 14px;
		border: 1px solid #f59e0b44;
		border-radius: 10px;
		background: #f59e0b0b;
		font-size: 12px;
		line-height: 1.6;
	}
	.review-reason p {
		margin-top: 6px;
		color: var(--text-muted);
	}
	.customer-message {
		margin-top: 16px;
		font-size: 13px;
		line-height: 1.6;
	}
	.customer-message p {
		white-space: pre-wrap;
		color: var(--text-muted);
		margin-top: 6px;
	}
	.empty p {
		font-size: 13px;
		color: var(--text-muted);
		margin: 10px 0 16px;
	}
	@media (max-width: 760px) {
		.preview-grid {
			grid-template-columns: 1fr;
		}
		.preview {
			padding: 24px 16px 48px;
		}
		article {
			padding: 18px;
		}
	}
</style>
