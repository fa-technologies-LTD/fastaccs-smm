<script lang="ts">
	import {
		Type,
		Plus,
		Edit,
		Trash2,
		Save,
		X,
		Search,
		Filter,
		CheckCircle,
		XCircle
	} from '@lucide/svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let microcopy = $derived(data.microcopy || []);
	let searchQuery = $state('');
	let filterCategory = $state('all');
	let showCreateModal = $state(false);
	let editingItem: any = $state(null);

	let newItem = $state({
		key: '',
		value: '',
		description: '',
		category: 'general'
	});

	let categories = ['general', 'hero', 'checkout', 'dashboard', 'footer', 'navigation', 'auth'];

	function openCreateModal() {
		newItem = {
			key: '',
			value: '',
			description: '',
			category: 'general'
		};
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
		newItem = { key: '', value: '', description: '', category: 'general' };
	}

	function startEdit(item: any) {
		editingItem = { ...item };
	}

	function cancelEdit() {
		editingItem = null;
	}

	async function createMicrocopy() {
		try {
			const response = await fetch('/api/admin/microcopy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newItem)
			});

			if (response.ok) {
				addToast({
					type: 'success',
					title: 'Microcopy created successfully',
					duration: 3000
				});
				window.location.reload();
			} else {
				addToast({
					type: 'error',
					title: 'Failed to create microcopy',
					duration: 3000
				});
			}
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Error creating microcopy',
				duration: 3000
			});
		}
	}

	async function updateMicrocopy() {
		if (!editingItem) return;

		try {
			const response = await fetch(`/api/admin/microcopy/${editingItem.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					value: editingItem.value,
					description: editingItem.description,
					category: editingItem.category
				})
			});

			if (response.ok) {
				addToast({
					type: 'success',
					title: 'Microcopy updated successfully',
					duration: 3000
				});
				window.location.reload();
			} else {
				addToast({
					type: 'error',
					title: 'Failed to update microcopy',
					duration: 3000
				});
			}
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Error updating microcopy',
				duration: 3000
			});
		}
	}

	async function deleteMicrocopy(id: string) {
		if (!confirm('Are you sure you want to delete this microcopy?')) return;

		try {
			const response = await fetch(`/api/admin/microcopy/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				addToast({
					type: 'success',
					title: 'Microcopy deleted successfully',
					duration: 3000
				});
				window.location.reload();
			} else {
				addToast({
					type: 'error',
					title: 'Failed to delete microcopy',
					duration: 3000
				});
			}
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Error deleting microcopy',
				duration: 3000
			});
		}
	}

	async function toggleStatus(id: string, currentStatus: boolean) {
		try {
			const response = await fetch(`/api/admin/microcopy/${id}/toggle`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isActive: !currentStatus })
			});

			if (response.ok) {
				addToast({
					type: 'success',
					title: 'Status toggled successfully',
					duration: 3000
				});
				window.location.reload();
			} else {
				addToast({
					type: 'error',
					title: 'Failed to toggle status',
					duration: 3000
				});
			}
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Error toggling status',
				duration: 3000
			});
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold" style="color: var(--text);">Microcopy Editor</h1>
			<p class="mt-1" style="color: var(--text-muted);">
				Manage UI text content across the application
			</p>
		</div>
		<button
			onclick={openCreateModal}
			class="flex items-center gap-2 rounded-full px-4 py-2 text-white transition-all active:scale-95"
			style="background: var(--link);"
		>
			<Plus class="h-4 w-4" />
			Add Microcopy
		</button>
	</div>

	<!-- Filters -->
	<div
		class="rounded-lg p-4"
		style="border: 1px solid var(--border); background: var(--bg-elev-1);"
	>
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex-1">
				<div class="relative">
					<Search
						class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2"
						style="color: var(--text-dim);"
					/>
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search by key, value, or description..."
						class="w-full rounded-lg py-2 pr-4 pl-10 focus:ring-1 focus:outline-none"
						style="border: 1px solid var(--border); color: var(--text); background: var(--bg);"
					/>
				</div>
			</div>
			<div class="flex gap-2">
				<select
					bind:value={filterCategory}
					class="rounded-lg px-4 py-2 focus:ring-1 focus:outline-none"
					style="border: 1px solid var(--border); color: var(--text); background: var(--bg);"
				>
					<option value="all">All Categories</option>
					{#each categories as cat}
						<option value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<!-- Microcopy Table -->
	<div class="rounded-lg" style="border: 1px solid var(--border); background: var(--bg-elev-1);">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead style="background: var(--bg-elev-2);">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Key
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Value
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Category
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Description
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="border-color: var(--border); background: var(--bg-elev-1);">
					{#if microcopy.length === 0}
						<tr>
							<td colspan="6" class="px-6 py-12 text-center" style="color: var(--text-muted);">
								No microcopy found. Click "Add Microcopy" to create your first entry.
							</td>
						</tr>
					{:else}
						{#each microcopy as item}
							<tr
								class="transition-colors"
								style="--hover-bg: var(--bg-elev-2);"
								onmouseenter={(e) => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
								onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}
							>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="font-mono text-sm font-medium" style="color: var(--link);">
										{item.key}
									</div>
								</td>
								<td class="px-6 py-4">
									{#if editingItem && editingItem.id === item.id}
										<textarea
											bind:value={editingItem.value}
											class="w-full rounded p-2 text-sm focus:outline-none"
											style="border: 1px solid var(--border); color: var(--text); background: var(--bg);"
											rows="2"
										></textarea>
									{:else}
										<div class="max-w-md text-sm" style="color: var(--text);">{item.value}</div>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if editingItem && editingItem.id === item.id}
										<select
											bind:value={editingItem.category}
											class="rounded px-2 py-1 text-sm"
											style="border: 1px solid var(--border); color: var(--text); background: var(--bg);"
										>
											{#each categories as cat}
												<option value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
											{/each}
										</select>
									{:else}
										<span
											class="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800"
										>
											{item.category}
										</span>
									{/if}
								</td>
								<td class="px-6 py-4">
									{#if editingItem && editingItem.id === item.id}
										<input
											type="text"
											bind:value={editingItem.description}
											class="w-full rounded p-2 text-sm focus:outline-none"
											style="border: 1px solid var(--border); color: var(--text); background: var(--bg);"
										/>
									{:else}
										<div class="max-w-xs text-sm" style="color: var(--text-muted);">
											{item.description || '-'}
										</div>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<button onclick={() => toggleStatus(item.id, item.isActive)}>
										{#if item.isActive}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
											>
												<CheckCircle class="h-3 w-3" />
												Active
											</span>
										{:else}
											<span
												class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold"
												style="background: var(--bg-elev-2); color: var(--text-muted); border: 1px solid var(--border);"
											>
												<XCircle class="h-3 w-3" />
												Inactive
											</span>
										{/if}
									</button>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if editingItem && editingItem.id === item.id}
										<div class="flex gap-2">
											<button
												onclick={updateMicrocopy}
												class="text-green-600 hover:text-green-900"
												title="Save"
											>
												<Save class="h-5 w-5" />
											</button>
											<button
												onclick={cancelEdit}
												class="text-gray-600 hover:text-gray-900"
												title="Cancel"
											>
												<X class="h-5 w-5" />
											</button>
										</div>
									{:else}
										<div class="flex gap-2">
											<button
												onclick={() => startEdit(item)}
												class="transition-opacity hover:opacity-80"
												style="color: var(--link);"
												title="Edit"
											>
												<Edit class="h-5 w-5" />
											</button>
											<button
												onclick={() => deleteMicrocopy(item.id)}
												class="transition-opacity hover:opacity-80"
												style="color: var(--status-error);"
												title="Delete"
											>
												<Trash2 class="h-5 w-5" />
											</button>
										</div>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Create Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-screen items-center justify-center px-4">
			<div class="fixed inset-0 bg-black/50" onclick={closeCreateModal}></div>
			<div class="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
				<h2 class="mb-4 text-xl font-semibold">Add New Microcopy</h2>
				<div class="space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-700">Key *</label>
						<input
							type="text"
							bind:value={newItem.key}
							placeholder="e.g., hero.title"
							class="mt-1 w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">Value *</label>
						<textarea
							bind:value={newItem.value}
							rows="3"
							placeholder="The text content"
							class="mt-1 w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
						></textarea>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">Category</label>
						<select
							bind:value={newItem.category}
							class="mt-1 w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
						>
							{#each categories as cat}
								<option value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">Description</label>
						<input
							type="text"
							bind:value={newItem.description}
							placeholder="Optional description"
							class="mt-1 w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
						/>
					</div>
				</div>
				<div class="mt-6 flex justify-end gap-3">
					<button
						onclick={closeCreateModal}
						class="rounded-full px-4 py-2"
						style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
					>
						Cancel
					</button>
					<button
						onclick={createMicrocopy}
						disabled={!newItem.key || !newItem.value}
						class="rounded-full px-4 py-2 text-white transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
						style="background: var(--link);"
					>
						Create
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
