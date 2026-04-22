<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
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
	import { addToast } from '$lib/stores/toasts';
	import type { CategoryMetadata, CategoryInsert, CategoryUpdate } from '$lib/services/categories';

	// Props from load function
	interface Props {
		data: {
			platform: CategoryMetadata;
			tiers: CategoryMetadata[];
		};
	}

	let { data }: Props = $props();

	let platform = $state(data.platform);
	let tiers = $state(data.tiers);
	let loading = $state(false);
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let selectedTier = $state<CategoryMetadata | null>(null);

	// Form state for creating/editing tiers
	let tierForm = $state({
		name: '',
		slug: '',
		description: '',
		metadata: {
			follower_range: {
				min: 0,
				max: 1000,
				display: '0-1K'
			},
			pricing: {
				base_price: 0.0,
				bulk_discount: 0,
				currency: 'NGN'
			},
			features: [],
			quality_score: 5,
			delivery_time: '24-48 hours',
			replacement_guarantee: true
		}
	});

	// Auto-generate slug from name (GLOBAL SLUG - no platform prefix)
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
		tierForm = {
			name: tier.name as string,
			slug: tier.slug as string,
			description: (tier.description as string) || '',
			metadata: { ...(tier.metadata as any) }
		};
		showEditModal = true;
	}

	function resetForm() {
		tierForm = {
			name: '',
			slug: '',
			description: '',
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
		if (!platform) return;

		loading = true;
		try {
			const newTier: CategoryInsert = {
				name: tierForm.name,
				slug: tierForm.slug,
				description: tierForm.description || null,
				categoryType: 'tier',
				parentId: null, // GLOBAL TIER - no parent platform
				metadata: tierForm.metadata,
				isActive: true,
				sortOrder: tiers.length + 1
			};

			const result = await createCategory(newTier);
			if (result.error) {
				console.error('Failed to create tier:', result.error);
				addToast({
					type: 'error',
					title: 'Failed to create tier',
					message: result.error,
					duration: 4000
				});
			} else {
				// Add to local state instead of reloading
				tiers = [...tiers, result.data!];
				showCreateModal = false;
				resetForm();
				addToast({
					type: 'success',
					title: 'Tier created successfully',
					duration: 3000
				});
			}
		} catch (error) {
			console.error('Failed to create tier:', error);
			addToast({
				type: 'error',
				title: 'Failed to create tier',
				duration: 3000
			});
		} finally {
			loading = false;
		}
	}

	async function handleUpdate() {
		if (!selectedTier) return;

		loading = true;
		try {
			const updates: CategoryUpdate = {
				name: tierForm.name,
				slug: tierForm.slug,
				description: tierForm.description || null,
				metadata: tierForm.metadata
			};

			const result = await updateCategory(selectedTier.id as string, updates);
			if (result.error) {
				console.error('Failed to update tier:', result.error);
				addToast({
					type: 'error',
					title: 'Failed to update tier',
					message: result.error,
					duration: 4000
				});
			} else {
				// Update local state instead of reloading
				tiers = tiers.map((t) => (t.id === selectedTier!.id ? result.data! : t));
				showEditModal = false;
				selectedTier = null;
				addToast({
					type: 'success',
					title: 'Tier updated successfully',
					duration: 3000
				});
			}
		} catch (error) {
			console.error('Failed to update tier:', error);
			addToast({
				type: 'error',
				title: 'Failed to update tier',
				duration: 3000
			});
		} finally {
			loading = false;
		}
	}

	async function handleDelete(tier: CategoryMetadata) {
		if (
			!confirm(
				`Are you sure you want to delete ${tier.name}? This will also delete all associated accounts.`
			)
		) {
			return;
		}

		loading = true;
		try {
			const result = await deleteCategory(tier.id as string);
			if (result.error) {
				console.error('Failed to delete tier:', result.error);
				addToast({
					type: 'error',
					title: 'Failed to delete tier',
					message: result.error,
					duration: 4000
				});
			} else {
				// Remove from local state instead of reloading
				tiers = tiers.filter((t) => t.id !== tier.id);
				addToast({
					type: 'success',
					title: 'Tier deleted successfully',
					duration: 3000
				});
			}
		} catch (error) {
			console.error('Failed to delete tier:', error);
			addToast({
				type: 'error',
				title: 'Failed to delete tier',
				duration: 3000
			});
		} finally {
			loading = false;
		}
	}

	function updateFollowerDisplay() {
		const min = tierForm.metadata.follower_range.min;
		const max = tierForm.metadata.follower_range.max;

		if (max >= 1000000) {
			tierForm.metadata.follower_range.display = `${(min / 1000000).toFixed(min % 1000000 === 0 ? 0 : 1)}M-${(max / 1000000).toFixed(max % 1000000 === 0 ? 0 : 1)}M`;
		} else if (max >= 1000) {
			tierForm.metadata.follower_range.display = `${(min / 1000).toFixed(min % 1000 === 0 ? 0 : 1)}K-${(max / 1000).toFixed(max % 1000 === 0 ? 0 : 1)}K`;
		} else {
			tierForm.metadata.follower_range.display = `${min}-${max}`;
		}
	}

	// Generate auto-SKU based on platform and tier
	function generateAutoSKU(tier: CategoryMetadata): string {
		if (!platform) return '';
		const platformCode = (platform.slug as string).substring(0, 3).toUpperCase();
		const tierCode =
			(tier.metadata as any)?.follower_range?.display?.replace(/[^a-zA-Z0-9]/g, '') || '';
		return `${platformCode}-${tierCode}`;
	}

	function formatFollowerCount(count: number): string {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		} else if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}K`;
		}
		return count.toString();
	}
</script>

<svelte:head>
	<title>{platform?.name} Tiers - Admin Panel</title>
</svelte:head>

<div class="p-3 sm:p-6">
	<!-- Header -->
	<div class="mb-6">
		<div class="mb-4 flex items-center gap-4">
			<button
				onclick={() => goto('/admin/platforms')}
				class="flex items-center gap-2 text-gray-600 hover:text-gray-900"
			>
				<ArrowLeft size={20} />
				Back to Platforms
			</button>
		</div>

		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				{#if platform}
					{#if (platform.metadata as any)?.icon}
						<img
							src={(platform.metadata as any).icon}
							alt={platform.name as string}
							class="h-12 w-12 rounded-lg"
						/>
					{:else}
						<div
							class="flex h-12 w-12 items-center justify-center rounded-lg text-xl font-bold text-white"
							style="background-color: {(platform.metadata as any)?.color || '#3B82F6'}"
						>
							{(platform.name as string).charAt(0)}
						</div>
					{/if}
					<div>
						<h1 class="text-2xl font-bold text-gray-900">{platform.name} - Global Tiers</h1>
						<p class="text-gray-600">
							Manage global tiers that work across all platforms (including {platform.name})
						</p>
					</div>
				{/if}
			</div>
			<button
				onclick={openCreateModal}
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-all hover:bg-blue-700 active:scale-95"
			>
				<Plus size={18} />
				Add Tier
			</button>
		</div>

		<!-- Global Tiers Notice -->
		<div class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
			<div class="flex items-start gap-3">
				<AlertCircle class="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
				<div class="text-sm">
					<p class="mb-1 font-medium text-amber-900">Important: Global Tier System</p>
					<p class="text-amber-700">
						Tiers created here are <strong>global</strong> and work across ALL platforms. When you create
						a "500 Followers" tier, it will contain accounts from Instagram, TikTok, and all other platforms.
						Platform pages will automatically filter these global tiers to show only relevant accounts.
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Tiers List -->
	{#if loading}
		<div class="flex h-64 items-center justify-center">
			<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
		</div>
	{:else if tiers.length === 0}
		<div class="py-12 text-center">
			<Package class="mx-auto mb-4 h-12 w-12 text-gray-400" />
			<h3 class="mb-2 text-lg font-medium text-gray-900">No tiers found</h3>
			<p class="mb-4 text-gray-500">Create your first follower tier to get started.</p>
			<button
				onclick={openCreateModal}
				class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-all hover:bg-blue-700 active:scale-95"
			>
				<Plus class="mr-2 h-4 w-4" />
				Add Tier
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each tiers as tier}
				<div class="rounded-lg border border-gray-200 bg-white p-6 shadow">
					<!-- Tier Header -->
					<div class="mb-4 flex items-start justify-between">
						<div>
							<h3 class="flex items-center gap-2 font-semibold text-gray-900">
								<Target class="h-4 w-4 text-purple-600" />
								{tier.name}
							</h3>
							<p class="text-sm text-gray-500">Global Tier • All Platforms</p>
						</div>
						<div class="flex items-center gap-1">
							<button
								onclick={() => openEditModal(tier)}
								class="rounded p-1 text-gray-400 hover:text-blue-600"
								title="Edit Tier"
							>
								<Edit size={16} />
							</button>
							<button
								onclick={() => handleDelete(tier)}
								class="rounded p-1 text-gray-400 hover:text-red-600"
								title="Delete Tier"
							>
								<Trash2 size={16} />
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
								{(tier.metadata as any)?.follower_range?.display || 'N/A'}
							</span>
						</div>

						<!-- Pricing -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<DollarSign size={16} class="text-gray-400" />
								<span class="text-sm text-gray-600">Base Price</span>
							</div>
							<span class="text-sm font-medium text-gray-900">
								₦{((tier.metadata as any)?.pricing?.base_price || 0).toFixed(2)}
							</span>
						</div>

						<!-- Quality Score -->
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Quality</span>
							<div class="flex items-center gap-1">
								{#each Array(5) as _, i}
									<div
										class="h-2 w-2 rounded-full {i < ((tier.metadata as any)?.quality_score || 0)
											? 'bg-yellow-400'
											: 'bg-gray-200'}"
									></div>
								{/each}
								<span class="ml-1 text-sm text-gray-500"
									>({(tier.metadata as any)?.quality_score || 0}/5)</span
								>
							</div>
						</div>

						<!-- Delivery Time -->
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Delivery</span>
							<span class="text-sm font-medium text-gray-900">
								{(tier.metadata as any)?.delivery_time || 'N/A'}
							</span>
						</div>

						<!-- Status -->
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Status</span>
							<span class="text-sm font-medium {tier.isActive ? 'text-green-600' : 'text-red-600'}">
								{tier.isActive ? 'Active' : 'Inactive'}
							</span>
						</div>
					</div>

					<!-- Features -->
					{#if (tier.metadata as any)?.features && (tier.metadata as any).features.length > 0}
						<div class="mt-4 border-t border-gray-200 pt-4">
							<h4 class="mb-2 text-sm font-medium text-gray-900">Features</h4>
							<div class="flex flex-wrap gap-1">
								{#each (tier.metadata as any).features as feature}
									<span
										class="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
									>
										{feature}
									</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Create Tier Modal -->
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
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleCreate();
					}}
				>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="text-lg font-semibold text-gray-900">Add New Tier</h3>
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
									value={tierForm.name}
									oninput={(e) => {
										tierForm.name = (e.target as HTMLInputElement).value;
										generateSlug(tierForm.name);
									}}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="e.g., Micro Influencer"
								/>
							</div>

							<!-- Slug -->
							<div class="md:col-span-2">
								<label for="slug" class="block text-sm font-medium text-gray-700">Slug *</label>
								<input
									id="slug"
									type="text"
									required
									value={tierForm.slug}
									oninput={(e) => (tierForm.slug = (e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="Auto-generated"
								/>
							</div>

							<!-- Description -->
							<div class="md:col-span-2">
								<label for="description" class="block text-sm font-medium text-gray-700"
									>Description</label
								>
								<textarea
									id="description"
									rows="2"
									value={tierForm.description}
									oninput={(e) => (tierForm.description = (e.target as HTMLTextAreaElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="Tier description..."
								></textarea>
							</div>

							<!-- Follower Range -->
							<div>
								<label class="block text-sm font-medium text-gray-700">Min Followers</label>
								<input
									type="number"
									min="0"
									value={tierForm.metadata.follower_range.min}
									oninput={(e) => {
										tierForm.metadata.follower_range.min =
											parseInt((e.target as HTMLInputElement).value) || 0;
										updateFollowerDisplay();
									}}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700">Max Followers</label>
								<input
									type="number"
									min="0"
									value={tierForm.metadata.follower_range.max}
									oninput={(e) => {
										tierForm.metadata.follower_range.max =
											parseInt((e.target as HTMLInputElement).value) || 0;
										updateFollowerDisplay();
									}}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Display Range (read-only) -->
							<div class="md:col-span-2">
								<label class="block text-sm font-medium text-gray-700">Display Range</label>
								<input
									type="text"
									readonly
									value={tierForm.metadata.follower_range.display}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2"
								/>
							</div>

							<!-- Base Price -->
							<div>
								<label class="block text-sm font-medium text-gray-700">Base Price (₦)</label>
								<input
									type="number"
									step="0.01"
									min="0"
									value={tierForm.metadata.pricing.base_price}
									oninput={(e) =>
										(tierForm.metadata.pricing.base_price =
											parseFloat((e.target as HTMLInputElement).value) || 0)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Quality Score -->
							<div>
								<label class="block text-sm font-medium text-gray-700">Quality Score (1-5)</label>
								<input
									type="number"
									min="1"
									max="5"
									value={tierForm.metadata.quality_score}
									oninput={(e) =>
										(tierForm.metadata.quality_score =
											parseInt((e.target as HTMLInputElement).value) || 5)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Delivery Time -->
							<div class="md:col-span-2">
								<label class="block text-sm font-medium text-gray-700">Delivery Time</label>
								<input
									type="text"
									value={tierForm.metadata.delivery_time}
									oninput={(e) =>
										(tierForm.metadata.delivery_time = (e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="e.g., 24-48 hours"
								/>
							</div>
						</div>
					</div>

					<div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
						<button
							type="submit"
							disabled={loading}
							class="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 sm:ml-3 sm:w-auto"
						>
							{loading ? 'Creating...' : 'Create Tier'}
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

<!-- Edit Tier Modal (similar structure to create modal) -->
{#if showEditModal && selectedTier}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				class="bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity"
				onclick={() => (showEditModal = false)}
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl"
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleUpdate();
					}}
				>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="text-lg font-semibold text-gray-900">Edit Tier</h3>
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<!-- Same form fields as create modal but with edit- prefixed IDs -->
							<div class="md:col-span-2">
								<label for="edit-name" class="block text-sm font-medium text-gray-700"
									>Tier Name *</label
								>
								<input
									id="edit-name"
									type="text"
									required
									value={tierForm.name}
									oninput={(e) => (tierForm.name = (e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div class="md:col-span-2">
								<label for="edit-slug" class="block text-sm font-medium text-gray-700">Slug *</label
								>
								<input
									id="edit-slug"
									type="text"
									required
									value={tierForm.slug}
									oninput={(e) => (tierForm.slug = (e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div class="md:col-span-2">
								<label for="edit-description" class="block text-sm font-medium text-gray-700"
									>Description</label
								>
								<textarea
									id="edit-description"
									rows="2"
									value={tierForm.description}
									oninput={(e) => (tierForm.description = (e.target as HTMLTextAreaElement).value)}
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								></textarea>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700">Min Followers</label>
								<input
									type="number"
									min="0"
									value={tierForm.metadata.follower_range.min}
									oninput={(e) => {
										tierForm.metadata.follower_range.min =
											parseInt((e.target as HTMLInputElement).value) || 0;
										updateFollowerDisplay();
									}}
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700">Max Followers</label>
								<input
									type="number"
									min="0"
									value={tierForm.metadata.follower_range.max}
									oninput={(e) => {
										tierForm.metadata.follower_range.max =
											parseInt((e.target as HTMLInputElement).value) || 0;
										updateFollowerDisplay();
									}}
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div class="md:col-span-2">
								<label class="block text-sm font-medium text-gray-700">Display Range</label>
								<input
									type="text"
									readonly
									value={tierForm.metadata.follower_range.display}
									class="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 shadow-sm"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700">Base Price (₦)</label>
								<input
									type="number"
									step="0.01"
									min="0"
									value={tierForm.metadata.pricing.base_price}
									oninput={(e) =>
										(tierForm.metadata.pricing.base_price =
											parseFloat((e.target as HTMLInputElement).value) || 0)}
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700">Quality Score (1-5)</label>
								<input
									type="number"
									min="1"
									max="5"
									value={tierForm.metadata.quality_score}
									oninput={(e) =>
										(tierForm.metadata.quality_score =
											parseInt((e.target as HTMLInputElement).value) || 5)}
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div class="md:col-span-2">
								<label class="block text-sm font-medium text-gray-700">Delivery Time</label>
								<input
									type="text"
									value={tierForm.metadata.delivery_time}
									oninput={(e) =>
										(tierForm.metadata.delivery_time = (e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>
					</div>

					<div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
						<button
							type="submit"
							disabled={loading}
							class="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 sm:ml-3 sm:w-auto"
						>
							{loading ? 'Updating...' : 'Update Tier'}
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
