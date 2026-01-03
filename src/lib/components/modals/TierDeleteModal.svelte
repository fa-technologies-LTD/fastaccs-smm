<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { AlertCircle } from '@lucide/svelte';
	import type { CategoryMetadata } from '$lib/services/categories';

	interface Props {
		open: boolean;
		tier: CategoryMetadata | null;
		loading?: boolean;
		onClose: () => void;
		onConfirm: () => void;
	}

	let { open, tier, loading = false, onClose, onConfirm }: Props = $props();
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
		transition:fade={{ duration: 300 }}
	>
		<div
			class="relative w-full max-w-md transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			in:fly={{ y: 200, duration: 300 }}
			out:fade={{ duration: 300 }}
		>
			<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
				<div class="sm:flex sm:items-start">
					<div
						class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10"
					>
						<AlertCircle class="h-6 w-6 text-red-600" />
					</div>
					<div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
						<h3 class="text-lg leading-6 font-semibold text-gray-900">Delete Tier</h3>
						<div class="mt-2">
							<p class="text-sm text-gray-500">
								Are you sure you want to delete <strong>{tier?.name}</strong>? This action cannot be
								undone.
							</p>
							<p class="mt-2 text-sm text-red-600">
								<strong>Warning:</strong> This will affect all platforms and associated accounts.
							</p>
						</div>
					</div>
				</div>
			</div>
			<div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
				<button
					type="button"
					onclick={onConfirm}
					disabled={loading}
					class="inline-flex w-full cursor-pointer justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-all hover:scale-95 hover:bg-red-500 active:scale-90 disabled:opacity-50 disabled:active:scale-100 sm:ml-3 sm:w-auto"
				>
					{loading ? 'Deleting...' : 'Delete Tier'}
				</button>
				<button
					type="button"
					onclick={onClose}
					disabled={loading}
					class="mt-3 inline-flex w-full cursor-pointer justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 transition-all ring-inset hover:scale-95 hover:bg-gray-50 active:scale-90 disabled:opacity-50 disabled:active:scale-100 sm:mt-0 sm:w-auto"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}
