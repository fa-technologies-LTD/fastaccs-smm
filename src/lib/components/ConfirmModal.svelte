<script lang="ts">
	import { X } from '@lucide/svelte';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onConfirm: () => void;
		title: string;
		message: string;
		confirmText?: string;
		cancelText?: string;
		isDestructive?: boolean;
		isLoading?: boolean;
	}

	let {
		isOpen,
		onClose,
		onConfirm,
		title,
		message,
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		isDestructive = false,
		isLoading = false
	}: Props = $props();

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
		aria-labelledby="modal-title"
		tabindex="-1"
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: rgba(0, 0, 0, 0.5);"
	>
		<div class="w-full max-w-md rounded-lg p-6 shadow-xl" style="background: var(--bg-elev-1);">
			<!-- Header -->
			<div class="mb-4 flex items-start justify-between">
				<div class="flex-1">
					<h2 id="modal-title" class="text-lg font-semibold" style="color: var(--text);">
						{title}
					</h2>
				</div>
				<button
					onclick={onClose}
					class="group cursor-pointer rounded-lg p-1 transition-colors"
					style="color: var(--text-dim); background: transparent;"
				>
					<X class="h-5 w-5 group-hover:scale-80" />
				</button>
			</div>

			<!-- Message -->
			<div class="mb-6">
				<p class="text-sm" style="color: var(--text-muted);">{message}</p>
			</div>

			<!-- Actions -->
			<div class="flex items-center justify-end gap-3">
				<button
					onclick={onClose}
					disabled={isLoading}
					class="cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-all hover:scale-95 disabled:opacity-50"
					style="border: 1px solid var(--border); color: var(--text); background: transparent;"
				>
					{cancelText}
				</button>
				<button
					onclick={onConfirm}
					disabled={isLoading}
					class="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-white transition-all hover:scale-95 disabled:opacity-50"
					style={isDestructive
						? 'background: #dc2626;'
						: 'background: var(--primary); color: #000;'}
				>
					{isLoading ? 'Processing...' : confirmText}
				</button>
			</div>
		</div>
	</div>
{/if}
