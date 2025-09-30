<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import { Plus, Edit, Trash2, Save, X } from '@lucide/svelte';

	interface Category {
		id: string;
		name: string;
		slug: string;
		description: string;
		icon: string;
		sort_order: number;
		is_active: boolean;
	}

	interface Props {
		categories: Category[];
		onUpdate: () => void;
	}

	let { categories, onUpdate }: Props = $props();

	let showAddForm = $state(false);
	let editingCategory = $state<Category | null>(null);
	let loading = $state(false);

	let newCategory = $state({
		name: '',
		slug: '',
		description: '',
		icon: '',
		sort_order: 0,
		is_active: true
	});

	function resetNewCategory() {
		newCategory = {
			name: '',
			slug: '',
			description: '',
			icon: '',
			sort_order: categories.length,
			is_active: true
		};
	}

	function generateSlug(name: string) {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	function handleNameChange() {
		if (!editingCategory) {
			newCategory.slug = generateSlug(newCategory.name);
		}
	}

	async function saveCategory() {
		if (loading) return;

		try {
			loading = true;

			if (editingCategory) {
				// Update existing category
				const { error } = await supabase
					.from('categories')
					.update({
						name: editingCategory.name,
						slug: editingCategory.slug,
						description: editingCategory.description,
						icon: editingCategory.icon,
						sort_order: editingCategory.sort_order,
						is_active: editingCategory.is_active
					})
					.eq('id', editingCategory.id);

				if (error) throw error;
				editingCategory = null;
			} else {
				// Create new category
				const { error } = await supabase.from('categories').insert([newCategory]);

				if (error) throw error;
				resetNewCategory();
				showAddForm = false;
			}

			onUpdate();
		} catch (error) {
			console.error('Error saving category:', error);
			showError(
				'Failed to save category',
				error instanceof Error ? error.message : 'An unexpected error occurred'
			);
		} finally {
			loading = false;
		}
	}

	async function deleteCategory(id: string, name: string) {
		if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
			return;
		}

		try {
			const { error } = await supabase.from('categories').delete().eq('id', id);

			if (error) throw error;
			onUpdate();
		} catch (error) {
			console.error('Error deleting category:', error);
			showError('Failed to delete category', 'It may have associated products.');
		}
	}

	function startEdit(category: Category) {
		editingCategory = { ...category };
	}

	function cancelEdit() {
		editingCategory = null;
	}
</script>

<div class="rounded-lg border bg-white p-6 shadow-sm">
	<div class="mb-6 flex items-center justify-between">
		<h3 class="text-lg font-semibold text-gray-900">Categories</h3>
		<button
			onclick={() => {
				showAddForm = true;
				resetNewCategory();
			}}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
		>
			<Plus size={18} />
			Add Category
		</button>
	</div>

	<!-- Add Category Form -->
	{#if showAddForm}
		<div class="mb-6 rounded-lg border bg-gray-50 p-4">
			<h4 class="mb-4 font-medium">Add New Category</h4>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div>
					<label class="mb-1 block text-sm font-medium text-gray-700">Name</label>
					<input
						bind:value={newCategory.name}
						oninput={handleNameChange}
						type="text"
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						placeholder="Category name"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium text-gray-700">Slug</label>
					<input
						bind:value={newCategory.slug}
						type="text"
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						placeholder="category-slug"
					/>
				</div>
				<div class="md:col-span-2">
					<label class="mb-1 block text-sm font-medium text-gray-700">Description</label>
					<textarea
						bind:value={newCategory.description}
						rows={3}
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						placeholder="Category description"
					></textarea>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium text-gray-700">Icon</label>
					<input
						bind:value={newCategory.icon}
						type="text"
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						placeholder="user-circle"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
					<input
						bind:value={newCategory.sort_order}
						type="number"
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
			</div>
			<div class="mt-4 flex items-center gap-4">
				<label class="flex items-center gap-2">
					<input
						bind:checked={newCategory.is_active}
						type="checkbox"
						class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<span class="text-sm text-gray-700">Active</span>
				</label>
			</div>
			<div class="mt-4 flex gap-2">
				<button
					onclick={saveCategory}
					disabled={loading}
					class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
				>
					<Save size={16} />
					{loading ? 'Saving...' : 'Save'}
				</button>
				<button
					onclick={() => (showAddForm = false)}
					class="flex items-center gap-2 rounded-lg bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
				>
					<X size={16} />
					Cancel
				</button>
			</div>
		</div>
	{/if}

	<!-- Categories List -->
	<div class="space-y-4">
		{#each categories as category (category.id)}
			<div class="rounded-lg border p-4 {category.is_active ? 'bg-white' : 'bg-gray-50'}">
				{#if editingCategory?.id === category.id}
					<!-- Edit Form -->
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Name</label>
							<input
								bind:value={editingCategory.name}
								type="text"
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							/>
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Slug</label>
							<input
								bind:value={editingCategory.slug}
								type="text"
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							/>
						</div>
						<div class="md:col-span-2">
							<label class="mb-1 block text-sm font-medium text-gray-700">Description</label>
							<textarea
								bind:value={editingCategory.description}
								rows={3}
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							></textarea>
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Icon</label>
							<input
								bind:value={editingCategory.icon}
								type="text"
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							/>
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
							<input
								bind:value={editingCategory.sort_order}
								type="number"
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							/>
						</div>
					</div>
					<div class="mt-4 flex items-center gap-4">
						<label class="flex items-center gap-2">
							<input
								bind:checked={editingCategory.is_active}
								type="checkbox"
								class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<span class="text-sm text-gray-700">Active</span>
						</label>
					</div>
					<div class="mt-4 flex gap-2">
						<button
							onclick={saveCategory}
							disabled={loading}
							class="flex items-center gap-2 rounded bg-green-600 px-3 py-1.5 text-white hover:bg-green-700 disabled:opacity-50"
						>
							<Save size={14} />
							{loading ? 'Saving...' : 'Save'}
						</button>
						<button
							onclick={cancelEdit}
							class="flex items-center gap-2 rounded bg-gray-500 px-3 py-1.5 text-white hover:bg-gray-600"
						>
							<X size={14} />
							Cancel
						</button>
					</div>
				{:else}
					<!-- Display Mode -->
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<div class="mb-2 flex items-center gap-3">
								<h4 class="font-medium text-gray-900">{category.name}</h4>
								<span
									class="rounded px-2 py-1 text-xs {category.is_active
										? 'bg-green-100 text-green-800'
										: 'bg-red-100 text-red-800'}"
								>
									{category.is_active ? 'Active' : 'Inactive'}
								</span>
							</div>
							<p class="mb-2 text-sm text-gray-600">{category.description}</p>
							<div class="flex items-center gap-4 text-xs text-gray-500">
								<span>Slug: {category.slug}</span>
								<span>Icon: {category.icon}</span>
								<span>Order: {category.sort_order}</span>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<button
								onclick={() => startEdit(category)}
								class="p-2 text-gray-600 hover:text-blue-600"
								title="Edit"
							>
								<Edit size={16} />
							</button>
							<button
								onclick={() => deleteCategory(category.id, category.name)}
								class="p-2 text-gray-600 hover:text-red-600"
								title="Delete"
							>
								<Trash2 size={16} />
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if categories.length === 0}
		<div class="py-8 text-center text-gray-500">
			<p>No categories found. Add your first category to get started.</p>
		</div>
	{/if}
</div>
