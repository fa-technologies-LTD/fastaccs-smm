<script lang="ts">
	import { onMount } from 'svelte';
	import { BriefcaseBusiness, Compass, LifeBuoy, Lock, Unlock, Clock3, X } from '$lib/icons';
	import OrderTab from './OrderTab.svelte';
	import PurchaseTab from './PurchaseTab.svelte';
	import AffiliateTab from './AffiliateTab.svelte';
	import { addToast } from '$lib/stores/toasts';

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

	interface DashboardMetrics {
		completedOrders?: number;
		totalSpent?: number;
		accountsOwned?: number;
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
		ordersNextCursor = null,
		metrics = null,
		affiliateData: initialAffiliateData = null,
		affiliateLoaded: initialAffiliateLoaded = false,
		storeCredit = null,
		purchases: initialPurchases = [],
		purchasesNextCursor = null,
		purchasesLoaded = false,
		whatsappNumber = ''
	}: {
		user?: DashboardUser | null;
		name?: string | null;
		orders?: DashboardOrder[];
		ordersNextCursor?: string | null;
		metrics?: DashboardMetrics | null;
		affiliateData?: unknown;
		affiliateLoaded?: boolean;
		storeCredit?: { totalAvailable?: number } | null;
		purchases?: DashboardPurchase[];
		purchasesNextCursor?: string | null;
		purchasesLoaded?: boolean;
		whatsappNumber?: string;
	} = $props();

	const storeCreditBalance = $derived(Math.max(0, Number(storeCredit?.totalAvailable || 0)));

	// Store-credit history (lazy-loaded when the card is tapped).
	type CreditEntry = {
		at: string;
		description: string;
		delta: number;
		kind: string;
		category: string;
		status: string;
	};
	let showCreditHistory = $state(false);
	let creditHistory = $state<CreditEntry[] | null>(null);
	let creditHistoryLoading = $state(false);
	async function openCreditHistory(): Promise<void> {
		showCreditHistory = true;
		if (creditHistory) return;
		creditHistoryLoading = true;
		try {
			const res = await fetch('/api/store-credit/history').then((r) => r.json());
			if (res?.success) creditHistory = res.entries ?? [];
		} catch {
			creditHistory = [];
		} finally {
			creditHistoryLoading = false;
		}
	}
	function creditDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	let affiliateData = $state<unknown>(initialAffiliateData);
	let affiliateDataLoaded = $state(initialAffiliateLoaded);
	let affiliateSummaryLoaded = $state(initialAffiliateLoaded);
	let affiliateDataLoading = $state(false);
	let affiliateSummaryLoading = $state(false);
	let affiliateDataError = $state('');

	const affiliateState = $derived(
		affiliateData && typeof affiliateData === 'object'
			? (affiliateData as AffiliateStateFlags)
			: null
	);
	const affiliateAccessUnlocked = $derived(
		Boolean(affiliateState?.unlocked || affiliateState?.isActive || affiliateState?.eligible)
	);
	// Eligible (access unlocks on the first purchase) but hasn't activated their referral
	// code yet — the real conversion gap. Nudge them to claim it, not to "spend more".
	const affiliateEligibleNotActive = $derived(
		Boolean(affiliateState?.unlocked || affiliateState?.eligible) && !affiliateState?.isActive
	);
	let activeTab = $state<DashboardTab>('orders');
	let selectedOrderId = $state<string | null>(null);
	let showPaymentPendingBanner = $state(false);
	let showAffiliateAccessNudge = $state(false);

	function affiliateNudgeDismissed(): boolean {
		return (
			typeof window !== 'undefined' &&
			window.sessionStorage.getItem('fastaccs_affiliate_access_nudge_dismissed') === '1'
		);
	}

	async function ensureAffiliateData(): Promise<void> {
		if (affiliateDataLoaded || affiliateDataLoading) return;
		affiliateDataLoading = true;
		affiliateDataError = '';
		try {
			const response = await fetch('/api/affiliate/stats');
			const result = await response.json().catch(() => ({}));
			if (!response.ok || !result?.success) {
				throw new Error(result?.error || 'Could not load affiliate details.');
			}
			affiliateData = result.data?.dashboard || null;
			affiliateDataLoaded = true;
			const state = affiliateData as AffiliateStateFlags | null;
			showAffiliateAccessNudge =
				Boolean(state?.unlocked || state?.eligible) &&
				!state?.isActive &&
				!affiliateNudgeDismissed();
		} catch (error) {
			affiliateDataError =
				error instanceof Error ? error.message : 'Could not load affiliate details.';
		} finally {
			affiliateDataLoading = false;
		}
	}

	async function ensureAffiliateSummary(): Promise<void> {
		if (affiliateSummaryLoaded || affiliateSummaryLoading || affiliateDataLoaded) return;
		affiliateSummaryLoading = true;
		try {
			const response = await fetch('/api/affiliate/stats?summary=1');
			const result = await response.json().catch(() => ({}));
			if (!response.ok || !result?.success) return;
			affiliateData = result.data?.summary || null;
			affiliateSummaryLoaded = true;
			const state = affiliateData as AffiliateStateFlags | null;
			showAffiliateAccessNudge =
				Boolean(state?.unlocked || state?.eligible) &&
				!state?.isActive &&
				!affiliateNudgeDismissed();
		} catch {
			// This optional check must never disturb the main dashboard.
		} finally {
			affiliateSummaryLoading = false;
		}
	}

	let isClaimingAffiliate = $state(false);
	// One-click claim: activate the eligible user's affiliate program right from the
	// dashboard nudge, then land them on the affiliate tab to copy & share their code.
	async function claimAffiliateCode(): Promise<void> {
		if (isClaimingAffiliate) return;
		isClaimingAffiliate = true;
		try {
			const response = await fetch('/api/affiliate/enable', { method: 'POST' });
			const data = await response.json();
			if (data?.success) {
				addToast({ type: 'success', title: 'Your affiliate code is ready 🎉', duration: 3000 });
				showAffiliateAccessNudge = false;
				window.location.href = '/dashboard?tab=affiliate';
			} else {
				addToast({
					type: 'error',
					title: data?.error || 'Could not activate affiliate access',
					duration: 3600
				});
			}
		} catch {
			addToast({ type: 'error', title: 'Could not activate affiliate access', duration: 3600 });
		} finally {
			isClaimingAffiliate = false;
		}
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
		showAffiliateAccessNudge = affiliateEligibleNotActive && !affiliateNudgeDismissed();
		// Ordinary dashboard visits need only the access flags used by the small nudge.
		// The full ledger/referral report is reserved for the Affiliate tab.
		if (activeTab === 'affiliate') void ensureAffiliateData();
		else void ensureAffiliateSummary();

		const handlePopState = () => {
			applyRouteContext(new URL(window.location.href));
			if (activeTab === 'affiliate') void ensureAffiliateData();
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

	let completedOrders = $derived(Math.max(0, Number(metrics?.completedOrders || 0)));
	let totalSpent = $derived(Math.max(0, Number(metrics?.totalSpent || 0)));
	let accountsOwned = $derived(Math.max(0, Number(metrics?.accountsOwned || 0)));
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
					<!-- This counts PAID (non-refunded) orders, not delivered ones — a paid order still
					     being fulfilled was reading as "completed". Wording matches what it measures. -->
					<p class="text-xs" style="color: var(--text-muted);">
						{completedOrders} paid order{completedOrders === 1 ? '' : 's'}
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
						Affiliate access unlocked 🎉
					</p>
					<p class="text-xs sm:text-sm" style="color: var(--text-muted);">
						Claim your referral code and earn real cash from retained eligible account orders.
					</p>
					<div class="mt-2 flex flex-wrap gap-2">
						<button
							type="button"
							onclick={claimAffiliateCode}
							disabled={isClaimingAffiliate}
							class="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
							style="background: rgba(5,212,113,0.16); border: 1px solid rgba(5,212,113,0.35); color: var(--primary);"
						>
							{isClaimingAffiliate ? 'Activating…' : 'Claim my code'}
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

	<div class="mb-5 grid grid-cols-3 gap-3">
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
		<button
			type="button"
			onclick={openCreditHistory}
			class="rounded-[var(--r-sm)] border border-[var(--border)] px-3 py-3 text-left transition-colors hover:border-[var(--primary)]"
			style="background: var(--surface-2);"
			title="View store-credit history"
		>
			<div
				class="text-xl leading-none font-semibold sm:text-2xl"
				style="color: var(--text); font-family: var(--font-head);"
			>
				₦{storeCreditBalance.toLocaleString()}
			</div>
			<div
				class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs"
				style="color: var(--text-muted);"
			>
				<span>Store Credit</span>
				<span class="text-[10px] font-semibold" style="color: var(--primary);"
					>· view history →</span
				>
			</div>
		</button>
	</div>

	<div id="dashboard-tabs" class="mb-4 overflow-x-auto border-b border-[var(--border)]">
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
				onclick={() => {
					activeTab = 'affiliate';
					void ensureAffiliateData();
				}}
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
		<OrderTab
			initialOrders={orders}
			initialNextCursor={ordersNextCursor}
			focusOrderId={selectedOrderId}
		/>
	{:else if activeTab === 'purchases'}
		<PurchaseTab
			{initialPurchases}
			initialNextCursor={purchasesNextCursor}
			initialLoaded={purchasesLoaded}
			{whatsappNumber}
		/>
	{:else if affiliateDataLoaded}
		<AffiliateTab initialAffiliateData={affiliateData} />
	{:else}
		<div
			class="rounded-[var(--r-md)] border border-[var(--border)] p-10 text-center"
			style="background: var(--surface-2);"
		>
			<p class="text-sm" style="color: var(--text-muted);">
				{affiliateDataLoading
					? 'Loading affiliate details…'
					: affiliateDataError || 'Affiliate details are not available yet.'}
			</p>
			{#if !affiliateDataLoading}
				<button
					type="button"
					onclick={() => ensureAffiliateData()}
					class="mt-3 rounded-full px-4 py-2 text-xs font-semibold"
					style="background: var(--primary); color: #04140c;"
				>
					Try again
				</button>
			{/if}
		</div>
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

{#if showCreditHistory}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
		style="background: rgba(0,0,0,0.6);"
		onclick={() => (showCreditHistory = false)}
		role="presentation"
	>
		<div
			class="flex max-h-[80vh] w-full flex-col rounded-t-2xl border border-[var(--border)] sm:max-w-md sm:rounded-2xl"
			style="background: var(--surface);"
			onclick={(e) => e.stopPropagation()}
			role="presentation"
		>
			<div class="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
				<div>
					<h3
						class="text-base font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Store Credit
					</h3>
					<p class="text-xs" style="color: var(--text-muted);">
						₦{storeCreditBalance.toLocaleString()} available
					</p>
				</div>
				<button
					onclick={() => (showCreditHistory = false)}
					class="rounded-lg p-1.5 hover:bg-white/5"
					aria-label="Close"
					style="color: var(--text-muted);">✕</button
				>
			</div>
			<div class="flex-1 overflow-y-auto px-4 py-1">
				{#if creditHistoryLoading}
					<p class="py-8 text-center text-sm" style="color: var(--text-muted);">Loading…</p>
				{:else if !creditHistory || creditHistory.length === 0}
					<p class="py-8 text-center text-sm" style="color: var(--text-muted);">
						No store-credit activity yet.
					</p>
				{:else}
					{#each creditHistory as e (e.at + e.description)}
						<div
							class="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2.5 last:border-0"
						>
							<div class="min-w-0">
								<p class="truncate text-sm" style="color: var(--text);">{e.description}</p>
								<p class="text-[11px]" style="color: var(--text-dim);">
									{e.category} · {e.status.replaceAll('_', ' ')} · {creditDate(e.at)}
								</p>
							</div>
							<span
								class="shrink-0 text-sm font-semibold"
								style="color: {e.kind === 'credit' ? '#34d399' : 'var(--text-muted)'};"
							>
								{e.delta >= 0 ? '+' : '−'}₦{Math.abs(e.delta).toLocaleString()}
							</span>
						</div>
					{/each}
				{/if}
			</div>
			<div class="border-t border-[var(--border)] px-4 py-2.5 text-center">
				<a
					href="/how-it-works?tab=affiliate"
					class="text-xs font-semibold"
					style="color: var(--primary);"
				>
					earn more from referrals →
				</a>
			</div>
		</div>
	</div>
{/if}

<style>
	.quick-action-card {
		background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0));
	}
</style>
