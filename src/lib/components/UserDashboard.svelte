<script lang="ts">
	import { onMount } from 'svelte';
	import { BriefcaseBusiness, Compass, LifeBuoy, Lock, Unlock, Clock3, X } from '@lucide/svelte';
	import OrderTab from './OrderTab.svelte';
	import PurchaseTab from './PurchaseTab.svelte';
	import AffiliateTab from './AffiliateTab.svelte';

	type DashboardTab = 'orders' | 'purchases' | 'affiliate';

	interface DashboardUser {
		fullName?: string | null;
		emailVerified?: boolean;
	}

	interface DashboardOrder {
		id: string;
		status?: string | null;
		totalAmount?: number | string | null;
	}

	interface DashboardPurchase {
		platform?: string | null;
		quantity?: number | null;
	}

	let {
		user = null,
		name = '',
		orders = [],
		affiliateData: initialAffiliateData = null,
		purchases: initialPurchases = []
	}: {
		user?: DashboardUser | null;
		name?: string | null;
		orders?: DashboardOrder[];
		affiliateData?: unknown;
		purchases?: DashboardPurchase[];
	} = $props();

	const AFFILIATE_ENABLED = false;
	let activeTab = $state<DashboardTab>('orders');
	let selectedOrderId = $state<string | null>(null);
	let showPaymentPendingBanner = $state(false);

	function applyRouteContext(url: URL): void {
		const tabParam = String(url.searchParams.get('tab') || '').toLowerCase();
		if (tabParam === 'orders' || tabParam === 'purchases' || tabParam === 'affiliate') {
			if (tabParam !== 'affiliate' || AFFILIATE_ENABLED) {
				activeTab = tabParam as DashboardTab;
			}
		}

		const orderIdParam = String(url.searchParams.get('orderId') || '').trim();
		selectedOrderId = orderIdParam || null;

		const paymentPendingParam = String(url.searchParams.get('paymentPending') || '').trim();
		showPaymentPendingBanner = paymentPendingParam === '1';
	}

	function dismissPaymentPendingBanner(): void {
		showPaymentPendingBanner = false;
		if (typeof window === 'undefined') return;
		const nextUrl = new URL(window.location.href);
		nextUrl.searchParams.delete('paymentPending');
		const pathWithQuery = nextUrl.searchParams.size
			? `${nextUrl.pathname}?${nextUrl.searchParams.toString()}`
			: nextUrl.pathname;
		window.history.replaceState({}, '', pathWithQuery);
	}

	onMount(() => {
		applyRouteContext(new URL(window.location.href));

		const handlePopState = () => {
			applyRouteContext(new URL(window.location.href));
		};

		window.addEventListener('popstate', handlePopState);
		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	});

	let displayName = $derived((name || user?.fullName || 'Customer').trim());
	let firstName = $derived(displayName.split(/\s+/)[0] || 'Customer');
	let initials = $derived(
		displayName
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'FA'
	);

	let completedOrders = $derived(
		orders.filter((order) =>
			['delivered', 'completed', 'paid'].includes(String(order.status || ''))
		).length
	);
	let totalSpent = $derived(orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0));
	let accountsOwned = $derived(
		initialPurchases.reduce((sum, purchase) => sum + Number(purchase.quantity || 0), 0)
	);
	let activePlatforms = $derived(
		new Set(
			initialPurchases
				.map((purchase) =>
					String(purchase.platform || '')
						.trim()
						.toLowerCase()
				)
				.filter(Boolean)
		).size
	);
	let openIssues = $state(0);
	let isSecured = $derived(Boolean(user?.emailVerified));
</script>

