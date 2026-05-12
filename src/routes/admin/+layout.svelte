<script lang="ts">
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { AdminPermission } from '$lib/auth/admin-roles';
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
		Type,
		Mail,
		Tag
	} from '$lib/icons';

	import logo from '$lib/assets/logo.png';

	let { data, children } = $props();
	const adminPermissions = $derived(
		Array.isArray(data?.adminPermissions)
			? (data.adminPermissions as AdminPermission[])
			: ([] as AdminPermission[])
	);
	const adminPermissionSet = $derived(new Set(adminPermissions));

	const featureFlags = $derived(
		data?.featureFlags || {
			adminPromotions: false,
			adminAnnouncementBanner: false,
			adminAdvancedAnalytics: true,
			adminRoleManagement: true,
			adminStoreControls: true
		}
	);

	const adminNavItems = $derived.by(() => {
		const allItems: Array<{
			href: string;
			label: string;
			icon: any;
			permission?: AdminPermission;
			enabled?: boolean;
		}> = [
			{ href: '/admin', label: 'Dashboard', icon: Home },
			{
				href: '/admin/platforms',
				label: 'Platforms',
				icon: Layers,
				permission: 'admin:catalog:manage'
			},
			{ href: '/admin/tiers', label: 'Tiers', icon: Target, permission: 'admin:catalog:manage' },
			{
				href: '/admin/inventory',
				label: 'Inventory',
				icon: Package,
				permission: 'admin:inventory:manage'
			},
			{
				href: '/admin/batches',
				label: 'Batch Import',
				icon: Plus,
				permission: 'admin:inventory:manage'
			},
			{ href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
			{
				href: '/admin/affiliates',
				label: 'Affiliates',
				icon: UserCheck,
				permission: 'admin:affiliates:manage'
			},
			{ href: '/admin/users', label: 'Users', icon: Users },
			{ href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
			{
				href: '/admin/promotions',
				label: 'Promotions',
				icon: Tag,
				permission: 'admin:promotions:manage',
				enabled: featureFlags.adminPromotions
			},
			{
				href: '/admin/microcopy',
				label: 'Microcopy',
				icon: Type,
				permission: 'admin:content:manage'
			},
			{
				href: '/admin/broadcast',
				label: 'Broadcast',
				icon: Mail,
				permission: 'admin:broadcast:manage'
			},
			{
				href: '/admin/settings',
				label: 'Settings',
				icon: Settings,
				permission: 'admin:settings:manage'
			}
		];

		return allItems.filter((item) => {
			if (item.enabled === false) return false;
			if (!item.permission) return true;
			return adminPermissionSet.has(item.permission);
		});
	});

	let sidebarOpen = $state(false);

	async function signOut() {
		try {
			const response = await fetch('/auth/logout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				await invalidateAll();
				goto('/');
			}
		} catch (error) {
			console.error('Logout error:', error);
			goto('/');
		}
	}
</script>

<svelte:head>
	<title>Admin Panel - FastAccs</title>
</svelte:head>

<div class="admin-shell min-h-screen" style="background: var(--bg);">
	<!-- Desktop Sidebar -->
	<div class="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-56 lg:flex-col">
		<div
			class="flex min-h-0 flex-1 flex-col"
			style="border-right: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
				<img src={logo} alt="FastAccs" class="mx-12" />
				<nav class="mt-5 flex-1 space-y-1 px-2">
					{#each adminNavItems as item (item.href)}
						{@const IconComponent = item.icon}
						<a
							href={item.href}
							data-sveltekit-preload-data="hover"
							class="group flex items-center rounded-md px-2 py-1.5 text-xs font-medium transition-all {page
								.url.pathname === item.href
								? 'bg-white/10 text-white'
								: 'text-gray-300 hover:bg-white/5 hover:text-white'}"
						>
							<IconComponent
								class="mr-3 h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-95 group-hover:rotate-12"
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
							<img src={logo} alt="FastAccs" class="h-8 w-auto" />
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
	<div class="lg:pl-56">
		<!-- Admin Navbar -->
		<div
			class="sticky top-0 z-10"
			style="border-bottom: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center justify-between gap-2 px-2 py-2 sm:px-3">
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
				<div class="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
					<!-- Admin status -->
					<div class="flex min-w-0 items-center gap-1.5 sm:gap-2">
						<div class="h-2 w-2 rounded-full" style="background: var(--status-success);"></div>
						<span class="max-w-[36vw] truncate text-xs sm:max-w-[42vw] sm:text-sm" style="color: var(--text-muted);"
							>{data?.user?.email || 'admin@fastaccs.com'}</span
						>
						<span
							class="hidden rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex"
							style="background: var(--bg-elev-2); color: var(--text-muted); border: 1px solid var(--border);"
						>
							{data?.adminRole || 'UNASSIGNED'}
						</span>
					</div>

					<!-- Sign out button -->
					<button
						type="button"
						onclick={signOut}
						class="inline-flex cursor-pointer items-center rounded-full px-2.5 py-1.5 text-xs leading-4 font-medium transition-all hover:scale-[.98] focus:ring-2 focus:ring-offset-2 focus:outline-none sm:px-3 sm:text-sm"
						style="border: 1px solid var(--border); background: var(--surface); color: var(--text);"
					>
						<span class="hidden sm:inline">Sign Out</span>
						<span class="sm:hidden">Out</span>
					</button>
				</div>
			</div>
		</div>

		<main class="flex-1">
			<div class="py-4">
				<div class="admin-content-shell mx-auto max-w-7xl px-2.5 sm:px-4 lg:px-6">
					{@render children()}
				</div>
			</div>
		</main>
	</div>
</div>

<style>
	:global(.admin-content-shell .min-h-screen) {
		min-height: auto;
	}

	:global(.admin-content-shell .p-6) {
		padding: 1rem;
	}

	:global(.admin-content-shell .mb-8) {
		margin-bottom: 1rem;
	}

	:global(.admin-content-shell .mb-6) {
		margin-bottom: 0.85rem;
	}

	:global(.admin-content-shell .gap-8) {
		gap: 1rem;
	}

	:global(.admin-content-shell .gap-6) {
		gap: 0.85rem;
	}

	:global(.admin-content-shell .text-2xl) {
		font-size: 1.4rem;
		line-height: 1.2;
	}

	:global(.admin-content-shell .text-xl) {
		font-size: 1.1rem;
		line-height: 1.25;
	}

	:global(.admin-content-shell .text-base) {
		font-size: 0.95rem;
		line-height: 1.35;
	}

	:global(.admin-content-shell .text-sm) {
		font-size: 0.84rem;
		line-height: 1.35;
	}

	:global(.admin-content-shell .rounded-lg) {
		border-radius: 12px;
	}

	@media (max-width: 767px) {
		:global(.admin-content-shell .p-6) {
			padding: 0.75rem;
		}

		:global(.admin-content-shell .mb-8) {
			margin-bottom: 0.75rem;
		}

		:global(.admin-content-shell .mb-6) {
			margin-bottom: 0.7rem;
		}

		:global(.admin-content-shell .gap-8) {
			gap: 0.7rem;
		}

		:global(.admin-content-shell .gap-6) {
			gap: 0.6rem;
		}

		:global(.admin-content-shell .text-2xl) {
			font-size: 1.25rem;
			line-height: 1.25;
		}

		:global(.admin-content-shell .text-xl) {
			font-size: 1.02rem;
			line-height: 1.25;
		}

		:global(.admin-content-shell .text-sm) {
			font-size: 0.8rem;
			line-height: 1.35;
		}
	}
</style>
