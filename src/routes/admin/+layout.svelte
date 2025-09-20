<script lang="ts">
	import { page } from '$app/state';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { Package, ShoppingCart, Users, BarChart3, Settings, Home, Plus } from '@lucide/svelte';

	export let data;

	const adminNavItems = [
		{ href: '/admin', label: 'Dashboard', icon: Home },
		{ href: '/admin/inventory', label: 'Inventory', icon: Package },
		{ href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
		{ href: '/admin/users', label: 'Users', icon: Users },
		{ href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
		{ href: '/admin/settings', label: 'Settings', icon: Settings }
	];
</script>

<svelte:head>
	<title>Admin Panel - FastAccs</title>
</svelte:head>

<Navigation />

<div class="min-h-screen bg-gray-50">
	<div class="flex flex-col lg:flex-row">
		<!-- Admin Sidebar -->
		<div class="bg-white shadow-lg lg:w-64">
			<div class="border-b border-gray-200 p-4 lg:p-6">
				<h2 class="text-lg font-semibold text-gray-900 lg:text-xl">Admin Panel</h2>
				<p class="text-sm text-gray-500">Welcome, {data.user?.email}</p>
			</div>

			<nav class="mt-4 lg:mt-6">
				{#each adminNavItems as item}
					<a
						href={item.href}
						class="flex items-center px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700 lg:px-6 lg:py-3 lg:text-base {page
							.url.pathname === item.href
							? 'border-primary-dark text-primary-dark border-r-2 bg-blue-50 lg:border-blue-700 lg:bg-blue-100 lg:text-blue-700'
							: ''}"
					>
						<svelte:component this={item.icon} class="mr-2 h-4 w-4 lg:mr-3 lg:h-5 lg:w-5" />
						{item.label}
					</a>
				{/each}
			</nav>

			<!-- Quick Actions -->
			<div class="mt-4 px-4 pb-4 lg:mt-8 lg:px-6">
				<h3
					class="mb-2 text-xs font-medium tracking-wider text-gray-500 uppercase lg:mb-3 lg:text-sm"
				>
					Quick Actions
				</h3>
				<a
					href="/admin/inventory/new"
					class="bg-primary hover:bg-primary-dark active:bg-primary-dark flex w-full items-center rounded-lg px-3 py-2 text-sm text-white transition-colors"
				>
					<Plus class="mr-2 h-4 w-4" />
					Add Product
				</a>
			</div>
		</div>

		<!-- Main Content -->
		<div class="flex-1 p-4 lg:p-8">
			<slot />
		</div>
	</div>
</div>

<Footer />
