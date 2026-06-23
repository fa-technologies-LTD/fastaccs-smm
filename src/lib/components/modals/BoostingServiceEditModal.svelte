<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { Zap } from '$lib/icons';
	import {
		BOOSTING_PLATFORMS,
		BOOSTING_ACTION_TYPES,
		BOOSTING_PLATFORM_LABELS,
		BOOSTING_ACTION_LABELS
	} from '$lib/helpers/boosting-service-config';
	import { getRequiredLinkType } from '$lib/helpers/social-link-validator';
	import type { BoostingPlatform, BoostingActionType } from '$lib/helpers/social-link-validator';

	interface Props {
		open: boolean;
		serviceForm: {
			name: string;
			slug: string;
			description: string;
			metadata: {
				boosting_platform: BoostingPlatform;
				boosting_action_type: BoostingActionType;
				boosting_min_quantity: number;
				boosting_step_quantity: number;
				boosting_price_per_step: number;
				boosting_refill_available: boolean;
				boosting_refill_days: number;
			};
		};
		loading?: boolean;
		onClose: () => void;
		onUpdate: () => void;
	}

	let { open, serviceForm = $bindable(), loading = false, onClose, onUpdate }: Props = $props();

	const requiredLinkType = $derived(getRequiredLinkType(serviceForm.metadata.boosting_action_type));
</script>

{#if open}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<div
				class="fixed inset-0 bg-black/50 transition-opacity"
				tabindex="-1"
				onclick={onClose}
				onkeydown={(e) => e.key === 'Escape' && onClose()}
			></div>

			<div
				class="relative transform overflow-hidden rounded-lg text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl"
				style="background: var(--bg-elev-1);"
				in:fly={{ y: 200, duration: 300 }}
				out:fade={{ duration: 300 }}
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						onUpdate();
					}}
				>
					<div class="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="flex items-center gap-2 text-lg font-semibold" style="color: var(--text);">
								<Zap class="h-5 w-5" style="color: var(--primary);" />
								Edit Boosting Service
							</h3>
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div class="md:col-span-2">
								<label for="edit-service-name" class="block text-sm font-medium" style="color: var(--text);"
									>Service Name *</label
								>
								<input
									id="edit-service-name"
									type="text"
									required
									bind:value={serviceForm.name}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<div>
								<label for="edit-service-platform" class="block text-sm font-medium" style="color: var(--text);">
									Platform *
								</label>
								<select
									id="edit-service-platform"
									required
									bind:value={serviceForm.metadata.boosting_platform}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								>
									{#each BOOSTING_PLATFORMS as platform}
										<option value={platform}>{BOOSTING_PLATFORM_LABELS[platform]}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="edit-service-action" class="block text-sm font-medium" style="color: var(--text);">
									Action *
								</label>
								<select
									id="edit-service-action"
									required
									bind:value={serviceForm.metadata.boosting_action_type}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								>
									{#each BOOSTING_ACTION_TYPES as action}
										<option value={action}>{BOOSTING_ACTION_LABELS[action]}</option>
									{/each}
								</select>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									Customers will need to submit a {requiredLinkType === 'profile'
										? 'profile/channel link'
										: 'post/video link'}.
								</p>
							</div>

							<div class="md:col-span-2">
								<label
									for="edit-service-description"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Description
								</label>
								<textarea
									id="edit-service-description"
									bind:value={serviceForm.description}
									rows="2"
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								></textarea>
							</div>

							<div>
								<label for="edit-service-min-qty" class="block text-sm font-medium" style="color: var(--text);">
									Minimum Quantity *
								</label>
								<input
									id="edit-service-min-qty"
									type="number"
									required
									min="1"
									bind:value={serviceForm.metadata.boosting_min_quantity}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<div>
								<label for="edit-service-step-qty" class="block text-sm font-medium" style="color: var(--text);">
									Step / Increment *
								</label>
								<input
									id="edit-service-step-qty"
									type="number"
									required
									min="1"
									bind:value={serviceForm.metadata.boosting_step_quantity}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									Customers can order {serviceForm.metadata.boosting_min_quantity},
									{serviceForm.metadata.boosting_min_quantity + serviceForm.metadata.boosting_step_quantity},
									{serviceForm.metadata.boosting_min_quantity +
										serviceForm.metadata.boosting_step_quantity * 2}... and so on.
								</p>
							</div>

							<div class="md:col-span-2">
								<label for="edit-service-price" class="block text-sm font-medium" style="color: var(--text);">
									Price per Step (₦) *
								</label>
								<input
									id="edit-service-price"
									type="number"
									required
									step="0.01"
									min="0"
									bind:value={serviceForm.metadata.boosting_price_per_step}
									class="mt-1 block w-full rounded-md px-4 py-2 sm:max-w-xs"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									Price for {serviceForm.metadata.boosting_step_quantity} units. Larger orders scale
									automatically.
								</p>
							</div>

							<div
								class="md:col-span-2 rounded-lg p-3"
								style="border: 1px solid var(--border); background: var(--bg-elev-1);"
							>
								<label
									class="flex items-center justify-between rounded-md px-3 py-2 text-sm"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								>
									<span>Refill available</span>
									<input
										type="checkbox"
										bind:checked={serviceForm.metadata.boosting_refill_available}
										aria-label="Refill available"
									/>
								</label>
								{#if serviceForm.metadata.boosting_refill_available}
									<div class="mt-3">
										<label
											for="edit-service-refill-days"
											class="block text-sm font-medium"
											style="color: var(--text);"
										>
											Refill window (days)
										</label>
										<input
											id="edit-service-refill-days"
											type="number"
											min="1"
											bind:value={serviceForm.metadata.boosting_refill_days}
											class="mt-1 block w-full rounded-md px-4 py-2 sm:max-w-xs"
											style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
										/>
									</div>
								{/if}
							</div>
						</div>
					</div>

					<div
						class="px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6"
						style="background: var(--surface);"
					>
						<button
							type="submit"
							disabled={loading}
							class="inline-flex w-full justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-50 sm:ml-3 sm:w-auto"
							style="background: var(--primary); color: #000;"
						>
							{loading ? 'Saving...' : 'Save Changes'}
						</button>
						<button
							type="button"
							onclick={onClose}
							class="mt-3 inline-flex w-full justify-center rounded-full px-3 py-2 text-sm font-semibold shadow sm:mt-0 sm:w-auto"
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
