<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '$lib/icons';
	import { NOTICE_LOOK, toneStyle, type NoticeKind } from '$lib/notify/kinds';

	// An in-page notice: something about this page the buyer should know now. One look per kind.
	let {
		kind = 'info',
		title,
		children,
		action,
		onDismiss,
		role = kind === 'error' || kind === 'warning' ? 'alert' : 'status'
	}: {
		kind?: Exclude<NoticeKind, 'announcement' | 'promo'>;
		title?: string;
		children?: Snippet;
		action?: { label: string; href: string };
		onDismiss?: () => void;
		role?: 'alert' | 'status';
	} = $props();

	const Icon = $derived(NOTICE_LOOK[kind].icon);
</script>

<div class="notice" style={toneStyle(kind)} {role}>
	<span class="notice__icon" aria-hidden="true"><Icon size={16} /></span>
	<div class="notice__body">
		{#if title}<p class="notice__title">{title}</p>{/if}
		{#if children}<div class="notice__text">{@render children()}</div>{/if}
		{#if action}<a class="notice__action" href={action.href}>{action.label}</a>{/if}
	</div>
	{#if onDismiss}
		<button type="button" class="notice__close" aria-label="Dismiss" onclick={onDismiss}>
			<X size={14} />
		</button>
	{/if}
</div>

<style>
	.notice {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem 0.875rem;
		border-radius: 0.875rem;
		border: 1px solid var(--tone-border);
		background: var(--tone-bg);
		font-family: var(--font-body);
	}
	.notice__icon {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		flex-shrink: 0;
		border-radius: 999px;
		background: var(--tone-bg);
		color: var(--tone);
	}
	.notice__body {
		min-width: 0;
		flex: 1;
		padding-top: 0.15rem;
	}
	.notice__title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text);
		font-family: var(--font-head);
	}
	.notice__text {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.notice__title + .notice__text {
		margin-top: 0.125rem;
	}
	.notice__action {
		display: inline-block;
		margin-top: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--tone);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.notice__close {
		flex-shrink: 0;
		padding: 0.3rem;
		border-radius: 999px;
		color: var(--text-muted);
		border: 1px solid var(--border);
		background: transparent;
		cursor: pointer;
	}
</style>
