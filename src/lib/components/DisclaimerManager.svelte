<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { Plus, Edit, Trash2, Save, X } from '@lucide/svelte';

	interface Disclaimer {
		id: string;
		title: string;
		content: string;
		disclaimer_type: 'general' | 'platform_specific' | 'category_specific';
		platform: string | null;
		category_id: string | null;
		is_active: boolean;
		show_at_checkout: boolean;
		show_on_product_page: boolean;
		sort_order: number;
	}

	interface Category {
		id: string;
		name: string;
		slug: string;
	}

	interface Props {
		disclaimers: Disclaimer[];
		categories: Category[];
		onUpdate: () => void;
	}

	let { disclaimers, categories, onUpdate }: Props = $props();

	let showAddForm = $state(false);
	let editingDisclaimer = $state<Disclaimer | null>(null);
	let loading = $state(false);

	const platforms = ['twitter', 'instagram', 'tiktok', 'facebook', 'youtube'];
	const disclaimerTypes = [
		{ value: 'general' as const, label: 'General' },
		{ value: 'platform_specific' as const, label: 'Platform Specific' },
		{ value: 'category_specific' as const, label: 'Category Specific' }
	] as const;

	let newDisclaimer = $state<{
		title: string;
		content: string;
		disclaimer_type: 'general' | 'platform_specific' | 'category_specific';
		platform: string | null;
		category_id: string | null;
		is_active: boolean;
		show_at_checkout: boolean;
		show_on_product_page: boolean;
		sort_order: number;
	}>({
		title: '',
		content: '',
		disclaimer_type: 'general',
		platform: null,
		category_id: null,
		is_active: true,
		show_at_checkout: true,
		show_on_product_page: false,
		sort_order: 0
	});

	function resetNewDisclaimer() {
		newDisclaimer = {
			title: '',
			content: '',
			disclaimer_type: 'general',
			platform: null,
			category_id: null,
			is_active: true,
			show_at_checkout: true,
			show_on_product_page: false,
			sort_order: disclaimers.length
		};
	}

	function handleTypeChange() {
		if (newDisclaimer.disclaimer_type !== 'platform_specific') {
			newDisclaimer.platform = null;
		}
		if (newDisclaimer.disclaimer_type !== 'category_specific') {
			newDisclaimer.category_id = null;
		}
	}

	function handleEditTypeChange() {
		if (!editingDisclaimer) return;

		if (editingDisclaimer.disclaimer_type !== 'platform_specific') {
			editingDisclaimer.platform = null;
		}
		if (editingDisclaimer.disclaimer_type !== 'category_specific') {
			editingDisclaimer.category_id = null;
		}
	}

	async function saveDisclaimer() {
		if (loading) return;

		try {
			loading = true;

			if (editingDisclaimer) {
				// Update existing disclaimer
				const { error } = await supabase
					.from('disclaimers')
					.update({
						title: editingDisclaimer.title,
						content: editingDisclaimer.content,
						disclaimer_type: editingDisclaimer.disclaimer_type,
						platform: editingDisclaimer.platform,
						category_id: editingDisclaimer.category_id,
						is_active: editingDisclaimer.is_active,
						show_at_checkout: editingDisclaimer.show_at_checkout,
						show_on_product_page: editingDisclaimer.show_on_product_page,
						sort_order: editingDisclaimer.sort_order,
						updated_at: new Date().toISOString()
					})
					.eq('id', editingDisclaimer.id);

				if (error) throw error;
				editingDisclaimer = null;
			} else {
				// Create new disclaimer
				const { error } = await supabase.from('disclaimers').insert([newDisclaimer]);

				if (error) throw error;
				resetNewDisclaimer();
				showAddForm = false;
			}

			onUpdate();
		} catch (error) {
			console.error('Error saving disclaimer:', error);
			alert('Failed to save disclaimer');
		} finally {
			loading = false;
		}
	}

	async function deleteDisclaimer(id: string, title: string) {
		if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
			return;
		}

		try {
			const { error } = await supabase.from('disclaimers').delete().eq('id', id);

			if (error) throw error;
			onUpdate();
		} catch (error) {
			console.error('Error deleting disclaimer:', error);
			alert('Failed to delete disclaimer');
		}
	}

	function startEdit(disclaimer: Disclaimer) {
		editingDisclaimer = { ...disclaimer };
	}

	function cancelEdit() {
		editingDisclaimer = null;
	}

	function getCategoryName(categoryId: string | null) {
		if (!categoryId) return null;
		return categories.find((c) => c.id === categoryId)?.name || 'Unknown Category';
	}
</script>

