<script lang="ts">
	import { onMount } from 'svelte';
	import { BriefcaseBusiness, Compass, LifeBuoy, Lock, Unlock, Clock3, X } from '$lib/icons';
	import OrderTab from './OrderTab.svelte';
	import PurchaseTab from './PurchaseTab.svelte';
	import AffiliateTab from './AffiliateTab.svelte';
	import { isRevenueOrder } from '$lib/helpers/order-revenue';

	type DashboardTab = 'orders' | 'purchases' | 'affiliate';

	interface DashboardUser {
		fullName?: string | null;
		emailVerified?: boolean;
	}

	interface DashboardOrder {
		id: string;
		status?: string | null;
		paymentStatus?: string | null;
		paymentReference?: string | null;
		totalAmount?: number | string | null;
	}

	interface DashboardPurchase {
		platform?: string | null;
		quantity?: number | null;
	}

	interface AffiliateStateFlags {
		unlocked?: boolean;
		isActive?: boolean;
		eligible?: boolean;
		lifetimeCompletedSpend?: number;
		unlockThreshold?: number;
	}

	let {
		user = null,
		name = '',
		orders = [],
		affiliateData: initialAffiliateData = null,
		purchases: initialPurchases = [],
		whatsappNumber = ''
	}: {
		user?: DashboardUser | null;
		name?: string | null;
		orders?: DashboardOrder[];
		affiliateData?: unknown;
		purchases?: DashboardPurchase[];
		whatsappNumber?: string;
	} = $props();

	const affiliateState = $derived(
		initialAffiliateData && typeof initialAffiliateData === 'object'
			? (initialAffiliateData as AffiliateStateFlags)
			: null
	);
	const affiliateAccessUnlocked = $derived(
		Boolean(affiliateState?.unlocked || affiliateState?.isActive || affiliateState?.eligible)
	);
	const affiliateLifetimeSpend = $derived(Number(affiliateState?.lifetimeCompletedSpend || 0));
	const affiliateUnlockThreshold = $derived(Number(affiliateState?.unlockThreshold || 50000));
	const affiliateRemainingSpend = $derived(
		Math.max(0, affiliateUnlockThreshold - affiliateLifetimeSpend)
	);
	const shouldShowAffiliateNudge = $derived(
		!affiliateAccessUnlocked && affiliateLifetimeSpend >= 20000 && affiliateRemainingSpend > 0
	);
	let activeTab = $state<DashboardTab>('orders');
	let selectedOrderId = $state<string | null>(null);
	let showPaymentPendingBanner = $state(false);
	let showAffiliateAccessNudge = $state(false);

	function formatMoney(value: number): string {
		return `₦${Math.max(0, Math.round(value)).toLocaleString()}`;
	}

	function applyRouteContext(url: URL): void {
		const tabParam = String(url.searchParams.get('tab') || '').toLowerCase();
		if (tabParam === 'orders' || tabParam === 'purchases' || tabParam === 'affiliate') {
			activeTab = tabParam as DashboardTab;
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

	function dismissAffiliateAccessNudge(): void {
		showAffiliateAccessNudge = false;
		if (typeof window === 'undefined') return;
		window.sessionStorage.setItem('fastaccs_affiliate_access_nudge_dismissed', '1');
	}

	onMount(() => {
		applyRouteContext(new URL(window.location.href));
		const dismissed =
			window.sessionStorage.getItem('fastaccs_affiliate_access_nudge_dismissed') === '1';
		showAffiliateAccessNudge = shouldShowAffiliateNudge && !dismissed;

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
	let totalSpent = $derived(
		orders
			.filter((order) =>
				isRevenueOrder({
					status: order.status,
					paymentStatus: order.paymentStatus
				})
			)
			.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
	);
	let accountsOwned = $derived(
		initialPurchases.reduce((sum, purchase) => sum + Number(purchase.quantity || 0), 0)
	);
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
					<p
						class="text-sm font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Payment Confirmation Pending
					</p>
					<p class="text-xs sm:text-sm" style="color: var(--text-muted);">
						We are still waiting for Monnify confirmation. This order will auto-update once payment
						is verified.
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

	{#if showAffiliateAccessNudge}
		<div
			class="mb-5 flex items-start justify-between gap-3 rounded-[var(--r-sm)] border px-4 py-3"
			style="background: rgba(5,212,113,0.10); border-color: rgba(5,212,113,0.28);"
		>
			<div class="flex items-start gap-2">
				<BriefcaseBusiness size={17} class="mt-0.5" style="color: var(--primary);" />
				<div>
					<p
						class="text-sm font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						You are close to affiliate access
					</p>
					<p class="text-xs sm:text-sm" style="color: var(--text-muted);">
						Spend about {formatMoney(affiliateRemainingSpend)} more to unlock referral earning.
					</p>
					<div class="mt-2 flex flex-wrap gap-2">
						<button
							type="button"
							onclick={() => {
								activeTab = 'affiliate';
								showAffiliateAccessNudge = false;
							}}
							class="rounded-full px-3 py-1.5 text-xs font-semibold"
							style="background: rgba(5,212,113,0.16); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
						>
							View progress
						</button>
						<a
							href="/affiliate"
							class="rounded-full px-3 py-1.5 text-xs font-semibold"
							style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text);"
						>
							Learn more
						</a>
					</div>
				</div>
			</div>
			<button
				type="button"
				onclick={dismissAffiliateAccessNudge}
				aria-label="Dismiss affiliate access reminder"
				class="rounded-full p-1.5 transition hover:opacity-80"
				style="border: 1px solid var(--border); color: var(--text-muted);"
			>
				<X size={14} />
			</button>
		</div>
	{/if}

	<div class="mb-5 grid grid-cols-2 gap-3">
		<div
			class="rounded-[var(--r-sm)] border border-[var(--border)] px-3 py-3"
			style="background: var(--surface-2);"
		>
			<div
				class="text-xl leading-none font-semibold sm:text-2xl"
				style="color: var(--text); font-family: var(--font-head);"
			>
				{accountsOwned}
			</div>
			<div class="mt-1 text-xs" style="color: var(--text-muted);">Accounts owned</div>
		</div>
		<div
			class="rounded-[var(--r-sm)] border border-[var(--border)] px-3 py-3"
			style="background: var(--surface-2);"
		>
			<div
				class="text-xl leading-none font-semibold sm:text-2xl"
				style="color: var(--text); font-family: var(--font-head);"
			>
				₦{totalSpent.toLocaleString()}
			</div>
			<div class="mt-1 text-xs" style="color: var(--text-muted);">Total spent</div>
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
				onclick={() => (activeTab = 'affiliate')}
				class="border-b-2 px-1 py-2 text-sm font-semibold transition-all"
				style="border-color: {activeTab === 'affiliate'
					? 'var(--primary)'
					: 'transparent'}; color: {activeTab === 'affiliate'
					? 'var(--primary)'
					: 'var(--text-dim)'}; font-family: var(--font-head);"
				title="Affiliate access"
			>
				Affiliate
			</button>
		</nav>
	</div>

	{#if activeTab === 'orders'}
		<OrderTab initialOrders={orders} focusOrderId={selectedOrderId} />
	{:else if activeTab === 'purchases'}
		<PurchaseTab {initialPurchases} {whatsappNumber} />
	{:else}
		<AffiliateTab {initialAffiliateData} />
	{/if}

	<div class="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
		<a
			href="/platforms"
			class="quick-action-card flex min-h-[88px] flex-col items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] p-3 transition-all hover:-translate-y-0.5"
			style="background: var(--surface-2); color: var(--text);"
		>
			<Compass size={20} stroke={2.25} style="color: var(--primary);" />
			<span class="mt-1 text-xs font-semibold">Buy more</span>
		</a>
		<a
			href="/support"
			class="quick-action-card flex min-h-[88px] flex-col items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] p-3 transition-all hover:-translate-y-0.5"
			style="background: var(--surface-2); color: var(--text);"
		>
			<LifeBuoy size={20} stroke={2.25} style="color: var(--primary);" />
			<span class="mt-1 text-xs font-semibold">Support</span>
		</a>
		<a
			href="/affiliate"
			class="quick-action-card flex min-h-[88px] flex-col items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] p-3 transition-all hover:-translate-y-0.5"
			style="background: var(--surface-2); color: var(--text);"
		>
			<BriefcaseBusiness
				size={20}
				stroke={2.25}
				style="color: {affiliateAccessUnlocked ? 'var(--primary)' : 'var(--text-dim)'};"
			/>
			<span
				class="mt-1 text-xs font-semibold"
				style="color: {affiliateAccessUnlocked ? 'var(--text)' : 'var(--text-dim)'};"
			>
				Affiliate
			</span>
			<span class="text-[10px] font-medium" style="color: var(--text-dim);">
				{affiliateAccessUnlocked ? 'Unlocked' : 'View progress'}
			</span>
		</a>
	</div>
</div>

<style>
	.quick-action-card {
		background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0));
	}
</style>
