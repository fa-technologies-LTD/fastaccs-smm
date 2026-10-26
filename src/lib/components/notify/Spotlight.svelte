<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import { ArrowRight, X } from '$lib/icons';
	import { lockScroll, unlockScroll } from '$lib/helpers/scroll-lock';
	import { NOTICE_LOOK, toneStyle, type NoticeKind } from '$lib/notify/kinds';

	// The one pop-up shell for announcements (something new) and promos (an offer). Where it may
	// appear is decided by popup-rules.ts; this only draws it.
	interface Action {
		label: string;
		href?: string;
	}
	let {
		kind,
		title,
		body,
		items = [],
		eyebrow = NOTICE_LOOK[kind].eyebrow,
		icon,
		emoji,
		accent = null,
		primary,
		secondary,
		dismissLabel,
		closeLabel = 'Close',
		onClose,
		onShown = () => {},
		onNavigate
	}: {
		kind: Extract<NoticeKind, 'announcement' | 'promo' | 'info'>;
		title: string;
		body: string;
		items?: { label: string; href?: string }[];
		eyebrow?: string;
		icon?: Component;
		emoji?: string;
		/** Overrides the kind's colour, e.g. the Numbers blue. */
		accent?: string | null;
		/** A link (with href) or a button that closes. */
		primary: Action;
		secondary?: Action;
		/** Quiet text button that closes, e.g. "Maybe later". */
		dismissLabel?: string;
		closeLabel?: string;
		onClose: () => void;
		onShown?: () => void;
		/** Lets the host record the impression before following a link. */
		onNavigate?: (href: string) => void;
	} = $props();

	let dialog: HTMLDialogElement;
	// The shell draws its own arrow on links, so drop one typed into the label.
	const withoutArrow = (label: string) => label.replace(/\s*(?:→|->|›)+\s*$/u, '');
	let leaving = false;
	const Icon = $derived(icon ?? NOTICE_LOOK[kind].icon);

	onMount(() => {
		const previousFocus = document.activeElement;
		dialog.showModal();
		lockScroll();
		onShown();
		return () => {
			// Closing because the page moved on is not the buyer dismissing it.
			leaving = true;
			dialog.close();
			unlockScroll();
			if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
		};
	});

	function follow(event: MouseEvent, href: string) {
		if (!onNavigate) {
			onClose();
			return;
		}
		event.preventDefault();
		onNavigate(href);
	}
</script>

<dialog
	bind:this={dialog}
	class="spotlight"
	style={toneStyle(kind, accent)}
	aria-labelledby="spotlight-title"
	aria-describedby="spotlight-body"
	onclose={() => {
		if (!leaving) onClose();
	}}
	onclick={(event) => {
		if (event.target === dialog) onClose();
	}}
>
	<div class="spotlight__content">
		<button type="button" class="spotlight__close" aria-label={closeLabel} onclick={onClose}>
			<X size={18} />
		</button>
		<div class="spotlight__icon" aria-hidden="true">
			{#if emoji}<span class="spotlight__emoji">{emoji}</span>{:else}<Icon size={30} />{/if}
		</div>
		{#if eyebrow}<span class="spotlight__eyebrow">{eyebrow}</span>{/if}
		<h2 id="spotlight-title">{title}</h2>
		<p id="spotlight-body">{body}</p>
		{#if items.length}
			<ul class="spotlight__items">
				{#each items as item, index (index)}
					<li>
						{#if item.href}
							<a href={item.href} onclick={(event) => follow(event, item.href!)}>{item.label}</a>
						{:else}
							{item.label}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if primary.href}
			<a
				href={primary.href}
				class="spotlight__primary"
				onclick={(event) => follow(event, primary.href!)}
			>
				{withoutArrow(primary.label)}
				<ArrowRight size={17} aria-hidden="true" />
			</a>
		{:else}
			<button type="button" class="spotlight__primary" onclick={onClose}>{primary.label}</button>
		{/if}
		{#if secondary?.href}
			<a
				href={secondary.href}
				class="spotlight__quiet"
				onclick={(event) => follow(event, secondary.href!)}>{secondary.label}</a
			>
		{/if}
		{#if dismissLabel}
			<button type="button" class="spotlight__quiet" onclick={onClose}>{dismissLabel}</button>
		{/if}
	</div>
</dialog>

<style>
	.spotlight {
		margin: auto;
		padding: 0;
		width: min(420px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		overflow-y: auto;
		border: 1px solid var(--tone-border);
		border-radius: 24px;
		background: var(--bg-elev-1);
		color: var(--text);
		box-shadow: 0 24px 90px rgba(0, 0, 0, 0.55);
		animation: spotlight-in 220ms ease-out;
	}
	.spotlight::backdrop {
		background: rgba(2, 8, 6, 0.72);
		backdrop-filter: blur(4px);
	}
	@keyframes spotlight-in {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.spotlight__content {
		position: relative;
		display: grid;
		justify-items: center;
		gap: 0.75rem;
		padding: 2.25rem 1.5rem 1.5rem;
		text-align: center;
		background: radial-gradient(ellipse at 50% 0%, var(--tone-bg), transparent 65%);
	}
	.spotlight__close {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		padding: 0.5rem;
		border-radius: 999px;
		color: var(--text-muted);
		background: transparent;
		cursor: pointer;
	}
	.spotlight__icon {
		display: grid;
		place-items: center;
		width: 4rem;
		height: 4rem;
		margin-bottom: 0.25rem;
		border-radius: 1.25rem;
		border: 1px solid var(--tone-border);
		background: var(--tone-bg);
		color: var(--tone);
		transform: rotate(-6deg);
	}
	.spotlight__emoji {
		font-size: 1.9rem;
		transform: rotate(6deg);
	}
	.spotlight__eyebrow {
		padding: 0.15rem 0.6rem;
		border-radius: 999px;
		background: var(--tone-bg);
		color: var(--tone);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0;
		font-family: var(--font-head);
		font-size: clamp(1.5rem, 5vw, 1.9rem);
		font-weight: 700;
		line-height: 1.15;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}
	#spotlight-body {
		margin: 0;
		max-width: 21rem;
		color: var(--text-muted);
		font-size: 0.875rem;
		line-height: 1.6;
	}
	.spotlight__items {
		display: grid;
		gap: 0.375rem;
		width: 100%;
		margin: 0.25rem 0 0;
		padding: 0;
		list-style: none;
		text-align: left;
		font-size: 0.875rem;
	}
	.spotlight__items li::before {
		content: '•';
		margin-right: 0.5rem;
		color: var(--tone);
	}
	.spotlight__items a {
		color: var(--text);
		text-decoration: underline dotted;
		text-underline-offset: 2px;
	}
	.spotlight__primary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 3rem;
		margin-top: 0.5rem;
		padding: 0.75rem 1.25rem;
		border-radius: 0.875rem;
		background: var(--tone);
		color: #04140c;
		font-family: var(--font-head);
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		transition: transform 120ms ease;
	}
	.spotlight__primary:active {
		transform: scale(0.98);
	}
	.spotlight__quiet {
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		background: transparent;
		text-decoration: none;
		cursor: pointer;
	}
	.spotlight__quiet:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.spotlight {
			animation: none;
		}
	}
</style>
