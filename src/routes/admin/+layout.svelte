<script lang="ts">
	import { page } from '$app/state';
	import {
		Package,
		ShoppingCart,
		Users,
		BarChart3,
		Settings,
		Home,
		Plus,
		Layers,
		Target,
		Menu,
		X
	} from '@lucide/svelte';

	let { data, children } = $props();

	const adminNavItems = [
		{ href: '/admin', label: 'Dashboard', icon: Home },
		{ href: '/admin/platforms', label: 'Platforms', icon: Layers },
		{ href: '/admin/tiers', label: 'Tiers', icon: Target },
		{ href: '/admin/inventory', label: 'Inventory', icon: Package },
		{ href: '/admin/batches', label: 'Batch Import', icon: Plus },
		{ href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
		{ href: '/admin/users', label: 'Users', icon: Users },
		{ href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
		{ href: '/admin/settings', label: 'Settings', icon: Settings }
	];

	let sidebarOpen = $state(false);
</script>

<svelte:head>
	<title>Admin Panel - FastAccs</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Desktop Sidebar -->
	<div class="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
		<div class="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white">
			<div class="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
				<img src="/src/lib/assets/logo.png" alt="FastAccs" class="mx-12" />
				<nav class="mt-5 flex-1 space-y-1 bg-white px-2">
					{#each adminNavItems as item}
						{@const IconComponent = item.icon}
						<a
							href={item.href}
							class="group flex items-center rounded-md px-2 py-2 text-sm font-medium {page.url
								.pathname === item.href
								? 'bg-gray-100 text-gray-900'
								: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
						>
							<IconComponent class="mr-3 h-5 w-5 flex-shrink-0" />
							{item.label}
						</a>
					{/each}
				</nav>
			</div>
		</div>
	</div>

	<!-- Mobile menu -->
	{#if sidebarOpen}
		<div class="relative z-40 lg:hidden">
			<div class="fixed inset-0 flex">
				<button
					class="fixed inset-0 cursor-default bg-gray-600/75"
					onclick={() => (sidebarOpen = false)}
					aria-label="Close sidebar"
				></button>
				<div class="relative flex w-full max-w-xs flex-1 flex-col bg-white">
					<div class="h-0 flex-1 overflow-y-auto pt-5 pb-4">
						<!-- Logo and Close Button -->
						<div class="mb-6 flex items-center justify-between px-4">
							<img src="/src/lib/assets/logo.png" alt="FastAccs" class="size-3/5" />
							<button
								type="button"
								class="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-900 focus:ring-2 focus:ring-gray-300 focus:outline-none"
								onclick={() => (sidebarOpen = false)}
							>
								<X class="h-6 w-6" color="black" />
							</button>
						</div>

						<nav class="space-y-1 px-2">
							{#each adminNavItems as item}
								{@const IconComponent = item.icon}
								<a
									href={item.href}
									class="group flex items-center rounded-md px-2 py-2 text-sm font-medium {page.url
										.pathname === item.href
										? 'bg-gray-100 text-gray-900'
										: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
									onclick={() => (sidebarOpen = false)}
								>
									<IconComponent class="mr-4 h-6 w-6" />
									{item.label}
								</a>
							{/each}
						</nav>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Main content -->
	<div class="lg:pl-64">
		<!-- Admin Navbar -->
		<div class="sticky top-0 z-10 border-b border-gray-200 bg-white">
			<div class="flex items-center justify-between px-4 py-3">
				<!-- Mobile menu button -->
				<button
					type="button"
					class="-mt-0.5 -ml-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:ring-inset lg:hidden"
					onclick={() => (sidebarOpen = true)}
				>
					<Menu class="h-5 w-5" />
				</button>

				<!-- Admin info and actions -->
				<div class="ml-auto flex items-center space-x-4">
					<!-- Admin status -->
					<div class="flex items-center space-x-2">
						<div class="h-2 w-2 rounded-full bg-green-500"></div>
						<span class="text-sm text-gray-600">{data?.user?.email || 'admin@fastaccs.com'}</span>
					</div>

					<!-- Sign out button -->
					<a
						href="/auth/logout"
						class="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-4 font-medium text-gray-700 hover:scale-[.98] hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
					>
						Sign Out
					</a>
				</div>
			</div>
		</div>

		<main class="flex-1">
			<div class="py-6">
				<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					{@render children()}
				</div>
			</div>
		</main>
	</div>
</div>
