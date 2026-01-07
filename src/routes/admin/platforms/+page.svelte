<script lang="ts">
	import { goto } from '$app/navigation';
	import { Plus, Settings, Trash2, Edit, Eye, AlertCircle } from '@lucide/svelte';
	import { createCategory, updateCategory, deleteCategory } from '$lib/services/categories';
	import { showSuccess, showError } from '$lib/stores/toasts';
	import type { Category, CategoryInsert, CategoryUpdate } from '$lib/services/categories';
	import type { PageData } from './$types';
	import { fade, fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import PlatformCreateModal from '$lib/components/modals/PlatformCreateModal.svelte';
	import PlatformEditModal from '$lib/components/modals/PlatformEditModal.svelte';
	import PlatformDeleteModal from '$lib/components/modals/PlatformDeleteModal.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let platforms = $state<Category[]>(data.platforms);
	let loading = $state(false);
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);
	let selectedPlatform = $state<Category | null>(null);
	let platformToDelete = $state<Category | null>(null);

	// Form state for creating/editing platforms
	let platformForm = $state({
		name: '',
		slug: '',
		description: '',
		metadata: {
			icon: '',
			color: '#3B82F6',
			logo_url: '',
			website_url: '',
			api_info: {
				base_url: '',
				rate_limits: {} as Record<string, number>,
				auth_methods: [] as string[]
			},
			platform_info: {
				content_types: [] as string[],
				demographics: [] as string[]
			}
		}
	});

	// Show error if data loading failed
	if (data.error) {
		showError('Failed to load platforms', data.error);
	}

	function openCreateModal() {
		resetForm();
		showCreateModal = true;
	}

	function openEditModal(platform: Category) {
		selectedPlatform = platform;
		const metadata = platform.metadata as any;
		platformForm = {
			name: platform.name,
			slug: platform.slug,
			description: platform.description || '',
			metadata: {
				icon: metadata?.icon || '',
				color: metadata?.color || '#3B82F6',
				logo_url: metadata?.logo_url || '',
				website_url: metadata?.website_url || '',
				api_info: {
					base_url: metadata?.api_info?.base_url || '',
					rate_limits: metadata?.api_info?.rate_limits || {},
					auth_methods: metadata?.api_info?.auth_methods || []
				},
				platform_info: {
					content_types: metadata?.platform_info?.content_types || [],
					demographics: metadata?.platform_info?.demographics || []
				}
			}
		};
		showEditModal = true;
	}

	function resetForm() {
		platformForm = {
			name: '',
			slug: '',
			description: '',
			metadata: {
				icon: '',
				color: '#3B82F6',
				logo_url: '',
				website_url: '',
				api_info: {
					base_url: '',
					rate_limits: {} as Record<string, number>,
					auth_methods: [] as string[]
				},
				platform_info: {
					content_types: [] as string[],
					demographics: [] as string[]
				}
			}
		};
	}

	async function handleCreate() {
		loading = true;
		try {
			const newPlatform: CategoryInsert = {
				name: platformForm.name,
				slug: platformForm.slug,
				description: platformForm.description || null,
				categoryType: 'platform' as const,
				metadata: platformForm.metadata,
				isActive: true,
				sortOrder: platforms.length + 1
			};

			const result = await createCategory(newPlatform);
			if (result.error) {
				console.error('Failed to create platform:', result.error);
				showError('Failed to create platform', result.error);
			} else {
				// Add the new platform to the existing array
				if (result.data) {
					platforms = [...platforms, result.data];
				}
				showCreateModal = false;
				resetForm();
				showSuccess('Platform created successfully', `${platformForm.name} has been created.`);
			}
		} catch (error) {
			console.error('Failed to create platform:', error);
			showError('Failed to create platform', 'An unexpected error occurred.');
		} finally {
			loading = false;
		}
	}

	async function handleUpdate() {
		if (!selectedPlatform) return;

		loading = true;
		try {
			const updates: CategoryUpdate = {
				name: platformForm.name,
				slug: platformForm.slug,
				description: platformForm.description || null,
				metadata: platformForm.metadata
			};

			const result = await updateCategory(selectedPlatform!.id, updates);
			if (result.error) {
				console.error('Failed to update platform:', result.error);
				showError('Failed to update platform', result.error);
			} else {
				// Update the platform in the existing array instead of reloading
				if (result.data) {
					const index = platforms.findIndex((p) => p.id === selectedPlatform!.id);
					if (index !== -1) {
						platforms[index] = result.data;
						platforms = [...platforms]; // Trigger reactivity
					}
				}
				showEditModal = false;
				selectedPlatform = null;
				showSuccess('Platform updated successfully', `${platformForm.name} has been updated.`);
			}
		} catch (error) {
			console.error('Failed to update platform:', error);
			showError('Failed to update platform', 'An unexpected error occurred.');
		} finally {
			loading = false;
		}
	}

	function openDeleteModal(platform: Category) {
		platformToDelete = platform;
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		platformToDelete = null;
	}

	async function confirmDelete() {
		if (!platformToDelete) return;

		loading = true;
		try {
			const result = await deleteCategory(platformToDelete.id);
			if (result.error) {
				console.error('Failed to delete platform:', result.error);
				showError('Cannot delete platform', result.error);
			} else {
				// Remove the platform from the existing array
				platforms = platforms.filter((p) => p.id !== platformToDelete!.id);
				showSuccess('Platform deleted successfully', `${platformToDelete.name} has been deleted.`);
				closeDeleteModal();
			}
		} catch (error) {
			console.error('Failed to delete platform:', error);
			showError('Failed to delete platform', 'An unexpected error occurred.');
		} finally {
			loading = false;
		}
	}

	function generateSlug(name: string) {
		platformForm.slug = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}

	function viewTiers(platform: Category) {
		// Redirect to global tiers page since tiers are no longer platform-specific
		// You can filter by platform if needed in the UI
		goto('/admin/tiers');
	}
