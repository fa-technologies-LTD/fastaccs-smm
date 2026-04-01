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
		X,
		UserCheck,
		Type
	} from '@lucide/svelte';

	let { data, children } = $props();

	const adminNavItems = [
		{ href: '/admin', label: 'Dashboard', icon: Home },
		{ href: '/admin/platforms', label: 'Platforms', icon: Layers },
		{ href: '/admin/tiers', label: 'Tiers', icon: Target },
		{ href: '/admin/inventory', label: 'Inventory', icon: Package },
		{ href: '/admin/batches', label: 'Batch Import', icon: Plus },
		{ href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
		{ href: '/admin/affiliates', label: 'Affiliates', icon: UserCheck },
		{ href: '/admin/users', label: 'Users', icon: Users },
		{ href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
		{ href: '/admin/microcopy', label: 'Microcopy', icon: Type },
		{ href: '/admin/settings', label: 'Settings', icon: Settings }
	];

	let sidebarOpen = $state(false);
</script>

<svelte:head>
	<title>Admin Panel - FastAccs</title>
</svelte:head>

<div class="min-h-screen" style="background: var(--bg);">
	<!-- Desktop Sidebar -->
	<div class="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
		<div
			class="flex min-h-0 flex-1 flex-col"
			style="border-right: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
				<img src="/src/lib/assets/logo.png" alt="FastAccs" class="mx-12" />
				<nav class="mt-5 flex-1 space-y-1 px-2">
					{#each adminNavItems as item (item.href)}
						{@const IconComponent = item.icon}
						<a
							href={item.href}
							data-sveltekit-preload-data="hover"
							class="group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-all {page
								.url.pathname === item.href
								? 'bg-white/10 text-white'
								: 'text-gray-300 hover:bg-white/5 hover:text-white'}"
						>
							<IconComponent
								class="mr-3 h-5 w-5 flex-shrink-0 transition-transform group-hover:scale-95 group-hover:rotate-12"
							/>
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
					class="fixed inset-0 cursor-default"
					style="background: rgba(0, 0, 0, 0.5);"
					onclick={() => (sidebarOpen = false)}
					aria-label="Close sidebar"
				></button>
				<div
					class="relative flex w-full max-w-xs flex-1 flex-col"
					style="background: var(--bg-elev-1);"
				>
					<div class="h-0 flex-1 overflow-y-auto pt-5 pb-4">
						<!-- Logo and Close Button -->
						<div class="mb-6 flex items-center justify-between px-4">
							<img src="/src/lib/assets/logo.png" alt="FastAccs" class="size-3/5" />
							<button
								type="button"
								class="flex h-10 w-10 items-center justify-center rounded-full transition-colors focus:ring-2 focus:outline-none"
								style="color: var(--text-muted);"
								onclick={() => (sidebarOpen = false)}
							>
								<X class="h-6 w-6" />
							</button>
						</div>

						<nav class="space-y-1 px-2">
							{#each adminNavItems as item (item.href)}
								{@const IconComponent = item.icon}
								<a
									href={item.href}
									class="group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-all {page
										.url.pathname === item.href
										? 'bg-white/10 text-white'
										: 'text-gray-300 hover:bg-white/5 hover:text-white'}"
									onclick={() => (sidebarOpen = false)}
								>
									<IconComponent
										class="mr-4 h-6 w-6 transition-transform group-hover:scale-95 group-hover:rotate-12"
									/>
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
		<div
			class="sticky top-0 z-10"
			style="border-bottom: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between px-4 py-3">
				<!-- Mobile menu button -->
				<button
					type="button"
					class="-mt-0.5 -ml-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors focus:ring-2 focus:outline-none focus:ring-inset lg:hidden"
					style="color: var(--text-muted);"
					onclick={() => (sidebarOpen = true)}
				>
					<Menu class="h-5 w-5" />
				</button>

				<!-- Admin info and actions -->
				<div class="ml-auto flex items-center space-x-4">
					<!-- Admin status -->
					<div class="flex items-center space-x-2">
						<div class="h-2 w-2 rounded-full" style="background: var(--status-success);"></div>
						<span class="text-sm" style="color: var(--text-muted);"
							>{data?.user?.email || 'admin@fastaccs.com'}</span
						>
					</div>

					<!-- Sign out button -->
					<a
						href="/auth/logout"
						class="inline-flex cursor-pointer items-center rounded-full px-3 py-2 text-sm leading-4 font-medium transition-all hover:scale-[.98] focus:ring-2 focus:ring-offset-2 focus:outline-none"
						style="border: 1px solid var(--border); background: var(--surface); color: var(--text);"
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
