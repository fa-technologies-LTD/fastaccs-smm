<script lang="ts">
	import { X } from '$lib/icons';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		icon: string;
		title: string;
		body: string;
		ctaText?: string;
		secondaryHref?: string;
		secondaryText?: string;
	}

	let { isOpen, onClose, icon, title, body, ctaText = 'Got it', secondaryHref, secondaryText }: Props =
		$props();

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!isOpen) return;

		if (event.key === 'Escape') {
			onClose();
		}
	}

	$effect(() => {
		if (isOpen) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = 'auto';
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="affiliate-popup-title"
		tabindex="-1"
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: rgba(0, 0, 0, 0.5);"
	>
		<div
			class="w-full max-w-md rounded-lg p-6 text-center shadow-xl"
			style="background: var(--bg-elev-1);"
		>
			<div class="mb-2 flex justify-end">
				<button
					onclick={onClose}
					class="group cursor-pointer rounded-lg p-1 transition-colors"
					style="color: var(--text-dim); background: transparent;"
				>
					<X class="h-5 w-5 group-hover:scale-80" />
				</button>
			</div>

			<div class="mb-3 text-4xl">{icon}</div>

			<h2 id="affiliate-popup-title" class="mb-2 text-lg font-semibold" style="color: var(--text);">
				{title}
			</h2>

			<p class="mb-6 text-sm" style="color: var(--text-muted);">{body}</p>

			<button
				onclick={onClose}
				class="w-full cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-all hover:scale-95"
				style="background: var(--primary); color: #04140C;"
			>
				{ctaText}
			</button>

			{#if secondaryHref && secondaryText}
				<a
					href={secondaryHref}
					class="mt-3 inline-block text-sm font-medium underline-offset-2 hover:underline"
					style="color: var(--text-muted);"
				>
					{secondaryText}
				</a>
			{/if}
		</div>
	</div>
{/if}
