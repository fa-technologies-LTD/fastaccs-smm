<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { Plus, Trash2, Target } from '@lucide/svelte';


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
			};
		};
		loading?: boolean;
		onClose: () => void;
		onUpdate: () => void;
	}

	let { open, tierForm=$bindable(), loading = false, onClose, onUpdate }: Props = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				class="fixed inset-0 bg-black/20 transition-opacity"
				onclick={onClose}
				onkeydown={(e) => e.key === 'Escape' && onClose()}
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl"
				in:fly={{ y: 200, duration: 300 }}
				out:fade={{ duration: 300 }}
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						onUpdate();
					}}
				>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="flex items-center gap-2 text-lg font-semibold text-gray-900">
								<Target class="h-5 w-5 text-purple-600" />
								Edit Tier
							</h3>
							<p class="mt-1 text-sm text-gray-600">
								Changes will affect this tier across all platforms
							</p>
						</div>

						<!-- Same form fields as create modal -->
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<!-- Name -->
							<div class="md:col-span-2">
								<label for="edit-name" class="block text-sm font-medium text-gray-700"
									>Tier Name *</label
								>
								<input
									id="edit-name"
									type="text"
									required
									bind:value={tierForm.name}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								/>
							</div>

							<!-- Slug -->
							<div class="md:col-span-2">
								<label for="edit-slug" class="block text-sm font-medium text-gray-700"
									>URL Slug *</label
								>
								<input
									id="edit-slug"
									type="text"
									required
									bind:value={tierForm.slug}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								/>
							</div>

							<!-- Description -->
							<div class="md:col-span-2">
								<label for="edit-description" class="block text-sm font-medium text-gray-700"
									>Description</label
								>
								<textarea
									id="edit-description"
									bind:value={tierForm.description}
									rows="2"
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								></textarea>
							</div>

							<!-- Features -->
							<div class="md:col-span-2">
								<label class="mb-2 block text-sm font-medium text-gray-700">Features</label>
								<div class="space-y-2">
									{#each tierForm.metadata.features as feature, index}
										<div class="flex gap-2">
											<input
												type="text"
												bind:value={tierForm.metadata.features[index]}
												class="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-purple-500 focus:ring-purple-500"
												placeholder="Enter a feature"
											/>
											<button
												type="button"
												onclick={() => {
													tierForm.metadata.features = tierForm.metadata.features.filter(
														(_, i) => i !== index
													);
												}}
												class="rounded-md bg-red-50 px-3 py-2 text-red-600 hover:bg-red-100 focus:ring-2 focus:ring-red-500 focus:outline-none"
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
										class="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-gray-600 hover:bg-gray-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
									>
										<Plus size={16} />
										Add Feature
									</button>
								</div>
							</div>

							<!-- Follower Range -->
							<div>
								<label class="block text-sm font-medium text-gray-700">Min Followers</label>
								<input
									type="number"
									min="0"
									bind:value={tierForm.metadata.follower_range.min}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700">Max Followers</label>
								<input
									type="number"
									min="0"
									bind:value={tierForm.metadata.follower_range.max}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700">Display Text</label>
								<input
									type="text"
									bind:value={tierForm.metadata.follower_range.display}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								/>
							</div>

							<!-- Pricing -->
							<div>
								<label class="block text-sm font-medium text-gray-700">Base Price (₦)</label>
								<input
									type="number"
									step="0.01"
									min="0"
									bind:value={tierForm.metadata.pricing.base_price}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700">Quality Score (1-5)</label>
								<input
									type="number"
									min="1"
									max="5"
									bind:value={tierForm.metadata.quality_score}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								/>
							</div>

							<div class="md:col-span-2">
								<label class="block text-sm font-medium text-gray-700">Delivery Time</label>
								<input
									type="text"
									bind:value={tierForm.metadata.delivery_time}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								/>
							</div>
						</div>
					</div>

					<div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
						<button
							type="submit"
							disabled={loading}
							class="inline-flex w-full justify-center rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-500 disabled:opacity-50 sm:ml-3 sm:w-auto"
						>
							{loading ? 'Updating...' : 'Update Tier'}
						</button>
						<button
							type="button"
							onclick={onClose}
							class="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
