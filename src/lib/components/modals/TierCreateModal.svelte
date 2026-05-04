<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { Plus, Trash2, Target } from '@lucide/svelte';
	import type { CategoryMetadata } from '$lib/services/categories';
	import TierSampleScreenshotFields from '$lib/components/modals/TierSampleScreenshotFields.svelte';

	interface Props {
		open: boolean;
		platforms: CategoryMetadata[];
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
				is_pinned: boolean;
				pin_priority: number;
				is_featured: boolean;
				featured_badge: string;
				delivery_mode: 'instant_auto' | 'manual_handover';
				manual_handover_promise: string;
				login_guide_url: string;
				login_guide_label: string;
			};
		};
		loading?: boolean;
		onClose: () => void;
		onCreate: () => void;
	}

	let {
		open,
		platforms,
		tierForm = $bindable(),
		loading = false,
		onClose,
		onCreate
	}: Props = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				class="fixed inset-0 bg-black/50 transition-opacity"
				tabindex="-1"
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
						onCreate();
					}}
				>
					<div class="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="flex items-center gap-2 text-lg font-semibold" style="color: var(--text);">
								<Target class="h-5 w-5" style="color: var(--primary);" />
								Add New Tier
							</h3>
							<p class="mt-1 text-sm" style="color: var(--text-muted);">
								This tier will be available for accounts from all platforms
							</p>
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<!-- Name -->
							<div class="md:col-span-2">
								<label for="name" class="block text-sm font-medium" style="color: var(--text);"
									>Tier Name *</label
								>
								<input
									id="name"
									type="text"
									required
									bind:value={tierForm.name}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
									placeholder="e.g., 1K Followers"
								/>
							</div>

							<!-- Platform Selection -->
							<div class="md:col-span-2">
								<label for="platform" class="block text-sm font-medium" style="color: var(--text);">
									Platform *
								</label>
								<select
									id="platform"
									required
									bind:value={tierForm.parentId}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								>
									<option value="">Select a platform</option>
									{#each platforms as platform}
										<option value={platform.id}>{platform.name}</option>
									{/each}
								</select>
							</div>

							<!-- Slug -->
							<div class="md:col-span-2">
								<label for="slug" class="block text-sm font-medium" style="color: var(--text);"
									>URL Slug *</label
								>
								<input
									id="slug"
									type="text"
									required
									bind:value={tierForm.slug}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
									placeholder="e.g., 1k-followers"
								/>
							</div>

							<!-- Description -->
							<div class="md:col-span-2">
								<label
									for="description"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Description
								</label>
								<textarea
									id="description"
									bind:value={tierForm.description}
									rows="2"
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
									placeholder="Brief description of this tier"
								></textarea>
							</div>

							<TierSampleScreenshotFields bind:urls={tierForm.metadata.sample_screenshot_urls} />

							<div
								class="md:col-span-2 rounded-lg p-3"
								style="border: 1px solid var(--border); background: var(--bg-elev-1);"
							>
								<div class="mb-2">
									<p class="text-sm font-semibold" style="color: var(--text);">Merchandising</p>
									<p class="text-xs" style="color: var(--text-muted);">
										Pin important tiers to the top and add a featured badge for visibility.
									</p>
								</div>
								<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
									<label
										class="flex items-center justify-between rounded-md px-3 py-2 text-sm"
										style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
									>
										<span>Pin this tier</span>
										<input
											type="checkbox"
											bind:checked={tierForm.metadata.is_pinned}
											onchange={() => {
												if (!tierForm.metadata.is_pinned) {
													tierForm.metadata.pin_priority = 100;
													return;
												}
												if (
													typeof tierForm.metadata.pin_priority !== 'number' ||
													tierForm.metadata.pin_priority < 1
												) {
													tierForm.metadata.pin_priority = 100;
												}
											}}
										/>
									</label>
									<label
										class="flex items-center justify-between rounded-md px-3 py-2 text-sm"
										style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
									>
										<span>Mark as featured</span>
										<input
											type="checkbox"
											bind:checked={tierForm.metadata.is_featured}
											onchange={() => {
												if (!tierForm.metadata.is_featured) {
													tierForm.metadata.featured_badge = 'Featured';
													return;
												}
												if (!tierForm.metadata.featured_badge.trim()) {
													tierForm.metadata.featured_badge = 'Featured';
												}
											}}
										/>
									</label>
								</div>

								{#if tierForm.metadata.is_pinned}
									<div class="mt-3">
										<label
											for="pin-priority"
											class="block text-sm font-medium"
											style="color: var(--text);"
										>
											Pin Priority (lower appears first)
										</label>
										<input
											id="pin-priority"
											type="number"
											min="1"
											bind:value={tierForm.metadata.pin_priority}
											class="mt-1 block w-full rounded-md px-4 py-2 sm:max-w-xs"
											style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
										/>
									</div>
								{/if}

								{#if tierForm.metadata.is_featured}
									<div class="mt-3">
										<label
											for="featured-badge"
											class="block text-sm font-medium"
											style="color: var(--text);"
										>
											Featured Badge Text
										</label>
										<input
											id="featured-badge"
											type="text"
											maxlength="40"
											bind:value={tierForm.metadata.featured_badge}
											class="mt-1 block w-full rounded-md px-4 py-2 sm:max-w-xs"
											style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
											placeholder="Featured"
										/>
									</div>
								{/if}
							</div>

							<div
								class="md:col-span-2 rounded-lg p-3"
								style="border: 1px solid var(--border); background: var(--bg-elev-1);"
							>
								<div class="mb-2">
									<p class="text-sm font-semibold" style="color: var(--text);">Delivery Handling</p>
									<p class="text-xs" style="color: var(--text-muted);">
										Choose whether this tier is delivered instantly or by manual WhatsApp handover.
									</p>
								</div>
								<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
									<label
										class="flex items-center justify-between rounded-md px-3 py-2 text-sm"
										style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
									>
										<span>Instant Delivery</span>
										<input
											type="radio"
											value="instant_auto"
											bind:group={tierForm.metadata.delivery_mode}
										/>
									</label>
									<label
										class="flex items-center justify-between rounded-md px-3 py-2 text-sm"
										style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
									>
										<span>Manual Handover (WhatsApp)</span>
										<input
											type="radio"
											value="manual_handover"
											bind:group={tierForm.metadata.delivery_mode}
										/>
									</label>
								</div>

								{#if tierForm.metadata.delivery_mode === 'manual_handover'}
									<div class="mt-3">
										<label
											for="manual-handover-promise"
											class="block text-sm font-medium"
											style="color: var(--text);"
										>
												Customer Message (Manual Handover (WhatsApp))
										</label>
										<input
											id="manual-handover-promise"
											type="text"
											maxlength="180"
											bind:value={tierForm.metadata.manual_handover_promise}
											class="mt-1 block w-full rounded-md px-4 py-2"
											style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
											placeholder="Secure WhatsApp handover by our team, usually within 15–60 minutes."
										/>
									</div>
								{/if}
							</div>

							<div
								class="md:col-span-2 rounded-lg p-3"
								style="border: 1px solid var(--border); background: var(--bg-elev-1);"
							>
								<div class="mb-2">
									<p class="text-sm font-semibold" style="color: var(--text);">Buyer Login Guide</p>
									<p class="text-xs" style="color: var(--text-muted);">
										Attach a per-tier login guide link so buyers can self-serve after purchase.
									</p>
								</div>
								<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
									<div class="md:col-span-2">
										<label for="login-guide-url" class="block text-sm font-medium" style="color: var(--text);"
											>Guide URL</label
										>
										<input
											id="login-guide-url"
											type="url"
											bind:value={tierForm.metadata.login_guide_url}
											class="mt-1 block w-full rounded-md px-4 py-2"
											style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
											placeholder="https://smm.fastaccs.com/support#after-purchase-guide"
										/>
									</div>
									<div class="md:col-span-2">
										<label for="login-guide-label" class="block text-sm font-medium" style="color: var(--text);"
											>Guide Label</label
										>
										<input
											id="login-guide-label"
											type="text"
											maxlength="80"
											bind:value={tierForm.metadata.login_guide_label}
											class="mt-1 block w-full rounded-md px-4 py-2"
											style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
											placeholder="How to login this account"
										/>
									</div>
								</div>
							</div>

							<!-- Features -->
							<div class="md:col-span-2">
								<label
									for="features"
									class="mb-2 block text-sm font-medium"
									style="color: var(--text);"
								>
									Features
								</label>
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
								<label
									for="min followers"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Min Followers
								</label>
								<input
									type="number"
									min="0"
									bind:value={tierForm.metadata.follower_range.min}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<div>
								<label
									for="max followers"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Max Followers
								</label>
								<input
									type="number"
									min="0"
									bind:value={tierForm.metadata.follower_range.max}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
								/>
							</div>

							<div>
								<label for="display text" class="block text-sm font-medium text-gray-700"
									>Display Text</label
								>
								<input
									type="text"
									bind:value={tierForm.metadata.follower_range.display}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
									placeholder="e.g., 1K-5K"
								/>
							</div>

							<!-- Pricing -->
							<div>
								<label
									for="base price"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Base Price (₦)
								</label>
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
								<label for="quality score" class="block text-sm font-medium text-gray-700"
									>Quality Score (1-5)</label
								>
								<input
									type="number"
									min="1"
									max="5"
									bind:value={tierForm.metadata.quality_score}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								/>
							</div>

							<div class="md:col-span-2">
								<label
									for="delivery time"
									class="block text-sm font-medium"
									style="color: var(--text);"
								>
									Delivery Time
								</label>
								<input
									type="text"
									bind:value={tierForm.metadata.delivery_time}
									class="mt-1 block w-full rounded-md px-4 py-2"
									style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
									placeholder="e.g., 24-48 hours"
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
							{loading ? 'Creating...' : 'Create  Tier'}
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