</script>

<svelte:head>
	<title>Platform Management - Admin Panel</title>
</svelte:head>

<div class="p-4 sm:p-6">
	<!-- Header -->
	<div class="mb-6">
		<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0 flex-1">
				<h1 class="text-xl font-bold text-gray-900 sm:text-2xl">Platform Management</h1>
				<p class="mt-1 text-sm text-gray-600 sm:text-base">
					Manage social media platforms and their configurations
				</p>
			</div>
			<button
				onclick={openCreateModal}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm text-white transition-all hover:scale-95 hover:bg-blue-700 active:scale-90 sm:w-auto sm:py-2"
			>
				<Plus size={18} />
				Add Platform
			</button>
		</div>
	</div>

	<!-- Platforms Grid -->
	{#if loading}
		<div class="flex h-64 items-center justify-center">
			<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
		</div>
	{:else if platforms.length === 0}
		<div class="px-4 py-12 text-center">
			<AlertCircle class="mx-auto mb-4 h-12 w-12 text-gray-400" />
			<h3 class="mb-2 text-lg font-medium text-gray-900">No platforms found</h3>
			<p class="mx-auto mb-6 max-w-md text-gray-500">
				Get started by adding your first social media platform.
			</p>
			<button
				onclick={openCreateModal}
				class="inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 font-medium text-white transition-all hover:bg-blue-700 active:scale-95"
			>
				<Plus class="mr-2 h-4 w-4" />
				Add Platform
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
			{#each platforms as platform (platform.id)}
				<div
					animate:flip={{ duration: 300 }}
					class="rounded-lg border border-gray-200 bg-white p-4 sm:p-6"
				>
					<!-- Platform Header -->
					<div class="mb-4 flex items-start justify-between gap-3">
						<div class="flex min-w-0 flex-1 items-center gap-3">
							{#if (platform.metadata as any)?.icon && ((platform.metadata as any).icon.startsWith('http') || (platform.metadata as any).icon.startsWith('/static') || (platform.metadata as any).icon.startsWith('data:'))}
								<img
									src={(platform.metadata as any).icon}
									alt={platform.name}
									class="h-8 w-8 flex-shrink-0 rounded"
								/>
							{:else}
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded font-semibold text-white"
									style="background-color: {(platform.metadata as any)?.color || '#3B82F6'}"
								>
									{platform.name.charAt(0)}
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<h3 class="truncate font-semibold text-gray-900">{platform.name}</h3>
								<p class="truncate text-sm text-gray-500">{platform.slug}</p>
							</div>
						</div>
						<div class="flex flex-shrink-0 items-center gap-1">
							<button
								onclick={() => viewTiers(platform)}
								class="group rounded p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
								title="View Tiers"
								aria-label="View Tiers"
							>
								<Eye size={16} class="transition-transform group-hover:scale-90" />
							</button>
							<button
								onclick={() => openEditModal(platform)}
								type="button"
								class="group rounded p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
								title="Edit Platform"
								aria-label="Edit Platform"
							>
								<Edit size={16} class="transition-transform group-hover:scale-90" />
							</button>
							<button
								onclick={() => openDeleteModal(platform)}
								type="button"
								class="group rounded p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
								title="Delete Platform"
								aria-label="Delete Platform"
							>
								<Trash2 size={16} class="transition-transform group-hover:scale-90" />
							</button>
						</div>
					</div>

					<!-- Platform Info -->
					{#if platform.description}
						<p class="mb-4 text-sm text-gray-600">{platform.description}</p>
					{/if}

					<!-- Platform Stats -->
					<div class="space-y-2 text-sm">
						<div class="flex items-center justify-between gap-2">
							<span class="flex-shrink-0 text-gray-500">Status:</span>
							<span
								class="font-medium {platform.isActive
									? 'text-green-600'
									: 'text-red-600'} text-right"
							>
								{platform.isActive ? 'Active' : 'Inactive'}
							</span>
						</div>
						{#if (platform.metadata as any)?.website_url}
							<div class="flex items-center justify-between gap-2">
								<span class="flex-shrink-0 text-gray-500">Website:</span>
								<a
									href={(platform.metadata as any).website_url}
									target="_blank"
									class="truncate text-right text-blue-600 hover:underline"
								>
									Visit
								</a>
							</div>
						{/if}
					</div>

					<!-- Platform Info Note -->
					<div class="mt-4 border-t border-gray-200 pt-4">
						<p class="text-center text-xs text-gray-500">
							Tiers are managed in the <a href="/admin/tiers" class="text-blue-600 hover:underline"
								>Tiers</a
							> section
						</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Create Platform Modal -->
{#if showCreateModal}
	<PlatformCreateModal
		open={showCreateModal}
		{platformForm}
		{loading}
		onClose={() => (showCreateModal = false)}
		onCreate={handleCreate}
		onNameInput={(value) => {
			platformForm.name = value;
			generateSlug(value);
		}}
		onSlugInput={(value) => (platformForm.slug = value)}
		onDescriptionInput={(value) => (platformForm.description = value)}
		onIconInput={(value) => (platformForm.metadata.icon = value)}
		onColorInput={(value) => (platformForm.metadata.color = value)}
		onWebsiteInput={(value) => (platformForm.metadata.website_url = value)}
	/>
{/if}

<!-- Edit Platform Modal -->
{#if showEditModal && selectedPlatform}
	<PlatformEditModal
		open={showEditModal}
		{platformForm}
		{loading}
		onClose={() => (showEditModal = false)}
		onUpdate={handleUpdate}
		onNameInput={(value) => (platformForm.name = value)}
		onSlugInput={(value) => (platformForm.slug = value)}
		onDescriptionInput={(value) => (platformForm.description = value)}
		onColorInput={(value) => (platformForm.metadata.color = value)}
		onWebsiteInput={(value) => (platformForm.metadata.website_url = value)}
	/>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
	<PlatformDeleteModal
		open={showDeleteModal}
		platform={platformToDelete}
		{loading}
		onClose={closeDeleteModal}
		onConfirm={confirmDelete}
	/>
{/if}
