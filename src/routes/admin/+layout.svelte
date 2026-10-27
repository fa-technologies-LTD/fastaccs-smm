<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { AdminPermission } from '$lib/auth/admin-roles';
	import { adminDialog } from '$lib/helpers/admin-dialog';
	import {
		Package,
		ShoppingCart,
		Users,
		BarChart3,
		TrendingUp,
		Settings,
		Home,
		Layers,
		DollarSign,
		Menu,
		X
	} from '$lib/icons';
	import SectionTabs from '$lib/components/admin/SectionTabs.svelte';
	import {
		findSectionTab,
		sectionCount,
		visibleSections,
		type AdminSection,
		type AdminSectionId
	} from '$lib/helpers/admin-sections';

	import logo from '$lib/assets/logo.png';

	let { data, children } = $props();
	const adminPermissions = $derived(
		Array.isArray(data?.adminPermissions)
			? (data.adminPermissions as AdminPermission[])
			: ([] as AdminPermission[])
	);

	const featureFlags = $derived(
		data?.featureFlags || {
			adminPromotions: false,
			adminAnnouncementBanner: false,
			adminAdvancedAnalytics: true,
			adminRoleManagement: true,
			adminStoreControls: true
		}
	);

	// "Needs attention" counts for sidebar badges, keyed by nav href.
	let attentionCounts = $state<Record<string, number>>({});
	let attentionRefreshInFlight = false;

	async function refreshAttentionCounts(): Promise<void> {
		if (attentionRefreshInFlight || document.visibilityState === 'hidden') return;
		attentionRefreshInFlight = true;
		try {
			const response = await fetch('/api/admin/attention-counts');
			if (!response.ok) return;
			const counts = await response.json();
			if (counts) attentionCounts = counts;
		} catch {
			// A stale badge is safer than interrupting admin work for a non-critical count.
		} finally {
			attentionRefreshInFlight = false;
		}
	}

	afterNavigate(() => void refreshAttentionCounts());

	onMount(() => {
		const desktop = window.matchMedia('(min-width: 1024px)');
		const closeOnDesktop = () => {
			if (desktop.matches) sidebarOpen = false;
		};
		desktop.addEventListener('change', closeOnDesktop);
		const refreshWhenVisible = () => {
			if (document.visibilityState === 'visible') void refreshAttentionCounts();
		};
		const refreshAfterAdminAction = () => void refreshAttentionCounts();
		const timer = window.setInterval(() => void refreshAttentionCounts(), 120_000);
		window.addEventListener('focus', refreshWhenVisible);
		document.addEventListener('visibilitychange', refreshWhenVisible);
		window.addEventListener('fastaccs:admin-attention-refresh', refreshAfterAdminAction);

		return () => {
			desktop.removeEventListener('change', closeOnDesktop);
			window.clearInterval(timer);
			window.removeEventListener('focus', refreshWhenVisible);
			document.removeEventListener('visibilitychange', refreshWhenVisible);
			window.removeEventListener('fastaccs:admin-attention-refresh', refreshAfterAdminAction);
		};
	});

	const SECTION_ICONS: Record<AdminSectionId, typeof Home> = {
		overview: Home,
		orders: ShoppingCart,
		inventory: Package,
		customers: Users,
		products: Layers,
		pricing: DollarSign,
		analytics: BarChart3,
		growth: TrendingUp,
		settings: Settings
	};

	const sections = $derived(
		visibleSections(adminPermissions, featureFlags, attentionCounts, page.url.pathname)
	);
	const current = $derived(
		findSectionTab(sections, page.url.pathname, page.url.searchParams.get('tab'))
	);

	// Each section opens on the tab you used last.
	const LAST_TAB_KEY = 'fastaccs_admin_last_tab';
	let lastTabs = $state<Record<string, string>>({});
	onMount(() => {
		try {
			lastTabs = JSON.parse(localStorage.getItem(LAST_TAB_KEY) || '{}') || {};
		} catch {
			lastTabs = {};
		}
	});
	$effect(() => {
		if (!current) return;
		const { section, tab } = current;
		if (lastTabs[section.id] === tab.href) return;
		lastTabs = { ...lastTabs, [section.id]: tab.href };
		try {
			localStorage.setItem(LAST_TAB_KEY, JSON.stringify(lastTabs));
		} catch {
			// Remembering the tab is a convenience; the default tab still works.
		}
	});
	function sectionHref(section: AdminSection): string {
		const remembered = lastTabs[section.id];
		return section.tabs.some((tab) => tab.href === remembered) ? remembered : section.tabs[0].href;
	}

	// On a phone, swiping the page left or right moves to the next or previous tab.
	function swipeTabs(node: HTMLElement) {
		let startX = 0;
		let startY = 0;
		let startAt = 0;
		let tracking = false;
		const scrollsSideways = (element: Element | null): boolean => {
			for (let el = element; el && el !== node; el = el.parentElement) {
				const overflow = getComputedStyle(el).overflowX;
				if ((overflow === 'auto' || overflow === 'scroll') && el.scrollWidth > el.clientWidth)
					return true;
			}
			return false;
		};
		const start = (event: TouchEvent) => {
			const target = event.target as Element | null;
			tracking =
				event.touches.length === 1 &&
				!target?.closest('input, textarea, select, [contenteditable], [data-no-swipe]') &&
				!scrollsSideways(target);
			startX = event.touches[0]?.clientX ?? 0;
			startY = event.touches[0]?.clientY ?? 0;
			startAt = Date.now();
		};
		const end = (event: TouchEvent) => {
			if (!tracking || !current || current.section.tabs.length < 2) return;
			tracking = false;
			const dx = (event.changedTouches[0]?.clientX ?? startX) - startX;
			const dy = (event.changedTouches[0]?.clientY ?? startY) - startY;
			if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - startAt > 600)
				return;
			const tabs = current.section.tabs;
			const index = tabs.findIndex((tab) => tab.href === current?.tab.href);
			const next = tabs[index + (dx < 0 ? 1 : -1)];
			if (next) void goto(next.href);
		};
		node.addEventListener('touchstart', start, { passive: true });
		node.addEventListener('touchend', end, { passive: true });
		return {
			destroy() {
				node.removeEventListener('touchstart', start);
				node.removeEventListener('touchend', end);
			}
		};
	}

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
	<meta name="robots" content="noindex, nofollow" />
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
					{#each sections as section (section.id)}
						{@const IconComponent = SECTION_ICONS[section.id]}
						{@const count = sectionCount(section, attentionCounts)}
						<a
							href={sectionHref(section)}
							data-sveltekit-preload-data="hover"
							aria-current={current?.section.id === section.id ? 'page' : undefined}
							class="group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-all {current
								?.section.id === section.id
								? 'bg-white/10 text-white'
								: 'text-gray-300 hover:bg-white/5 hover:text-white'}"
						>
							<IconComponent
								class="mr-3 h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-95 group-hover:rotate-12"
							/>
							{section.label}
							{#if count > 0}
								<span
									class="ml-auto rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold"
									style="background: var(--fa-lime-700); color: #0a0a0a;"
									title="Needs attention"
								>
									{count}
								</span>
							{/if}
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
					id="admin-mobile-navigation"
					role="dialog"
					aria-modal="true"
					aria-label="Admin navigation"
					tabindex="-1"
					use:adminDialog={() => (sidebarOpen = false)}
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
								aria-label="Close admin navigation"
							>
								<X class="h-6 w-6" />
							</button>
						</div>

						<nav class="space-y-1 px-2">
							{#each sections as section (section.id)}
								{@const IconComponent = SECTION_ICONS[section.id]}
								{@const count = sectionCount(section, attentionCounts)}
								<a
									href={sectionHref(section)}
									aria-current={current?.section.id === section.id ? 'page' : undefined}
									class="group flex items-center rounded-md px-2 py-2.5 text-base font-medium transition-all {current
										?.section.id === section.id
										? 'bg-white/10 text-white'
										: 'text-gray-300 hover:bg-white/5 hover:text-white'}"
									onclick={() => (sidebarOpen = false)}
								>
									<IconComponent
										class="mr-4 h-6 w-6 transition-transform group-hover:scale-95 group-hover:rotate-12"
									/>
									{section.label}
									{#if count > 0}
										<span
											class="ml-auto rounded-full px-2 py-0.5 text-xs leading-none font-bold"
											style="background: var(--fa-lime-700); color: #0a0a0a;"
											title="Needs attention"
										>
											{count}
										</span>
									{/if}
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
					aria-label="Open admin navigation"
					aria-controls="admin-mobile-navigation"
					aria-expanded={sidebarOpen}
				>
					<Menu class="h-5 w-5" />
				</button>

				<!-- Admin info and actions -->
				<div class="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
					<!-- Admin status -->
					<div class="flex min-w-0 items-center gap-1.5 sm:gap-2">
						<div class="h-2 w-2 rounded-full" style="background: var(--status-success);"></div>
						<span
							class="max-w-[36vw] truncate text-xs sm:max-w-[42vw] sm:text-sm"
							style="color: var(--text-muted);">{data?.user?.email || 'admin@fastaccs.com'}</span
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

		<main class="flex-1" use:swipeTabs>
			<div class="py-4">
				<div class="admin-content-shell mx-auto max-w-7xl px-2.5 sm:px-4 lg:px-6">
					{#if current && current.section.tabs.length > 1}
						<SectionTabs
							section={current.section}
							activeHref={current.tab.href}
							counts={attentionCounts}
						/>
					{/if}
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
