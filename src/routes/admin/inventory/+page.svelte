<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Plus,
		Search,
		Package,
		Eye,
		Edit,
		Trash2,
		AlertTriangle,
		Settings,
		FileText
	} from '@lucide/svelte';
	import { supabase } from '$lib/supabase';
	import CategoryManager from '$lib/components/CategoryManager.svelte';
	import DisclaimerManager from '$lib/components/DisclaimerManager.svelte';
	import type { PageData } from './types';

	type Props = {
		data: PageData;
	};

	let { data }: Props = $props();

	let products = $state(data.products || []);
	let categories = $state(data.categories || []);
	let disclaimers = $state(data.disclaimers || []);
	let filteredProducts = $state<typeof products>([]);
	let loading = $state(false);
	let error = $state('');
	let searchTerm = $state('');
	let selectedPlatform = $state('');
	let selectedStatus = $state('');
	let currentPage = $state(1);
	let activeTab = $state('products'); // 'products', 'categories', 'disclaimers'
	const itemsPerPage = 10;

	const platforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'];
	const statuses = ['active', 'inactive', 'sold', 'pending_review'];

	onMount(() => {
		if (products.length === 0) {
			loadProducts();
		} else {
			filterProducts();
		}
	});

	async function loadProducts() {
		try {
			loading = true;
			error = '';

			let query = supabase.from('products').select('*').order('created_at', { ascending: false });

			if (selectedPlatform) {
				query = query.eq('platform', selectedPlatform);
			}

			if (selectedStatus) {
				query = query.eq('status', selectedStatus);
			}

			const { data: fetchedData, error: fetchError } = await query;

			if (fetchError) {
				error = fetchError.message;
				products = [];
			} else {
				products = fetchedData || [];
			}
		} catch (err) {
			console.error('Error loading products:', err);
			error = 'Failed to load products. Please try again.';
			products = [];
		} finally {
			loading = false;
			filterProducts();
		}
	}

	async function loadAllData() {
		try {
			loading = true;
			const [productsResult, categoriesResult, disclaimersResult] = await Promise.all([
				supabase.from('products').select('*').order('created_at', { ascending: false }),
				supabase.from('categories').select('*').order('sort_order', { ascending: true }),
				supabase.from('disclaimers').select('*').order('sort_order', { ascending: true })
			]);

			products = productsResult.data || [];
			categories = categoriesResult.data || [];
			disclaimers = disclaimersResult.data || [];
			filterProducts();
		} catch (err) {
			console.error('Error loading data:', err);
			products = [];
			categories = [];
			disclaimers = [];
		} finally {
			loading = false;
		}
	}

	function filterProducts() {
		let filtered = products;

		if (searchTerm) {
			const search = searchTerm.toLowerCase();
			filtered = filtered.filter(
				(product) =>
					product.title.toLowerCase().includes(search) ||
					product.platform.toLowerCase().includes(search) ||
					(product.description && product.description.toLowerCase().includes(search))
			);
		}

		filteredProducts = filtered;
	}

	function handleSearch() {
		currentPage = 1;
		filterProducts();
	}

	function handleFilterChange() {
		currentPage = 1;
		loadProducts();
	}

	async function deleteProductById(id: string) {
		if (!confirm('Are you sure you want to delete this product?')) return;

		try {
			const { error: deleteError } = await supabase.from('products').delete().eq('id', id);

			if (deleteError) {
				alert('Error deleting product: ' + deleteError.message);
			} else {
				await loadProducts();
			}
		} catch (err) {
			console.error('Error deleting product:', err);
			alert('Failed to delete product');
		}
	}

	function formatPrice(price: number, currency: string = 'USD') {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency
		}).format(price);
	}

	function formatPlatform(platform: string) {
		return platform.charAt(0).toUpperCase() + platform.slice(1);
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'active':
				return 'bg-green-100 text-green-800';
			case 'inactive':
				return 'bg-gray-100 text-gray-800';
			case 'sold':
				return 'bg-red-100 text-red-800';
			case 'pending_review':
				return 'bg-yellow-100 text-yellow-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	$effect(() => {
		filterProducts();
	});

	// Pagination
	let totalPages = $derived(Math.ceil(filteredProducts.length / itemsPerPage));
	let paginatedProducts = $derived(
		filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
		}
	}

	async function deleteProduct(productId: string) {
		if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
			return;
		}

		try {
			loading = true;
			const { error } = await supabase.from('products').delete().eq('id', productId);

			if (error) {
				console.error('Error deleting product:', error);
				alert('Failed to delete product');
				return;
			}

			// Remove from local state
			products = products.filter((p) => p.id !== productId);
			filterProducts();
			alert('Product deleted successfully');
		} catch (err) {
			console.error('Error deleting product:', err);
			alert('Failed to delete product');
		} finally {
			loading = false;
		}
	}

	function editProduct(productId: string) {
		// Navigate to edit page - you can create this route later
		window.location.href = `/admin/inventory/edit/${productId}`;
	}

	function viewProduct(productId: string) {
		// Navigate to view/detail page
		window.location.href = `/product/${productId}`;
	}

	async function toggleProductStatus(product: any) {
		const newStatus = product.status === 'active' ? 'inactive' : 'active';

		try {
			loading = true;
			const { error } = await supabase
				.from('products')
				.update({ status: newStatus })
				.eq('id', product.id);

			if (error) {
				console.error('Error updating product status:', error);
				alert('Failed to update product status');
				return;
			}

			// Update local state
			const productIndex = products.findIndex((p) => p.id === product.id);
			if (productIndex !== -1) {
				products[productIndex].status = newStatus;
				filterProducts();
			}
		} catch (err) {
			console.error('Error updating product status:', err);
			alert('Failed to update product status');
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Inventory Management - Admin Panel</title>
</svelte:head>

<div class="p-6">
	<div class="mb-6">
		<div class="mb-4 flex items-center justify-between">
			<h1 class="text-2xl font-bold text-gray-900">Inventory Management</h1>
			{#if activeTab === 'products'}
				<button
					class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
				>
					<Plus size={18} />
					Add Product
				</button>
			{/if}
		</div>

		<!-- Tabs -->
		<div class="mb-6 border-b border-gray-200">
			<nav class="-mb-px flex space-x-8">
				<button
					onclick={() => (activeTab = 'products')}
					class="border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap {activeTab ===
					'products'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					<div class="flex items-center gap-2">
						<Package size={16} />
						Products ({products.length})
					</div>
				</button>
				<button
					onclick={() => (activeTab = 'categories')}
					class="border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap {activeTab ===
					'categories'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					<div class="flex items-center gap-2">
						<Settings size={16} />
						Categories ({categories.length})
					</div>
				</button>
				<button
					onclick={() => (activeTab = 'disclaimers')}
					class="border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap {activeTab ===
					'disclaimers'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					<div class="flex items-center gap-2">
						<FileText size={16} />
						Disclaimers ({disclaimers.length})
					</div>
				</button>
			</nav>
		</div>
	</div>

	{#if activeTab === 'products'}
		<!-- Products Tab Content -->
		<div class="mb-4 flex items-center justify-between">
			<h1 class="text-2xl font-bold text-gray-900">Inventory Management</h1>
			<a
				href="/admin/inventory/new"
				class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
			>
				<Plus class="mr-2 h-4 w-4" />
				Add Product
			</a>
		</div>

		<!-- Filters -->
		<div class="mb-6 rounded-lg bg-white p-4 shadow">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
				<!-- Search -->
				<div>
					<label for="search-input" class="mb-1 block text-sm font-medium text-gray-700"
						>Search</label
					>
					<div class="relative">
						<Search class="absolute top-3 left-3 h-4 w-4 text-gray-400" />
						<input
							id="search-input"
							type="text"
							placeholder="Search products..."
							bind:value={searchTerm}
							onkeyup={handleSearch}
							class="w-full rounded-md border border-gray-300 py-2 pr-3 pl-10 focus:border-transparent focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				<!-- Platform Filter -->
				<div>
					<label for="platform-select" class="mb-1 block text-sm font-medium text-gray-700"
						>Platform</label
					>
					<select
						id="platform-select"
						bind:value={selectedPlatform}
						onchange={handleFilterChange}
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
					>
						<option value="">All Platforms</option>
						{#each platforms as platform}
							<option value={platform}>{formatPlatform(platform)}</option>
						{/each}
					</select>
				</div>

				<!-- Status Filter -->
				<div>
					<label for="status-select" class="mb-1 block text-sm font-medium text-gray-700"
						>Status</label
					>
					<select
						id="status-select"
						bind:value={selectedStatus}
						onchange={handleFilterChange}
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
					>
						<option value="">All Status</option>
						{#each statuses as status}
							<option value={status}>{formatPlatform(status.replace('_', ' '))}</option>
						{/each}
					</select>
				</div>

				<!-- Clear Filters -->
				<div class="flex items-end">
					<button
						onclick={() => {
							searchTerm = '';
							selectedPlatform = '';
							selectedStatus = '';
							handleFilterChange();
						}}
						class="w-full rounded-md bg-gray-100 px-3 py-2 text-gray-700 hover:bg-gray-200"
					>
						Clear Filters
					</button>
				</div>
			</div>
		</div>

		<!-- Error Message -->
		{#if error}
			<div class="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
				<div class="flex items-center">
					<AlertTriangle class="mr-2 h-5 w-5" />
					{error}
				</div>
			</div>
		{/if}

		<!-- Products Table -->
		{#if loading}
			<div class="rounded-lg bg-white p-8 text-center shadow">
				<Package class="mx-auto mb-4 h-8 w-8 animate-pulse text-gray-400" />
				<p class="text-gray-500">Loading products...</p>
			</div>
		{:else if filteredProducts.length === 0}
			<div class="rounded-lg bg-white p-8 text-center shadow">
				<Package class="mx-auto mb-4 h-12 w-12 text-gray-400" />
				<h3 class="mb-2 text-lg font-medium text-gray-900">No products found</h3>
				<p class="mb-4 text-gray-500">
					{#if searchTerm || selectedPlatform || selectedStatus}
						No products match your current filters.
					{:else}
						Get started by adding your first product.
					{/if}
				</p>
				<a
					href="/admin/inventory/new"
					class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
				>
					<Plus class="mr-2 h-4 w-4" />
					Add Product
				</a>
			</div>
		{:else}
			<div class="overflow-hidden rounded-lg bg-white shadow">
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="bg-gray-50">
							<tr>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Product
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Platform
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Price
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Stock
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Status
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Actions
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each paginatedProducts as product}
								<tr class="hover:bg-gray-50">
									<td class="px-6 py-4">
										<div class="flex items-center">
											{#if product.thumbnail_url}
												<img
													src={product.thumbnail_url}
													alt={product.title}
													class="mr-3 h-10 w-10 rounded object-cover"
												/>
											{:else}
												<Package class="mr-3 h-10 w-10 text-gray-400" />
											{/if}
											<div>
												<div class="font-medium text-gray-900">{product.title}</div>
												<div class="text-sm text-gray-500">ID: {product.id}</div>
											</div>
										</div>
									</td>
									<td class="px-6 py-4">
										<span
											class="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 capitalize"
										>
											{product.platform}
										</span>
									</td>
									<td class="px-6 py-4 text-sm text-gray-900">
										${product.price}
									</td>
									<td class="px-6 py-4 text-sm text-gray-900">
										{product.stock_quantity || 0}
									</td>
									<td class="px-6 py-4">
										<span
											class="inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize {product.status ===
											'active'
												? 'bg-green-100 text-green-800'
												: product.status === 'inactive'
													? 'bg-gray-100 text-gray-800'
													: product.status === 'sold'
														? 'bg-red-100 text-red-800'
														: 'bg-yellow-100 text-yellow-800'}"
										>
											{product.status}
										</span>
									</td>
									<td class="px-6 py-4">
										<div class="flex items-center space-x-2">
											<button
												onclick={() => viewProduct(product.id)}
												class="rounded p-1 text-blue-600 hover:bg-blue-100 disabled:opacity-50"
												title="View Details"
												disabled={loading}
											>
												<Eye class="h-4 w-4" />
											</button>
											<button
												onclick={() => editProduct(product.id)}
												class="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
												title="Edit Product"
												disabled={loading}
											>
												<Edit class="h-4 w-4" />
											</button>
											<button
												onclick={() => deleteProduct(product.id)}
												class="rounded p-1 text-red-600 hover:bg-red-100 disabled:opacity-50"
												title="Delete Product"
												disabled={loading}
											>
												<Trash2 class="h-4 w-4" />
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="mt-6 flex justify-center">
					<div class="flex items-center space-x-2">
						<button
							disabled={currentPage === 1}
							onclick={() => goToPage(currentPage - 1)}
							class="rounded px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Previous
						</button>
						{#each Array.from({ length: totalPages }, (_, i) => i + 1) as page}
							<button
								onclick={() => goToPage(page)}
								class="rounded px-3 py-2 text-sm font-medium {currentPage === page
									? 'bg-blue-600 text-white'
									: 'text-gray-500 hover:bg-gray-100'}"
							>
								{page}
							</button>
						{/each}
						<button
							disabled={currentPage === totalPages}
							onclick={() => goToPage(currentPage + 1)}
							class="rounded px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		{/if}
	{:else if activeTab === 'categories'}
		<!-- Categories Tab Content -->
		<CategoryManager {categories} onUpdate={loadAllData} />
	{:else if activeTab === 'disclaimers'}
		<!-- Disclaimers Tab Content -->
		<DisclaimerManager {disclaimers} {categories} onUpdate={loadAllData} />
	{/if}
</div>
