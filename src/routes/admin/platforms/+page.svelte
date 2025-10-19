<script lang="ts">
	import { goto } from '$app/navigation';
	import { Plus, Settings, Trash2, Edit, Eye, AlertCircle } from '@lucide/svelte';
	import { createCategory, updateCategory, deleteCategory } from '$lib/services/categories';
	import { showSuccess, showError } from '$lib/stores/toasts';
	import type { Category, CategoryInsert, CategoryUpdate } from '$lib/services/categories';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let platforms = $state<Category[]>(data.platforms);
	let loading = $state(false);
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let selectedPlatform = $state<Category | null>(null);

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
				followers_range: [0, 0] as [number, number],
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
					followers_range: metadata?.platform_info?.followers_range || [0, 0],
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
					followers_range: [0, 0] as [number, number],
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
	async function handleDelete(platform: Category) {
		loading = true;
		try {
			const result = await deleteCategory(platform.id);
			if (result.error) {
				console.error('Failed to delete platform:', result.error);
				showError('Failed to delete platform', result.error);
			} else {
				// Remove the platform from the existing array instead of reloading
				platforms = platforms.filter((p) => p.id !== platform.id);
				showSuccess('Platform deleted successfully', `${platform.name} has been deleted.`);
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
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm text-white transition-all hover:scale-[.95] hover:bg-blue-700 sm:w-auto sm:py-2"
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
				class="inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
			>
				<Plus class="mr-2 h-4 w-4" />
				Add Platform
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
			{#each platforms as platform}
				<div class="rounded-lg border border-gray-200 bg-white p-4 shadow sm:p-6">
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
								class="rounded p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
								title="View Tiers"
								aria-label="View Tiers"
							>
								<Eye size={16} />
							</button>
							<button
								onclick={() => openEditModal(platform)}
								class="rounded p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
								title="Edit Platform"
								aria-label="Edit Platform"
							>
								<Edit size={16} />
							</button>
							<button
								onclick={() => handleDelete(platform)}
								class="rounded p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
								title="Delete Platform"
								aria-label="Delete Platform"
							>
								<Trash2 size={16} />
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
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				class="fixed inset-0 bg-black/20 transition-opacity"
				onclick={() => (showCreateModal = false)}
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
			>
				<form onsubmit={handleCreate}>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="text-lg font-semibold text-gray-900">Add New Platform</h3>
						</div>

						<div class="space-y-4">
							<!-- Name -->
							<div>
								<label for="name" class="block text-sm font-medium text-gray-700"
									>Platform Name *</label
								>
								<input
									id="name"
									type="text"
									required
									value={platformForm.name}
									oninput={(e) => {
										platformForm.name = (e.target as HTMLInputElement).value;
										generateSlug(platformForm.name);
									}}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="e.g., Instagram"
								/>
							</div>

							<!-- Slug -->
							<div>
								<label for="slug" class="block text-sm font-medium text-gray-700">Slug *</label>
								<input
									id="slug"
									type="text"
									required
									value={platformForm.slug}
									oninput={(e) => (platformForm.slug = (e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="e.g., instagram"
								/>
							</div>

							<!-- Description -->
							<div>
								<label for="description" class="block text-sm font-medium text-gray-700"
									>Description</label
								>
								<textarea
									id="description"
									rows="3"
									value={platformForm.description}
									oninput={(e) =>
										(platformForm.description = (e.target as HTMLTextAreaElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="Platform description..."
								></textarea>
							</div>

							<!-- Color -->
							<div>
								<label for="color" class="block text-sm font-medium text-gray-700"
									>Brand Color</label
								>
								<input
									id="color"
									type="color"
									value={platformForm.metadata.color}
									oninput={(e) =>
										(platformForm.metadata.color = (e.target as HTMLInputElement).value)}
									class="mt-1 block h-10 w-full rounded-md border border-gray-300 py-2 focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Website URL -->
							<div>
								<label for="website" class="block text-sm font-medium text-gray-700"
									>Website URL</label
								>
								<input
									id="website"
									type="url"
									value={platformForm.metadata.website_url}
									oninput={(e) =>
										(platformForm.metadata.website_url = (e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
									placeholder="https://example.com"
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
							{loading ? 'Creating...' : 'Create Platform'}
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

<!-- Edit Platform Modal -->
{#if showEditModal && selectedPlatform}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<!-- Background overlay -->
			<div
				class="bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity"
				onclick={() => (showEditModal = false)}
			></div>

			<!-- Modal content -->
			<div
				class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
			>
				<form onsubmit={handleUpdate}>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<div class="mb-4">
							<h3 class="text-lg font-semibold text-gray-900">Edit Platform</h3>
						</div>

						<div class="space-y-4">
							<!-- Name -->
							<div>
								<label for="edit-name" class="block text-sm font-medium text-gray-700"
									>Platform Name *</label
								>
								<input
									id="edit-name"
									type="text"
									required
									value={platformForm.name}
									oninput={(e) => (platformForm.name = (e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Slug -->
							<div>
								<label for="edit-slug" class="block text-sm font-medium text-gray-700">Slug *</label
								>
								<input
									id="edit-slug"
									type="text"
									required
									value={platformForm.slug}
									oninput={(e) => (platformForm.slug = (e.target as HTMLInputElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Description -->
							<div>
								<label for="edit-description" class="block text-sm font-medium text-gray-700"
									>Description</label
								>
								<textarea
									id="edit-description"
									name="description"
									rows="3"
									value={platformForm.description}
									oninput={(e) =>
										(platformForm.description = (e.target as HTMLTextAreaElement).value)}
									class="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								></textarea>
							</div>

							<!-- Color -->
							<div>
								<label for="edit-color" class="block text-sm font-medium text-gray-700"
									>Brand Color</label
								>
								<input
									id="edit-color"
									type="color"
									value={platformForm.metadata.color}
									oninput={(e) =>
										(platformForm.metadata.color = (e.target as HTMLInputElement).value)}
									class="mt-1 block h-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<!-- Website URL -->
							<div>
								<label for="edit-website" class="block text-sm font-medium text-gray-700"
									>Website URL</label
								>
								<input
									id="edit-website"
									type="url"
									value={platformForm.metadata.website_url}
									oninput={(e) =>
										(platformForm.metadata.website_url = (e.target as HTMLInputElement).value)}
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
							{loading ? 'Updating...' : 'Update Platform'}
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