<div class="mx-auto max-w-6xl px-4 py-6 sm:py-8">
	<div
		class="mb-5 rounded-[var(--r-md)] border border-[var(--border-2)] px-4 py-3 sm:px-5"
		style="background: var(--surface-2);"
	>
		<div class="flex items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.18), rgba(105,109,250,0.12)); border: 1px solid var(--border-2); color: var(--text);"
				>
					{initials}
				</div>
				<div class="min-w-0">
					<h1
						class="truncate text-[15px] font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Hey, {firstName}
					</h1>
					<p class="text-xs" style="color: var(--text-muted);">
						{completedOrders} order{completedOrders === 1 ? '' : 's'} completed
					</p>
				</div>
			</div>

			{#if isSecured}
				<span
					class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
					style="background: rgba(5,212,113,0.1); border: 1px solid rgba(5,212,113,0.22); color: var(--primary);"
				>
					<Lock size={12} />
					Secured
				</span>
			{:else}
				<a
					href="/auth/login?returnUrl=/dashboard"
					class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
					style="background: rgba(226,75,74,0.1); border: 1px solid rgba(226,75,74,0.24); color: var(--status-danger);"
				>
					<Unlock size={12} />
					Unsecured
				</a>
			{/if}
		</div>
	</div>

	{#if showPaymentPendingBanner}
		<div
			class="mb-5 flex items-start justify-between gap-3 rounded-[var(--r-sm)] border px-4 py-3"
			style="background: rgba(202,219,46,0.12); border-color: rgba(202,219,46,0.32);"
		>
			<div class="flex items-start gap-2">
				<Clock3 size={16} class="mt-0.5" style="color: var(--fa-lime-700);" />
				<div>
					<p class="text-sm font-semibold" style="color: var(--text); font-family: var(--font-head);">
						Payment Confirmation Pending
					</p>
					<p class="text-xs sm:text-sm" style="color: var(--text-muted);">
						We are still waiting for Monnify confirmation. This order will auto-update once payment is
						verified.
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={dismissPaymentPendingBanner}
				aria-label="Dismiss payment pending notice"
				class="rounded-full p-1.5 transition hover:opacity-80"
				style="border: 1px solid var(--border); color: var(--text-muted);"
			>
				<X size={14} />
			</button>
		</div>
	{/if}

	<div class="mb-5 grid grid-cols-2 gap-3">
		<div
			class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
			style="background: var(--surface-2);"
		>
			<div
				class="text-2xl leading-none font-semibold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				{accountsOwned}
			</div>
			<div class="mt-1 text-xs" style="color: var(--text-muted);">Accounts owned</div>
		</div>
		<div
			class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
			style="background: var(--surface-2);"
		>
			<div
				class="text-2xl leading-none font-semibold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				₦{totalSpent.toLocaleString()}
			</div>
			<div class="mt-1 text-xs" style="color: var(--text-muted);">Total spent</div>
		</div>
		<div
			class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
			style="background: var(--surface-2);"
		>
			<div
				class="text-2xl leading-none font-semibold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				{activePlatforms}
			</div>
			<div class="mt-1 text-xs" style="color: var(--text-muted);">Active platforms</div>
		</div>
		<div
			class="rounded-[var(--r-sm)] border border-[var(--border)] p-4"
			style="background: var(--surface-2);"
		>
			<div
				class="text-2xl leading-none font-semibold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				{openIssues}
			</div>
			<div class="mt-1 text-xs" style="color: var(--text-muted);">Open issues</div>
		</div>
	</div>

	<div class="mb-4 overflow-x-auto border-b border-[var(--border)]">
		<nav class="flex flex-nowrap gap-6 pb-2 whitespace-nowrap">
			<button
				onclick={() => (activeTab = 'orders')}
				class="border-b-2 px-1 py-2 text-sm font-semibold transition-all"
				style="border-color: {activeTab === 'orders'
					? 'var(--primary)'
					: 'transparent'}; color: {activeTab === 'orders'
					? 'var(--primary)'
					: 'var(--text-dim)'}; font-family: var(--font-head);"
			>
				Orders
			</button>
			<button
				onclick={() => (activeTab = 'purchases')}
				class="border-b-2 px-1 py-2 text-sm font-semibold transition-all"
				style="border-color: {activeTab === 'purchases'
					? 'var(--primary)'
					: 'transparent'}; color: {activeTab === 'purchases'
					? 'var(--primary)'
					: 'var(--text-dim)'}; font-family: var(--font-head);"
			>
				Purchases
			</button>
			<button
				onclick={() => AFFILIATE_ENABLED && (activeTab = 'affiliate')}
				disabled={!AFFILIATE_ENABLED}
				class="border-b-2 px-1 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60"
				style="border-color: {activeTab === 'affiliate' && AFFILIATE_ENABLED
					? 'var(--primary)'
					: 'transparent'}; color: {activeTab === 'affiliate' && AFFILIATE_ENABLED
					? 'var(--primary)'
					: 'var(--text-dim)'}; font-family: var(--font-head);"
				title="Affiliate coming soon"
			>
				Affiliate · Coming Soon
			</button>
		</nav>
	</div>

	{#if activeTab === 'orders'}
		<OrderTab initialOrders={orders} focusOrderId={selectedOrderId} />
	{:else if activeTab === 'purchases'}
		<PurchaseTab {initialPurchases} />
	{:else}
		<AffiliateTab {initialAffiliateData} />
	{/if}

	<div class="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
		<a
			href="/platforms"
			class="quick-action-card flex min-h-[88px] flex-col items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] p-3 transition-all hover:-translate-y-0.5"
			style="background: var(--surface-2); color: var(--text);"
		>
			<Compass size={20} strokeWidth={2.25} style="color: var(--primary);" />
			<span class="mt-1 text-xs font-semibold">Buy more</span>
		</a>
		<a
			href="/support"
			class="quick-action-card flex min-h-[88px] flex-col items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] p-3 transition-all hover:-translate-y-0.5"
			style="background: var(--surface-2); color: var(--text);"
		>
			<LifeBuoy size={20} strokeWidth={2.25} style="color: var(--primary);" />
			<span class="mt-1 text-xs font-semibold">Support</span>
		</a>
		<button
			type="button"
			onclick={() => AFFILIATE_ENABLED && (activeTab = 'affiliate')}
			disabled={!AFFILIATE_ENABLED}
			class="quick-action-card flex min-h-[88px] flex-col items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] p-3 transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
			style="background: var(--surface-2); color: var(--text);"
		>
			<BriefcaseBusiness size={20} strokeWidth={2.25} style="color: var(--text-dim);" />
			<span class="mt-1 text-xs font-semibold" style="color: var(--text-dim);">Affiliate</span>
			<span class="text-[10px] font-medium" style="color: var(--text-dim);">Coming Soon</span>
		</button>
	</div>
</div>

<style>
	.quick-action-card {
		background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0));
	}
</style>
