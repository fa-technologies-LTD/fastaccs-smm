<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { AlertCircle } from '@lucide/svelte';
	import type { Category } from '$lib/services/categories';

	interface Props {
		open: boolean;
		platform: Category | null;
		loading?: boolean;
		onClose: () => void;
		onConfirm: () => void;
	}

	let { open, platform, loading = false, onClose, onConfirm }: Props = $props();
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: rgba(0, 0, 0, 0.5);"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
		transition:fade={{ duration: 300 }}
	>
		<div
			class="relative w-full max-w-md transform overflow-hidden rounded-lg text-left shadow-xl transition-all"
			style="background: var(--bg-elev-1);"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
			in:fly={{ y: 200, duration: 300 }}
			out:fade={{ duration: 300 }}
		>
			<div class="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
				<div class="sm:flex sm:items-start">
					<div
						class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full sm:mx-0 sm:h-10 sm:w-10"
						style="background: var(--surface);"
					>
						<AlertCircle class="h-6 w-6 text-red-600" />
					</div>
					<div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
						<h3 class="text-lg leading-6 font-semibold" style="color: var(--text);">
							Delete Platform
						</h3>
						<div class="mt-2">
							<p class="text-sm" style="color: var(--text-muted);">
								Are you sure you want to delete <strong>{platform?.name}</strong>? This action
								cannot be undone.
							</p>
							<p class="mt-2 text-sm text-red-600">
								<strong>Warning:</strong> If this platform has any tiers, services, accounts, or orders
								associated with it, the deletion will be prevented.
							</p>
							<p class="mt-2 text-sm" style="color: var(--text-muted);">
								Use <strong>Retire Platform</strong> when you need to hide a used platform without
								breaking historical data.
							</p>
						</div>
					</div>
				</div>
			</div>
			<div
				class="px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6"
				style="background: var(--surface);"
			>
				<button
					type="button"
					onclick={onConfirm}
					disabled={loading}
					class="inline-flex w-full cursor-pointer justify-center rounded-full px-3 py-2 text-sm font-semibold text-white transition-all hover:scale-95 active:scale-90 disabled:opacity-50 disabled:active:scale-100 sm:ml-3 sm:w-auto"
					style="background: #dc2626;"
				>
					{loading ? 'Deleting...' : 'Delete Platform'}
				</button>
				<button
					type="button"
					onclick={onClose}
					disabled={loading}
					class="mt-3 inline-flex w-full cursor-pointer justify-center rounded-full px-3 py-2 text-sm font-semibold transition-all hover:scale-95 active:scale-90 disabled:opacity-50 disabled:active:scale-100 sm:mt-0 sm:w-auto"
					style="border: 1px solid var(--border); color: var(--text); background: transparent;"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}
