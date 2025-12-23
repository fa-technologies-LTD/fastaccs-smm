<script lang="ts">
	import {
		Plus,
		Edit,
		Trash2,
		Users,
		DollarSign,
		Package,
		AlertCircle,
		Target
	} from '@lucide/svelte';
	import { createCategory, updateCategory, deleteCategory } from '$lib/services/categories';
	import { showSuccess, showError } from '$lib/stores/toasts';
	import type { CategoryMetadata, CategoryInsert, CategoryUpdate } from '$lib/services/categories';
	import type { PageData } from './$types';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let tiers = $state<CategoryMetadata[]>(data.tiers);
	let platforms = $state<CategoryMetadata[]>(data.platforms);
	let loading = $state(false);
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let selectedTier = $state<CategoryMetadata | null>(null);

	// Form state for creating/editing tiers
	let tierForm = $state({
		name: '',
		slug: '',
		description: '',
		parentId: '', // Platform selection
		metadata: {
			follower_range: {
				min: 0,
				max: 1000,
				display: '0-1K'
			},
			pricing: {
				base_price: 0.0,
				bulk_discount: 0,
				currency: 'USD'
			},
			features: [] as string[],
			quality_score: 5,
			delivery_time: '24-48 hours',
			replacement_guarantee: true
		}
	});

	// Show error if data loading failed
	if (data.error) {
		showError('Failed to load  tiers', data.error);
	}

	// Auto-generate slug from name (no platform prefix for  tiers)
	const generateSlug = (name: string) => {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	};

	// Watch name changes to auto-generate slug
	$effect(() => {
		if (tierForm.name && !tierForm.slug) {
			tierForm.slug = generateSlug(tierForm.name);
		}
	});

	function openCreateModal() {
		resetForm();
		showCreateModal = true;
	}

	function openEditModal(tier: CategoryMetadata) {
		selectedTier = tier;
		const metadata = tier.metadata as any;
		tierForm = {
			name: tier.name as string,
			slug: tier.slug as string,
			description: (tier.description as string) || '',
			parentId: (tier.parentId as string) || '',
			metadata: {
				follower_range: metadata?.follower_range || {
					min: 0,
					max: 1000,
					display: '0-1K'
				},
				pricing: metadata?.pricing || {
					base_price: 0.0,
					bulk_discount: 0,
					currency: 'USD'
				},
				features: metadata?.features || [],
				quality_score: metadata?.quality_score || 5,
				delivery_time: metadata?.delivery_time || '24-48 hours',
				replacement_guarantee: metadata?.replacement_guarantee ?? true
			}
		};
		showEditModal = true;
	}

	function resetForm() {
		tierForm = {
			name: '',
			slug: '',
			description: '',
			parentId: '',
			metadata: {
				follower_range: {
					min: 0,
					max: 1000,
					display: '0-1K'
				},
				pricing: {
					base_price: 0.0,
					bulk_discount: 0,
					currency: 'USD'
				},
				features: [],
				quality_score: 5,
				delivery_time: '24-48 hours',
				replacement_guarantee: true
			}
		};
	}

	async function handleCreate() {
		loading = true;
		try {
			// Clean up empty features
			const cleanedMetadata = {
				...tierForm.metadata,
				features: tierForm.metadata.features.filter((feature) => feature.trim() !== '')
			};

			const newTier: CategoryInsert = {
				name: tierForm.name,
				slug: tierForm.slug,
				description: tierForm.description || null,
				categoryType: 'tier',
				parentId: tierForm.parentId, // Tier belongs to a platform
				metadata: cleanedMetadata,
				isActive: true,
				sortOrder: tiers.length + 1
			};

			const result = await createCategory(newTier);
			if (result.error) {
				showError('Failed to create tier', result.error);
			} else {
				tiers = [...tiers, result.data!];
				showCreateModal = false;
				const selectedPlatform = platforms.find((p) => p.id === tierForm.parentId);
				showSuccess(
					'Tier created successfully',
					`${tierForm.name} has been created for ${selectedPlatform?.name || 'the selected platform'}`
				);
				resetForm();
			}
		} catch (error) {
			console.error('Failed to create tier:', error);
			showError('Failed to create tier', 'An unexpected error occurred');
		} finally {
			loading = false;
		}
	}

	async function handleUpdate() {
		if (!selectedTier) return;

		loading = true;
		try {
			// Clean up empty features
			const cleanedMetadata = {
				...tierForm.metadata,
				features: tierForm.metadata.features.filter((feature) => feature.trim() !== '')
			};

			const updates: CategoryUpdate = {
				name: tierForm.name,
				slug: tierForm.slug,
				description: tierForm.description || null,
				metadata: cleanedMetadata
			};

			const result = await updateCategory(selectedTier.id as string, updates);
			if (result.error) {
				showError('Failed to update tier', result.error);
			} else {
				tiers = tiers.map((t) => (t.id === selectedTier!.id ? result.data! : t));
				showEditModal = false;
				showSuccess(' tier updated successfully', `${tierForm.name} has been updated`);
				selectedTier = null;
			}
		} catch (error) {
			console.error('Failed to update tier:', error);
			showError('Failed to update tier', 'An unexpected error occurred');
		} finally {
			loading = false;
		}
	}

	async function handleDelete(tier: CategoryMetadata) {
		if (
			!confirm(
				`Are you sure you want to delete "${tier.name}"? This will affect all platforms and associated accounts.`
			)
		) {
			return;
		}

		loading = true;
		try {
			const result = await deleteCategory(tier.id as string);
			if (result.error) {
				showError('Failed to delete tier', result.error);
			} else {
				tiers = tiers.filter((t) => t.id !== tier.id);
				showSuccess(' tier deleted', `${tier.name} has been removed from all platforms`);
			}
		} catch (error) {
			console.error('Failed to delete tier:', error);
			showError('Failed to delete tier', 'An unexpected error occurred');
		} finally {
			loading = false;
		}
	}

	// Helper function to format follower count
	function formatFollowers(count: number): string {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		} else if (count >= 1000) {
			return `${(count / 1000).toFixed(0)}K`;
		}
		return count.toString();
	}
