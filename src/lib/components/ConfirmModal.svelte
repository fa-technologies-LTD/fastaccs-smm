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
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
	>
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
			<!-- Header -->
			<div class="mb-4 flex items-start justify-between">
				<div class="flex-1">
					<h2 id="modal-title" class="text-lg font-semibold text-gray-900">
						{title}
					</h2>
				</div>
				<button
					onclick={onClose}
					class="group cursor-pointer rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
				>
					<X class="h-5 w-5 group-hover:scale-80" />
				</button>
			</div>

			<!-- Message -->
			<div class="mb-6">
				<p class="text-sm text-gray-600">{message}</p>
			</div>

			<!-- Actions -->
			<div class="flex items-center justify-end gap-3">
				<button
					onclick={onClose}
					disabled={isLoading}
					class="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:scale-95 hover:bg-gray-50 disabled:opacity-50"
				>
					{cancelText}
				</button>
				<button
					onclick={onConfirm}
					disabled={isLoading}
					class="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:scale-95 disabled:opacity-50 {isDestructive
						? 'bg-red-600 hover:bg-red-700'
						: 'bg-blue-600 hover:bg-blue-700'}"
				>
					{isLoading ? 'Processing...' : confirmText}
				</button>
			</div>
		</div>
	</div>
{/if}
