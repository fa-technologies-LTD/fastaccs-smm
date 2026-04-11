<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { Archive, AlertTriangle } from '@lucide/svelte';
	import type { Category } from '$lib/services/categories';

	interface TierOption {
		id: string;
		name: string;
		parent?: {
			id: string;
			name: string;
			slug: string;
		} | null;
	}

	interface Props {
		open: boolean;
		platform: Category | null;
		loading?: boolean;
		loadingTargets?: boolean;
		moveAvailableInventory: boolean;
		targetCategoryId: string;
		targetOptions: TierOption[];
		onClose: () => void;
		onConfirm: () => void;
		onMoveToggle: (value: boolean) => void;
		onTargetChange: (value: string) => void;
	}

	let {
		open,
		platform,
		loading = false,
		loadingTargets = false,
		moveAvailableInventory,
		targetCategoryId,
		targetOptions,
		onClose,
		onConfirm,
		onMoveToggle,
		onTargetChange
	}: Props = $props();

	function submitRetire(event: Event) {
		event.preventDefault();
		onConfirm();
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<div
				class="fixed inset-0 bg-black/50 transition-opacity"
				onclick={onClose}
				onkeydown={(event) => event.key === 'Escape' && onClose()}
				role="button"
				tabindex="-1"
				aria-label="Close modal"
			></div>

			<div
				class="relative transform overflow-hidden rounded-lg text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-xl"
				style="background: var(--bg-elev-1);"
				in:fly={{ y: 200, duration: 300 }}
				out:fade={{ duration: 300 }}
			>
				<form onsubmit={submitRetire}>
					<div class="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-5 flex items-start gap-3">
							<div
								class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
								style="background: var(--status-warning-bg); color: var(--status-warning);"
							>
								<Archive size={18} />
							</div>
							<div>
								<h3 class="text-lg font-semibold" style="color: var(--text);">Retire Platform</h3>
								<p class="mt-1 text-sm" style="color: var(--text-muted);">
									<strong>{platform?.name}</strong> will be archived (`isActive=false`) and removed from
									customer storefront listings.
								</p>
							</div>
						</div>

						<div
							class="mb-4 rounded-md px-3 py-2 text-sm"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text-muted);"
						>
							Hard delete remains blocked for used categories. This action preserves historical orders and
							delivered records.
						</div>

						<div class="space-y-4">
							<label class="flex items-start gap-2">
								<input
									type="checkbox"
									checked={moveAvailableInventory}
									onchange={(event) =>
										onMoveToggle((event.target as HTMLInputElement).checked)}
									class="mt-1 h-4 w-4"
								/>
								<span class="text-sm" style="color: var(--text);">
									Move only <strong>available</strong> inventory to another active tier/category before
									retiring.
								</span>
							</label>

							{#if moveAvailableInventory}
								<div>
									<label
										for="retire-target-category"
										class="block text-sm font-medium"
										style="color: var(--text);"
									>
										Destination Tier/Category *
									</label>
									<select
										id="retire-target-category"
										value={targetCategoryId}
										onchange={(event) => onTargetChange((event.target as HTMLSelectElement).value)}
										class="mt-1 block w-full rounded-md px-3 py-2"
										style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
										required
									>
										<option value="">Select destination</option>
										{#each targetOptions as tier}
											<option value={tier.id}>
												{tier.name}
												{tier.parent ? ` (${tier.parent.name})` : ' (Global)'}
											</option>
										{/each}
									</select>
									{#if loadingTargets}
										<p class="mt-2 text-xs" style="color: var(--text-muted);">
											Loading destination categories...
										</p>
									{:else if targetOptions.length === 0}
										<p class="mt-2 text-xs" style="color: var(--status-error);">
											No active destination tiers/categories are currently available.
										</p>
									{/if}
								</div>
							{/if}
						</div>

						<div
							class="mt-5 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
							style="border: 1px solid var(--status-warning-border); background: var(--status-warning-bg); color: var(--status-warning);"
						>
							<AlertTriangle size={16} class="mt-0.5 flex-shrink-0" />
							<span>
								Assigned, reserved, and delivered records are not moved.
							</span>
						</div>
					</div>

					<div class="px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6" style="background: var(--surface);">
						<button
							type="submit"
							disabled={loading || (moveAvailableInventory && !targetCategoryId)}
							class="inline-flex w-full cursor-pointer justify-center rounded-full px-3 py-2 text-sm font-semibold text-black transition-all hover:scale-95 active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 sm:ml-3 sm:w-auto"
							style="background: var(--primary);"
						>
							{loading ? 'Retiring...' : 'Retire Platform'}
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
				</form>
			</div>
		</div>
	</div>
{/if}
