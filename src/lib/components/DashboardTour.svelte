<script lang="ts" module>
	export interface TourStep {
		/** The `data-tour` name of the part of the page this step points at; none for a centred card. */
		target?: string;
		title: string;
		text: string;
	}
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';

	// A first-visit walk through the dashboard: the page dims, a soft spotlight glides to each part,
	// and a small card says what it is in plain words. Skippable at every step.
	let { steps, onclose }: { steps: TourStep[]; onclose: () => void } = $props();

	let index = $state(0);
	let spot = $state<{ top: number; left: number; width: number; height: number } | null>(null);
	let card = $state<{ top: number; left: number; below: boolean } | null>(null);
	let primary = $state<HTMLButtonElement | null>(null);
	let narrow = $state(false);
	const step = $derived(steps[index]);
	const last = $derived(index === steps.length - 1);
	const reduced =
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	const CARD_WIDTH = 320;
	const GAP = 14;

	function measure() {
		narrow = window.innerWidth < 640;
		const element = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
		if (!element) {
			spot = null;
			card = null;
			return;
		}
		const rect = element.getBoundingClientRect();
		const pad = 8;
		spot = {
			top: rect.top - pad,
			left: rect.left - pad,
			width: rect.width + pad * 2,
			height: rect.height + pad * 2
		};
		const below = rect.bottom + GAP + 190 < window.innerHeight;
		const left = Math.min(
			Math.max(16, rect.left + rect.width / 2 - CARD_WIDTH / 2),
			window.innerWidth - CARD_WIDTH - 16
		);
		card = { top: below ? rect.bottom + pad + GAP : rect.top - pad - GAP, left, below };
	}

	async function show(next: number) {
		index = next;
		await tick();
		const element = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
		element?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
		measure();
		// Measure again once a smooth scroll has settled.
		if (element && !reduced) setTimeout(measure, 380);
		await tick();
		primary?.focus();
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onclose();
		else if (event.key === 'ArrowRight' && !last) void show(index + 1);
		else if (event.key === 'ArrowLeft' && index > 0) void show(index - 1);
	}

	onMount(() => {
		void show(0);
	});
</script>

<svelte:window onresize={measure} onscroll={measure} onkeydown={keydown} />

<div class="tour" class:tour--still={reduced}>
	<div
		class="tour__spot"
		class:tour__spot--none={!spot}
		style={spot
			? `top:${spot.top}px;left:${spot.left}px;width:${spot.width}px;height:${spot.height}px`
			: ''}
	></div>
	{#key index}
		<div
			class="tour__card"
			class:tour__card--center={!card || narrow}
			class:tour__card--above={card && !card.below && !narrow}
			style={card && !narrow ? `top:${card.top}px;left:${card.left}px` : ''}
			role="dialog"
			aria-modal="true"
			aria-labelledby="tour-title"
			in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 260, delay: reduced ? 0 : 120 }}
		>
			<div class="tour__dots" aria-hidden="true">
				{#each steps as entry, dot (entry.title)}
					<span class:is-on={dot === index}></span>
				{/each}
			</div>
			<h2 id="tour-title">{step.title}</h2>
			<p>{step.text}</p>
			<div class="tour__actions">
				{#if index === 0}
					<button type="button" class="tour__ghost" onclick={onclose}>Not now</button>
					<button type="button" class="tour__primary" bind:this={primary} onclick={() => show(1)}
						>Show me</button
					>
				{:else}
					<button type="button" class="tour__ghost" onclick={() => show(index - 1)}>Back</button>
					<button
						type="button"
						class="tour__primary"
						bind:this={primary}
						onclick={() => (last ? onclose() : show(index + 1))}>{last ? 'Done' : 'Next'}</button
					>
				{/if}
			</div>
			{#if index > 0 && !last}
				<button type="button" class="tour__skip" onclick={onclose}>Skip tour</button>
			{/if}
		</div>
	{/key}
</div>

<style>
	.tour {
		position: fixed;
		inset: 0;
		z-index: 90;
	}
	/* The spotlight: a clear window over the part being explained, with the rest of the page dimmed. */
	.tour__spot {
		position: fixed;
		border-radius: 14px;
		box-shadow:
			0 0 0 200vmax rgba(5, 7, 10, 0.72),
			0 0 0 2px color-mix(in srgb, var(--primary) 70%, transparent),
			0 0 24px 4px color-mix(in srgb, var(--primary) 35%, transparent);
		transition:
			top 450ms cubic-bezier(0.22, 1, 0.36, 1),
			left 450ms cubic-bezier(0.22, 1, 0.36, 1),
			width 450ms cubic-bezier(0.22, 1, 0.36, 1),
			height 450ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 300ms ease;
		pointer-events: none;
	}
	.tour__spot--none {
		top: 50%;
		left: 50%;
		width: 0;
		height: 0;
		box-shadow: 0 0 0 200vmax rgba(5, 7, 10, 0.72);
	}
	.tour__card {
		position: fixed;
		width: min(320px, calc(100vw - 32px));
		padding: 1rem 1.1rem;
		border: 1px solid var(--border-2, var(--border));
		border-radius: 16px;
		background: var(--bg-elev-2);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
		color: var(--text);
		transition:
			top 450ms cubic-bezier(0.22, 1, 0.36, 1),
			left 450ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.tour__card--above {
		transform: translateY(-100%);
	}
	.tour__card--center {
		top: auto;
		bottom: max(16px, env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
	}
	@media (min-width: 640px) {
		.tour__card--center:not(.tour__card--above) {
			top: 50%;
			bottom: auto;
			transform: translate(-50%, -50%);
		}
	}
	.tour__dots {
		display: flex;
		gap: 5px;
		margin-bottom: 0.6rem;
	}
	.tour__dots span {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--border);
		transition:
			width 300ms ease,
			background 300ms ease;
	}
	.tour__dots span.is-on {
		width: 18px;
		background: var(--primary);
	}
	h2 {
		margin: 0 0 0.3rem;
		font-family: var(--font-head);
		font-size: 1.05rem;
		font-weight: 700;
	}
	p {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
		line-height: 1.45;
	}
	.tour__actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}
	.tour__actions button {
		min-height: 2.75rem;
		padding: 0 1rem;
		border-radius: 999px;
		font-size: 0.875rem;
		font-weight: 600;
	}
	.tour__ghost {
		color: var(--text-muted);
	}
	.tour__primary {
		background: var(--primary);
		color: #00150b;
	}
	.tour__skip {
		display: block;
		margin: 0.4rem 0 0 auto;
		padding: 0.25rem 0;
		color: var(--text-dim);
		font-size: 0.75rem;
	}
	.tour--still .tour__spot,
	.tour--still .tour__card,
	.tour--still .tour__dots span {
		transition: none;
	}
</style>