</script>

<svelte:head>
	<title>Tier Management - Admin Panel</title>
</svelte:head>

<div class="p-4 sm:p-6">
	<!-- Header -->
	<div class="mb-6">
		<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0 flex-1">
				<div class="mb-2 flex items-center gap-3">
					<Target class="h-5 w-5 text-purple-600 sm:h-6 sm:w-6" />
					<h1 class="text-xl font-bold text-gray-900 sm:text-2xl">Tier Management</h1>
				</div>
				<p class="text-sm text-gray-600 sm:text-base">
					Manage follower tiers that work across all platforms. Accounts from any platform can be
					assigned to these tiers.
				</p>
			</div>
			<button
				onclick={openCreateModal}
				class="cursor-pointer flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-white transition-all hover:bg-purple-700 sm:w-auto sm:py-2 hover:scale-95"
			>
				<Plus size={18} />
				Add Tier
			</button>
		</div>

		<!-- Info Banner -->
		<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
			<div class="flex items-start gap-3">
				<AlertCircle class="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
				<div class="text-sm">
					<p class="mb-1 font-medium text-blue-900">How Tiers Work</p>
					<p class="text-blue-700">
						tiers (like "500 Followers") contain accounts from ALL platforms. When customers visit a
						platform page, they see these tiers with account counts filtered by that platform. This
						allows you to manage one set of tiers instead of separate tiers for each platform.
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Tiers List -->
	{#if loading}
		<div class="flex h-64 items-center justify-center">
			<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-purple-600"></div>
		</div>
	{:else if tiers.length === 0}
		<div class="py-12 text-center">
			<Target class="mx-auto mb-4 h-12 w-12 text-gray-400" />
			<h3 class="mb-2 text-lg font-medium text-gray-900">No tiers found</h3>
			<p class="mb-4 text-gray-500">
				Create your first follower tier to get started. It will be available across all platforms.
			</p>
			<button
				onclick={openCreateModal}
				class="inline-flex items-center rounded-md bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700"
			>
				<Plus class="mr-2 h-4 w-4" />
				Add Tier
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each tiers as tier}
				{@const metadata = tier.metadata as any}
				<div
					class="rounded-lg border border-gray-200 bg-white p-6"
				>
					<!-- Tier Header -->
					<div class="mb-4 flex items-start justify-between">
						<div>
							<h3 class="flex items-center gap-2 font-semibold text-gray-900">
								<Target class="h-4 w-4 text-purple-600" />
								{tier.name}
							</h3>
							<p class="mt-1 text-sm text-gray-500">Tier • All Platforms</p>
						</div>
						<div class="flex items-center gap-1">
							<button
								onclick={() => openEditModal(tier)}
								class="group rounded p-1 text-gray-400 transition-colors hover:text-purple-600"
								title="Edit Tier"
							>
								<Edit size={16} class='group-hover:scale-90 transition-transform' />
							</button>
							<button
								onclick={() => handleDelete(tier)}
								class="group rounded p-1 text-gray-400 transition-colors hover:text-red-600"
								title="Delete Tier"
							>
								<Trash2 size={16} class='group-hover:scale-90 transition-transform' />
							</button>
						</div>
					</div>

					<!-- Tier Description -->
					{#if tier.description}
						<p class="mb-4 text-sm text-gray-600">{tier.description}</p>
					{/if}

					<!-- Tier Stats -->
					<div class="space-y-3">
						<!-- Follower Range -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Users size={16} class="text-gray-400" />
								<span class="text-sm text-gray-600">Followers</span>
							</div>
							<span class="text-sm font-medium text-gray-900">
								{metadata?.follower_range?.display || 'N/A'}
							</span>
						</div>

						<!-- Pricing -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<DollarSign size={16} class="text-gray-400" />
								<span class="text-sm text-gray-600">Base Price</span>
							</div>
							<span class="text-sm font-medium text-gray-900">
								${metadata?.pricing?.base_price || 0}
							</span>
						</div>

						<!-- Quality Score -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Package size={16} class="text-gray-400" />
								<span class="text-sm text-gray-600">Quality</span>
							</div>
							<div class="flex items-center gap-1">
								{#each Array(5) as _, i}
									<div
										class="h-2 w-2 rounded-full {i < (metadata?.quality_score || 0)
											? 'bg-yellow-400'
											: 'bg-gray-200'}"
									></div>
								{/each}
							</div>
						</div>

						<!-- Delivery Time -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<AlertCircle size={16} class="text-gray-400" />
								<span class="text-sm text-gray-600">Delivery</span>
							</div>
							<span class="text-sm font-medium text-gray-900">
								{metadata?.delivery_time || 'N/A'}
							</span>
						</div>
					</div>

					<!-- Features -->
					{#if metadata?.features && metadata.features.length > 0}
						<div class="mt-4 border-t border-gray-100 pt-4">
							<h4 class="mb-2 text-sm font-semibold text-gray-700">Features:</h4>
							<div class="flex flex-wrap gap-1">
								{#each metadata.features.slice(0, 3) as feature}
									<span
										class="inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800"
									>
										{feature}
									</span>
								{/each}
								{#if metadata.features.length > 3}
									<span class="text-xs text-gray-500">+{metadata.features.length - 3} more</span>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Create  Tier Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				class="fixed inset-0 bg-black/20 transition-opacity"
				onclick={() => (showCreateModal = false)}
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl"
				in:fly={{ y: 200, duration: 500 }}
				out:fade={{ duration: 500}}
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleCreate();
					}}
				>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="flex items-center gap-2 text-lg font-semibold text-gray-900">
								<Target class="h-5 w-5 text-purple-600" />
								Add New Tier
							</h3>
							<p class="mt-1 text-sm text-gray-600">
								This tier will be available for accounts from all platforms
							</p>
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<!-- Name -->
							<div class="md:col-span-2">
								<label for="name" class="block text-sm font-medium text-gray-700">Tier Name *</label
								>
								<input
									id="name"
									type="text"
									required
									bind:value={tierForm.name}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
									placeholder="e.g., 1K Followers"
								/>
							</div>

							<!-- Platform Selection -->
							<div class="md:col-span-2">
								<label for="platform" class="block text-sm font-medium text-gray-700"
									>Platform *</label
								>
								<select
									id="platform"
									required
									bind:value={tierForm.parentId}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
								>
									<option value="">Select a platform</option>
									{#each platforms as platform}
										<option value={platform.id}>{platform.name}</option>
									{/each}
								</select>
							</div>

							<!-- Slug -->
							<div class="md:col-span-2">
								<label for="slug" class="block text-sm font-medium text-gray-700">URL Slug *</label>
								<input
									id="slug"
									type="text"
									required
									bind:value={tierForm.slug}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
									placeholder="e.g., 1k-followers"
								/>
							</div>

							<!-- Description -->
							<div class="md:col-span-2">
								<label for="description" class="block text-sm font-medium text-gray-700"
									>Description</label
								>
								<textarea
									id="description"
									bind:value={tierForm.description}
									rows="2"
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-purple-500"
									placeholder="Brief description of this tier"
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
								<label class="block text-sm font-medium text-gray-700" >Min Followers</label>
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
									placeholder="e.g., 1K-5K"
								/>
							</div>

							<!-- Pricing -->
							<div>
								<label class="block text-sm font-medium text-gray-700">Base Price ($)</label>
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
									placeholder="e.g., 24-48 hours"
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
							{loading ? 'Creating...' : 'Create  Tier'}
						</button>
						<button
							type="button"
							onclick={() => (showCreateModal = false)}
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

<!-- Edit  Tier Modal (similar structure to create modal) -->
{#if showEditModal && selectedTier}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				
				class="fixed inset-0 bg-black/20 transition-opacity"
				onclick={() => (showEditModal = false)}
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl"
				in:fly={{ y: 200, duration: 500 }}
				out:fade={{ duration: 500}}
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleUpdate();
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
								<label class="block text-sm font-medium text-gray-700">Base Price ($)</label>
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
							{loading ? 'Updating...' : 'Update  Tier'}
						</button>
						<button
							type="button"
							onclick={() => (showEditModal = false)}
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