<div class="rounded-lg border bg-white p-6 shadow-sm">
	<div class="mb-6 flex items-center justify-between">
		<h3 class="text-lg font-semibold text-gray-900">Disclaimers</h3>
		<button
			onclick={() => {
				showAddForm = true;
				resetNewDisclaimer();
			}}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
		>
			<Plus size={18} />
			Add Disclaimer
		</button>
	</div>

	<!-- Add Disclaimer Form -->
	{#if showAddForm}
		<div class="mb-6 rounded-lg border bg-gray-50 p-4">
			<h4 class="mb-4 font-medium">Add New Disclaimer</h4>
			<div class="space-y-4">
				<div>
					<label for="new-disclaimer-title" class="mb-1 block text-sm font-medium text-gray-700"
						>Title</label
					>
					<input
						id="new-disclaimer-title"
						bind:value={newDisclaimer.title}
						type="text"
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						placeholder="Disclaimer title"
					/>
				</div>

				<div>
					<label for="new-disclaimer-content" class="mb-1 block text-sm font-medium text-gray-700"
						>Content</label
					>
					<textarea
						id="new-disclaimer-content"
						bind:value={newDisclaimer.content}
						rows={4}
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						placeholder="Disclaimer content"
					></textarea>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div>
						<label for="new-disclaimer-type" class="mb-1 block text-sm font-medium text-gray-700"
							>Type</label
						>
						<select
							id="new-disclaimer-type"
							bind:value={newDisclaimer.disclaimer_type}
							onchange={handleTypeChange}
							class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						>
							{#each disclaimerTypes as type}
								<option value={type.value}>{type.label}</option>
							{/each}
						</select>
					</div>

					{#if newDisclaimer.disclaimer_type === 'platform_specific'}
						<div>
							<label
								for="new-disclaimer-platform"
								class="mb-1 block text-sm font-medium text-gray-700">Platform</label
							>
							<select
								id="new-disclaimer-platform"
								bind:value={newDisclaimer.platform}
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							>
								<option value={null}>Select Platform</option>
								{#each platforms as platform}
									<option value={platform}
										>{platform.charAt(0).toUpperCase() + platform.slice(1)}</option
									>
								{/each}
							</select>
						</div>
					{/if}

					{#if newDisclaimer.disclaimer_type === 'category_specific'}
						<div>
							<label
								for="new-disclaimer-category"
								class="mb-1 block text-sm font-medium text-gray-700">Category</label
							>
							<select
								id="new-disclaimer-category"
								bind:value={newDisclaimer.category_id}
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							>
								<option value={null}>Select Category</option>
								{#each categories as category}
									<option value={category.id}>{category.name}</option>
								{/each}
							</select>
						</div>
					{/if}

					<div>
						<label for="new-disclaimer-sort" class="mb-1 block text-sm font-medium text-gray-700"
							>Sort Order</label
						>
						<input
							id="new-disclaimer-sort"
							bind:value={newDisclaimer.sort_order}
							type="number"
							class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
				</div>

				<div class="flex flex-wrap gap-4">
					<label class="flex items-center gap-2">
						<input
							bind:checked={newDisclaimer.is_active}
							type="checkbox"
							class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<span class="text-sm text-gray-700">Active</span>
					</label>

					<label class="flex items-center gap-2">
						<input
							bind:checked={newDisclaimer.show_at_checkout}
							type="checkbox"
							class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<span class="text-sm text-gray-700">Show at Checkout</span>
					</label>

					<label class="flex items-center gap-2">
						<input
							bind:checked={newDisclaimer.show_on_product_page}
							type="checkbox"
							class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<span class="text-sm text-gray-700">Show on Product Page</span>
					</label>
				</div>
			</div>

			<div class="mt-4 flex gap-2">
				<button
					onclick={saveDisclaimer}
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

	<!-- Disclaimers List -->
	<div class="space-y-4">
		{#each disclaimers as disclaimer (disclaimer.id)}
			<div class="rounded-lg border p-4 {disclaimer.is_active ? 'bg-white' : 'bg-gray-50'}">
				{#if editingDisclaimer?.id === disclaimer.id}
					<!-- Edit Form (similar to add form, but pre-filled) -->
					<div class="space-y-4">
						<div>
							<label
								for="edit-disclaimer-title"
								class="mb-1 block text-sm font-medium text-gray-700">Title</label
							>
							<input
								id="edit-disclaimer-title"
								bind:value={editingDisclaimer.title}
								type="text"
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							/>
						</div>

						<div>
							<label
								for="edit-disclaimer-content"
								class="mb-1 block text-sm font-medium text-gray-700">Content</label
							>
							<textarea
								id="edit-disclaimer-content"
								bind:value={editingDisclaimer.content}
								rows={4}
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							></textarea>
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
							<div>
								<label
									for="edit-disclaimer-type"
									class="mb-1 block text-sm font-medium text-gray-700">Type</label
								>
								<select
									id="edit-disclaimer-type"
									bind:value={editingDisclaimer.disclaimer_type}
									onchange={handleEditTypeChange}
									class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
								>
									{#each disclaimerTypes as type}
										<option value={type.value}>{type.label}</option>
									{/each}
								</select>
							</div>

							{#if editingDisclaimer.disclaimer_type === 'platform_specific'}
								<div>
									<label
										for="edit-disclaimer-platform"
										class="mb-1 block text-sm font-medium text-gray-700">Platform</label
									>
									<select
										id="edit-disclaimer-platform"
										bind:value={editingDisclaimer.platform}
										class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
									>
										<option value={null}>Select Platform</option>
										{#each platforms as platform}
											<option value={platform}
												>{platform.charAt(0).toUpperCase() + platform.slice(1)}</option
											>
										{/each}
									</select>
								</div>
							{/if}

							{#if editingDisclaimer.disclaimer_type === 'category_specific'}
								<div>
									<label
										for="edit-disclaimer-category"
										class="mb-1 block text-sm font-medium text-gray-700">Category</label
									>
									<select
										id="edit-disclaimer-category"
										bind:value={editingDisclaimer.category_id}
										class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
									>
										<option value={null}>Select Category</option>
										{#each categories as category}
											<option value={category.id}>{category.name}</option>
										{/each}
									</select>
								</div>
							{/if}

							<div>
								<label
									for="edit-disclaimer-sort"
									class="mb-1 block text-sm font-medium text-gray-700">Sort Order</label
								>
								<input
									id="edit-disclaimer-sort"
									bind:value={editingDisclaimer.sort_order}
									type="number"
									class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
								/>
							</div>
						</div>

						<div class="flex flex-wrap gap-4">
							<label class="flex items-center gap-2">
								<input
									bind:checked={editingDisclaimer.is_active}
									type="checkbox"
									class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-sm text-gray-700">Active</span>
							</label>

							<label class="flex items-center gap-2">
								<input
									bind:checked={editingDisclaimer.show_at_checkout}
									type="checkbox"
									class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-sm text-gray-700">Show at Checkout</span>
							</label>

							<label class="flex items-center gap-2">
								<input
									bind:checked={editingDisclaimer.show_on_product_page}
									type="checkbox"
									class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-sm text-gray-700">Show on Product Page</span>
							</label>
						</div>
					</div>

					<div class="mt-4 flex gap-2">
						<button
							onclick={saveDisclaimer}
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
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<div class="mb-2 flex items-center gap-3">
								<h4 class="font-medium text-gray-900">{disclaimer.title}</h4>
								<span
									class="rounded px-2 py-1 text-xs {disclaimer.is_active
										? 'bg-green-100 text-green-800'
										: 'bg-red-100 text-red-800'}"
								>
									{disclaimer.is_active ? 'Active' : 'Inactive'}
								</span>
								<span class="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
									{disclaimerTypes.find((t) => t.value === disclaimer.disclaimer_type)?.label}
								</span>
								{#if disclaimer.platform}
									<span class="rounded bg-purple-100 px-2 py-1 text-xs text-purple-800">
										{disclaimer.platform.charAt(0).toUpperCase() + disclaimer.platform.slice(1)}
									</span>
								{/if}
								{#if disclaimer.category_id}
									<span class="rounded bg-orange-100 px-2 py-1 text-xs text-orange-800">
										{getCategoryName(disclaimer.category_id)}
									</span>
								{/if}
							</div>
							<p class="mb-3 line-clamp-3 text-sm text-gray-600">{disclaimer.content}</p>
							<div class="flex items-center gap-4 text-xs text-gray-500">
								<span>Order: {disclaimer.sort_order}</span>
								{#if disclaimer.show_at_checkout}
									<span class="text-green-600">✓ Checkout</span>
								{/if}
								{#if disclaimer.show_on_product_page}
									<span class="text-green-600">✓ Product Page</span>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-2">
							<button
								onclick={() => startEdit(disclaimer)}
								class="p-2 text-gray-600 hover:text-blue-600"
								title="Edit"
							>
								<Edit size={16} />
							</button>
							<button
								onclick={() => deleteDisclaimer(disclaimer.id, disclaimer.title)}
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

	{#if disclaimers.length === 0}
		<div class="py-8 text-center text-gray-500">
			<p>No disclaimers found. Add your first disclaimer to get started.</p>
		</div>
	{/if}
</div>
