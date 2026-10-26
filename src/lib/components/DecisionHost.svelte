<script lang="ts">
	import { tick } from 'svelte';
	import { decision } from '$lib/stores/decision.svelte';
	import { lockScroll, unlockScroll } from '$lib/helpers/scroll-lock';

	let safeButton = $state<HTMLButtonElement>();
	const current = $derived(decision.current);

	$effect(() => {
		if (!current) return;
		const previous = document.activeElement;
		lockScroll();
		void tick().then(() => safeButton?.focus());
		return () => {
			unlockScroll();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	});

	function onKeydown(event: KeyboardEvent) {
		if (current && event.key === 'Escape') decision.answer(false);
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if current}
	<div
		class="decision-backdrop fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) decision.answer(false);
		}}
	>
		<div
			class="decision w-full max-w-sm rounded-2xl p-5"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="decision-title"
			aria-describedby="decision-message"
		>
			<h2
				id="decision-title"
				class="text-base font-semibold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				{current.title}
			</h2>
			<p
				id="decision-message"
				class="mt-2 text-sm leading-relaxed"
				style="color: var(--text-muted); font-family: var(--font-body);"
			>
				{current.message}
			</p>
			<div class="mt-5 grid gap-2">
				<button
					bind:this={safeButton}
					type="button"
					class="btn-fa btn-fa--primary w-full"
					onclick={() => decision.answer(false)}>{current.cancelLabel}</button
				>
				<button
					type="button"
					class="btn-fa w-full {current.tone === 'danger' ? 'btn-fa--danger' : 'btn-fa--ghost'}"
					onclick={() => decision.answer(true)}>{current.confirmLabel}</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.decision-backdrop {
		background: rgba(2, 8, 6, 0.72);
		backdrop-filter: blur(4px);
		padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px));
	}
	.decision {
		background: var(--bg-elev-1);
		border: 1px solid var(--border);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
		animation: decision-in 180ms ease-out;
	}
	@keyframes decision-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.decision {
			animation: none;
		}
	}
</style>
