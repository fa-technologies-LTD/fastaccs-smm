<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		id,
		title,
		reference,
		status,
		statusStyle = '',
		metadata,
		nextStep = '',
		open = false,
		onToggle,
		children
	}: {
		id: string;
		title: string;
		reference: string;
		status: string;
		statusStyle?: string;
		metadata: string;
		nextStep?: string;
		open?: boolean;
		onToggle: () => void;
		children: Snippet;
	} = $props();
</script>

<article class="review-order" class:expanded={open} aria-label={`${title} · ${reference}`}>
	<h2>
		<button
			type="button"
			class="order-preview"
			aria-expanded={open}
			aria-controls={`order-detail-${id}`}
			aria-label={`${open ? 'Close' : 'Open'} ${title} · ${reference}`}
			onclick={onToggle}
		>
			<span class="preview-heading"
				><span class="service">{title}</span><span class="status" style={statusStyle}>{status}</span
				></span
			>
			<span class="metadata">{metadata}</span>
			{#if nextStep && !open}<span class="next-step">{nextStep}</span>{/if}
			<span class="preview-footer"
				><span class="reference">#{reference.split('-').at(-1)}</span><span class="affordance"
					>{open ? 'Close details' : 'View details'}
					<span class="chevron" aria-hidden="true">{open ? '−' : '+'}</span></span
				></span
			>
		</button>
	</h2>
	<div id={`order-detail-${id}`} hidden={!open}>
		{#if open}<div class="order-detail">{@render children()}</div>{/if}
	</div>
</article>

<style>
	.review-order {
		min-width: 0;
		border: 1px solid color-mix(in srgb, var(--text-muted) 32%, var(--border));
		border-radius: 16px;
		background: var(--bg-elev-1);
		box-shadow: 0 3px 12px #00000012;
		overflow: hidden;
	}
	.review-order.expanded {
		border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
	}
	h2 {
		margin: 0;
		font-size: inherit;
	}
	.order-preview {
		display: flex;
		flex-direction: column;
		gap: 9px;
		width: 100%;
		padding: 18px 20px;
		text-align: left;
		color: var(--text);
		cursor: pointer;
	}
	.order-preview:hover {
		background: color-mix(in srgb, var(--text) 3%, transparent);
	}
	.order-preview:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: -4px;
		border-radius: 15px;
	}
	.preview-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 12px;
	}
	.service {
		font-size: 15px;
		font-weight: 650;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.status {
		flex-shrink: 0;
		max-width: 48%;
		padding: 3px 7px;
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 10px;
		font-weight: 650;
		line-height: 1.5;
		text-align: center;
	}
	.metadata {
		font-size: 12px;
		font-weight: 400;
		line-height: 1.5;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.next-step {
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 13px;
		font-weight: 400;
		line-height: 1.5;
		color: var(--text);
	}
	.preview-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 3px;
		font-size: 11px;
		font-weight: 500;
	}
	.reference {
		color: var(--text-dim);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.affordance {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
		color: var(--primary);
	}
	.chevron {
		font-size: 18px;
		line-height: 16px;
	}
	.order-detail {
		border-top: 1px solid var(--border);
		padding: 20px;
		background: color-mix(in srgb, var(--bg) 40%, var(--bg-elev-1));
	}
	@media (max-width: 480px) {
		.order-preview {
			padding: 16px;
		}
		.order-detail {
			padding: 16px;
		}
	}
</style>
