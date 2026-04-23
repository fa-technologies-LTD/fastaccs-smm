<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { Plus, Trash2, Target } from '@lucide/svelte';
	import TierSampleScreenshotFields from '$lib/components/modals/TierSampleScreenshotFields.svelte';

	interface Props {
		open: boolean;
		tierForm: {
			name: string;
			slug: string;
			description: string;
			parentId: string;
			metadata: {
				follower_range: {
					min: number;
					max: number;
					display: string;
				};
				pricing: {
					base_price: number;
					bulk_discount: number;
					currency: string;
				};
				features: string[];
				quality_score: number;
				delivery_time: string;
				replacement_guarantee: boolean;
				sample_screenshot_urls: string[];
			};
		};
		loading?: boolean;
		onClose: () => void;
		onUpdate: () => void;
	}

	let { open, tierForm = $bindable(), loading = false, onClose, onUpdate }: Props = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				class="fixed inset-0 bg-black/50 transition-opacity"
				onclick={onClose}
				onkeydown={(e) => e.key === 'Escape' && onClose()}
			></div>

			<!-- Modal content -->
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
								<Target class="h-5 w-5" style="color: var(--primary);" />
								Edit Tier
							</h3>
							<p class="mt-1 text-sm" style="color: var(--text-muted);">
								Changes will affect this tier across all platforms
							</p>
						</div>

						<!-- Same form fields as create modal -->
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<!-- Name -->
							<div class="md:col-span-2">
								<label for="edit-name" class="block text-sm font-medium" style="color: var(--text);"
									>Tier Name *</label
								>
								<input
									id="edit-name"
									type="text"
									required
									bind:value={tierForm.name}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<!-- Slug -->
							<div class="md:col-span-2">
								<label for="edit-slug" class="block text-sm font-medium" style="color: var(--text);"
									>URL Slug *</label
								>
								<input
									id="edit-slug"
									type="text"
									required
									bind:value={tierForm.slug}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<!-- Description -->
							<div class="md:col-span-2">
								<label
									for="edit-description"
									class="block text-sm font-medium"
									style="color: var(--text);">Description</label
								>
								<textarea
									id="edit-description"
									bind:value={tierForm.description}
									rows="2"
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								></textarea>
							</div>

							<TierSampleScreenshotFields bind:urls={tierForm.metadata.sample_screenshot_urls} />

							<!-- Features -->
							<div class="md:col-span-2">
								<label class="mb-2 block text-sm font-medium" style="color: var(--text);"
									>Features</label
								>
								<div class="space-y-2">
									{#each tierForm.metadata.features as feature, index}
										<div class="flex gap-2">
											<input
												type="text"
												bind:value={tierForm.metadata.features[index]}
												class="flex-1 rounded-md px-3 py-2"
												style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
												placeholder="Enter a feature"
											/>
											<button
												type="button"
												onclick={() => {
													tierForm.metadata.features = tierForm.metadata.features.filter(
														(_, i) => i !== index
													);
												}}
												class="rounded-full px-3 py-2 text-red-600 focus:ring-2 focus:ring-red-500 focus:outline-none"
												style="background: var(--surface);"
											>
												<Trash2 size={16} />
											</button>
										</div>
									{/each}
									<button
										type="button"
										onclick={() => {
											tierForm.metadata.features = [...tierForm.metadata.features, ''];
										}}
										class="flex items-center gap-2 rounded-full px-3 py-2 focus:ring-2 focus:outline-none"
										style="background: var(--surface); color: var(--text); border: 1px solid var(--border);"
									>
										<Plus size={16} />
										Add Feature
									</button>
								</div>
							</div>

							<!-- Follower Range -->
							<div>
								<label class="block text-sm font-medium" style="color: var(--text);"
									>Min Followers</label
								>
								<input
									type="number"
									min="0"
									bind:value={tierForm.metadata.follower_range.min}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium" style="color: var(--text);"
									>Max Followers</label
								>
								<input
									type="number"
									min="0"
									bind:value={tierForm.metadata.follower_range.max}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium" style="color: var(--text);"
									>Display Text</label
								>
								<input
									type="text"
									bind:value={tierForm.metadata.follower_range.display}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<!-- Pricing -->
							<div>
								<label class="block text-sm font-medium" style="color: var(--text);"
									>Base Price (₦)</label
								>
								<input
									type="number"
									step="0.01"
									min="0"
									bind:value={tierForm.metadata.pricing.base_price}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium" style="color: var(--text);"
									>Quality Score (1-5)</label
								>
								<input
									type="number"
									min="1"
									max="5"
									bind:value={tierForm.metadata.quality_score}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<div class="md:col-span-2">
								<label class="block text-sm font-medium" style="color: var(--text);"
									>Delivery Time</label
								>
								<input
									type="text"
									bind:value={tierForm.metadata.delivery_time}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
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
							{loading ? 'Updating...' : 'Update Tier'}
						</button>
						<button
							type="button"
							onclick={onClose}
							class="mt-3 inline-flex w-full justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm sm:mt-0 sm:w-auto"
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
