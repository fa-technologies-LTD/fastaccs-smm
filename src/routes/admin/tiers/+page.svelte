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
	import {
		applyTierSampleScreenshotSanitization,
		sanitizeTierSampleScreenshotUrls
	} from '$lib/helpers/tierSampleScreenshots';
	import type { PageData } from './$types';
	import { fade, fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import TierCreateModal from '$lib/components/modals/TierCreateModal.svelte';
	import TierEditModal from '$lib/components/modals/TierEditModal.svelte';
	import TierDeleteModal from '$lib/components/modals/TierDeleteModal.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let tiers = $state<CategoryMetadata[]>(data.tiers);
	let platforms = $state<CategoryMetadata[]>(data.platforms);
	let loading = $state(false);
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);
	let selectedTier = $state<CategoryMetadata | null>(null);
	let tierToDelete = $state<CategoryMetadata | null>(null);

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
				currency: 'NGN'
			},
			features: [] as string[],
			quality_score: 5,
			delivery_time: '24-48 hours',
			replacement_guarantee: true,
			sample_screenshot_urls: [] as string[]
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
					currency: 'NGN'
				},
				features: metadata?.features || [],
				quality_score: metadata?.quality_score || 5,
				delivery_time: metadata?.delivery_time || '24-48 hours',
				replacement_guarantee: metadata?.replacement_guarantee ?? true,
				sample_screenshot_urls: sanitizeTierSampleScreenshotUrls(metadata?.sample_screenshot_urls)
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
					currency: 'NGN'
				},
				features: [],
				quality_score: 5,
				delivery_time: '24-48 hours',
				replacement_guarantee: true,
				sample_screenshot_urls: []
			}
		};
	}

	async function handleCreate() {
		try {
			// Clean up empty features
			const cleanedMetadata = applyTierSampleScreenshotSanitization({
				...tierForm.metadata,
				features: tierForm.metadata.features.filter((feature) => feature.trim() !== '')
			});

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
		}
	}

	async function handleUpdate() {
		if (!selectedTier) return;

		loading = true;
		try {
			// Clean up empty features
			const cleanedMetadata = applyTierSampleScreenshotSanitization({
				...tierForm.metadata,
				features: tierForm.metadata.features.filter((feature) => feature.trim() !== '')
			});

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

	function openDeleteModal(tier: CategoryMetadata) {
		tierToDelete = tier;
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		tierToDelete = null;
	}

	async function confirmDelete() {
		if (!tierToDelete) return;

		try {
			const result = await deleteCategory(tierToDelete.id as string);
			if (result.error) {
				showError('Failed to delete tier', result.error);
			} else {
				tiers = tiers.filter((t) => t.id !== tierToDelete!.id);
				showSuccess('Tier deleted', `${tierToDelete.name} has been removed from all platforms`);
				closeDeleteModal();
			}
		} catch (error) {
			console.error('Failed to delete tier:', error);
			showError('Failed to delete tier', 'An unexpected error occurred');
		}
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
					<Target class="h-5 w-5 sm:h-6 sm:w-6" style="color: #a855f7;" />
					<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text)">Tier Management</h1>
				</div>
				<p class="text-sm sm:text-base" style="color: var(--text-muted)">
					Manage follower tiers that work across all platforms. Accounts from any platform can be
					assigned to these tiers.
				</p>
			</div>
			<button
				onclick={openCreateModal}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-3 text-white transition-all hover:scale-95 active:scale-90 sm:w-auto sm:py-2"
				style="background: #a855f7;"
			>
				<Plus size={18} />
				Add Tier
			</button>
		</div>

		<!-- Info Banner -->
		<div
			class="rounded-lg p-4"
			style="border: 1px solid rgba(105,109,250,0.3); background: rgba(105,109,250,0.08);"
		>
			<div class="flex items-start gap-3">
				<AlertCircle class="mt-0.5 h-5 w-5 flex-shrink-0" style="color: var(--link);" />
				<div class="text-sm">
					<p class="mb-1 font-medium" style="color: var(--link)">How Tiers Work</p>
					<p style="color: var(--text-muted)">
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
			<Target class="mx-auto mb-4 h-12 w-12" style="color: var(--text-dim);" />
			<h3 class="mb-2 text-lg font-medium" style="color: var(--text)">No tiers found</h3>
			<p class="mb-4" style="color: var(--text-muted)">
				Create your first follower tier to get started. It will be available across all platforms.
			</p>
			<button
				onclick={openCreateModal}
				class="inline-flex items-center rounded-full px-4 py-2 font-medium text-white transition-all active:scale-95"
				style="background: #a855f7;"
			>
				<Plus class="mr-2 h-4 w-4" />
				Add Tier
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each tiers as tier (tier.id)}
				{@const metadata = tier.metadata as any}
				<div
					animate:flip={{ duration: 500 }}
					class="rounded-lg p-6"
					style="background: var(--bg-elev-1); border: 1px solid var(--border)"
				>
					<!-- Tier Header -->
					<div class="mb-4 flex items-start justify-between">
						<div>
							<h3 class="flex items-center gap-2 font-semibold" style="color: var(--text);">
								<Target class="h-4 w-4" style="color: #a855f7;" />
								{tier.name}
							</h3>
							<p class="mt-1 text-sm" style="color: var(--text-muted)">Tier • All Platforms</p>
						</div>
						<div class="flex items-center gap-1">
							<button
								onclick={() => openEditModal(tier)}
								class="group rounded p-1 transition-colors"
								style="color: var(--text-dim);"
								title="Edit Tier"
							>
								<Edit size={16} class="transition-transform group-hover:scale-90" />
							</button>
							<button
								onclick={() => openDeleteModal(tier)}
								class="group rounded p-1 transition-colors"
								style="color: var(--text-dim);"
								title="Delete Tier"
							>
								<Trash2 size={16} class="transition-transform group-hover:scale-90" />
							</button>
						</div>
					</div>

					<!-- Tier Description -->
					{#if tier.description}
						<p class="mb-4 text-sm" style="color: var(--text-muted);">{tier.description}</p>
					{/if}

					<!-- Tier Stats -->
					<div class="space-y-3">
						<!-- Follower Range -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Users size={16} style="color: var(--text-dim);" />
								<span class="text-sm" style="color: var(--text-muted)">Followers</span>
							</div>
							<span class="text-sm font-medium" style="color: var(--text);">
								{metadata?.follower_range?.display || 'N/A'}
							</span>
						</div>

						<!-- Pricing -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<DollarSign size={16} style="color: var(--text-dim);" />
								<span class="text-sm" style="color: var(--text-muted)">Base Price</span>
							</div>
							<span class="text-sm font-medium" style="color: var(--text);">
								₦{metadata?.pricing?.base_price || 0}
							</span>
						</div>

						<!-- Quality Score -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Package size={16} style="color: var(--text-dim);" />
								<span class="text-sm" style="color: var(--text-muted)">Quality</span>
							</div>
							<div class="flex items-center gap-1">
								{#each Array(5) as _, i}
									<div
										class="h-2 w-2 rounded-full"
										style="background: {i < (metadata?.quality_score || 0)
											? '#fbbf24'
											: 'var(--border)'}"
									></div>
								{/each}
							</div>
						</div>

						<!-- Delivery Time -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<AlertCircle size={16} style="color: var(--text-dim);" />
								<span class="text-sm" style="color: var(--text-muted)">Delivery</span>
							</div>
							<span class="text-sm font-medium" style="color: var(--text);">
								{metadata?.delivery_time || 'N/A'}
							</span>
						</div>
					</div>

					<!-- Features -->
					{#if metadata?.features && metadata.features.length > 0}
						<div class="mt-4 pt-4" style="border-top: 1px solid var(--border)">
							<h4 class="mb-2 text-sm font-semibold" style="color: var(--text)">Features:</h4>
							<div class="flex flex-wrap gap-1">
								{#each metadata.features.slice(0, 3) as feature}
									<span
										class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
										style="background: rgba(168,85,247,0.12); color: #a855f7;"
									>
										{feature}
									</span>
								{/each}
								{#if metadata.features.length > 3}
									<span class="text-xs" style="color: var(--text-muted)"
										>+{metadata.features.length - 3} more</span
									>
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
	<TierCreateModal
		open={showCreateModal}
		{platforms}
		bind:tierForm
		{loading}
		onClose={() => (showCreateModal = false)}
		onCreate={handleCreate}
	/>
{/if}

<!-- Edit Tier Modal -->
{#if showEditModal && selectedTier}
	<TierEditModal
		open={showEditModal}
		bind:tierForm
		{loading}
		onClose={() => (showEditModal = false)}
		onUpdate={handleUpdate}
	/>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
	<TierDeleteModal
		open={showDeleteModal}
		tier={tierToDelete}
		{loading}
		onClose={closeDeleteModal}
		onConfirm={confirmDelete}
	/>
{/if}
