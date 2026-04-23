<script lang="ts">
	import { goto } from '$app/navigation';
	import { addToast } from '$lib/stores/toasts';
	import { formatDate, formatPrice } from '$lib/helpers/utils';
	import { getOrderStatusLabel } from '$lib/helpers/order-status';
	import { ArrowLeft, ShieldCheck, ShieldOff, Clock3, ShoppingBag, Activity } from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let user = $state(data.user);
	const stats = $derived(data.stats);
	const orders = $derived(data.orders || []);
	const timeline = $derived(data.timeline || []);
	const recentSessions = $derived(data.recentSessions || []);
	let togglingStatus = $state(false);

	async function toggleUserAccess() {
		if (togglingStatus) return;
		togglingStatus = true;
		try {
			const response = await fetch(`/api/admin/users/${user.id}/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isActive: !user.isActive })
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to update user status');
			}

			user = { ...user, isActive: result.data.isActive };
			addToast({
				type: 'success',
				title: result.data.isActive ? 'User unblocked' : 'User suspended',
				duration: 2800
			});
		} catch (err) {
			addToast({
				type: 'error',
				title: err instanceof Error ? err.message : 'Failed to update user',
				duration: 3500
			});
		} finally {
			togglingStatus = false;
		}
	}

	function getTimelineDotColor(type: string): string {
		if (type === 'payment') return 'var(--status-success)';
		if (type === 'admin') return 'var(--status-warning)';
		if (type === 'login') return 'var(--link)';
		return 'var(--text-dim)';
	}
</script>

<div class="space-y-4 p-3 sm:space-y-6 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<button
			onclick={() => goto('/admin/users')}
			class="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition hover:opacity-80"
			style="background: var(--bg-elev-2); color: var(--text); border: 1px solid var(--border);"
		>
			<ArrowLeft class="h-4 w-4" />
			Back to Users
		</button>

		<button
			onclick={toggleUserAccess}
			disabled={togglingStatus}
			class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-60"
			style={user.isActive
				? 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border);'
				: 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border);'}
		>
			{#if user.isActive}
				<ShieldOff class="h-4 w-4" />
				Suspend User
			{:else}
				<ShieldCheck class="h-4 w-4" />
				Unblock User
			{/if}
		</button>
	</div>

	<section
		class="rounded-xl p-4 sm:p-5"
		style="background: var(--bg-elev-1); border: 1px solid var(--border);"
	>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text);">
					{user.fullName || 'Unnamed user'}
				</h1>
				<p class="mt-1 text-sm sm:text-base" style="color: var(--text-muted);">
					{user.email || 'No email'}
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
				<span
					class="rounded-full px-2.5 py-1 font-semibold"
					style={user.isActive
						? 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border);'
						: 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border);'}
				>
					{user.isActive ? 'Active' : 'Suspended'}
				</span>
				<span
					class="rounded-full px-2.5 py-1 font-semibold"
					style="background: var(--bg-elev-2); color: var(--text-muted); border: 1px solid var(--border);"
				>
					{user.userType}
				</span>
				{#if user.isAffiliateEnabled}
					<span
						class="rounded-full px-2.5 py-1 font-semibold"
						style="background: rgba(168,85,247,0.12); color: #a855f7; border: 1px solid #a855f7;"
					>
						Affiliate enabled
					</span>
				{/if}
			</div>
		</div>

		<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div
				class="rounded-lg p-3"
				style="background: var(--bg-elev-2); border: 1px solid var(--border);"
			>
				<p class="text-xs uppercase" style="color: var(--text-dim);">Orders</p>
				<p class="mt-1 text-lg font-bold" style="color: var(--text);">{stats.orderCount}</p>
			</div>
			<div
				class="rounded-lg p-3"
				style="background: var(--bg-elev-2); border: 1px solid var(--border);"
			>
				<p class="text-xs uppercase" style="color: var(--text-dim);">Paid Orders</p>
				<p class="mt-1 text-lg font-bold" style="color: var(--status-success);">
					{stats.paidOrderCount}
				</p>
			</div>
			<div
				class="rounded-lg p-3"
				style="background: var(--bg-elev-2); border: 1px solid var(--border);"
			>
				<p class="text-xs uppercase" style="color: var(--text-dim);">Total Spent</p>
				<p class="mt-1 text-lg font-bold" style="color: var(--text);">
					{formatPrice(stats.totalSpent)}
				</p>
			</div>
			<div
				class="rounded-lg p-3"
				style="background: var(--bg-elev-2); border: 1px solid var(--border);"
			>
				<p class="text-xs uppercase" style="color: var(--text-dim);">Store Credit</p>
				<p class="mt-1 text-lg font-bold" style="color: var(--text);">
					{formatPrice(user.storeCreditBalance || 0)}
				</p>
			</div>
		</div>
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div
			class="rounded-xl p-4 sm:p-5"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-base font-semibold sm:text-lg" style="color: var(--text);">Order Logs</h2>
				<ShoppingBag class="h-4 w-4" style="color: var(--text-dim);" />
			</div>
			{#if orders.length === 0}
				<p class="text-sm" style="color: var(--text-muted);">No orders for this user yet.</p>
			{:else}
				<div class="space-y-2">
					{#each orders as order}
						<div
							class="rounded-lg p-3"
							style="background: var(--bg-elev-2); border: 1px solid var(--border);"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-semibold" style="color: var(--text);">
										{order.orderNumber}
									</p>
									<p class="text-xs" style="color: var(--text-muted);">
										{formatDate(order.createdAt)}
									</p>
								</div>
								<button
									onclick={() => goto(`/admin/orders/${order.id}`)}
									class="rounded-full px-3 py-1 text-xs font-semibold"
									style="background: rgba(105,109,250,0.14); color: var(--link); border: 1px solid rgba(170,173,255,0.25);"
								>
									View
								</button>
							</div>
							<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
								<span style="color: var(--text-muted);">
									Status: {getOrderStatusLabel(order.status)}
								</span>
								<span style="color: var(--text-muted);">•</span>
								<span style="color: var(--text-muted);">
									Payment: {getOrderStatusLabel(order.paymentStatus)}
								</span>
								<span style="color: var(--text-muted);">•</span>
								<span style="color: var(--text); font-weight: 600;">
									{formatPrice(order.totalAmount)}
								</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div
			class="rounded-xl p-4 sm:p-5"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-base font-semibold sm:text-lg" style="color: var(--text);">
					Activity Timeline
				</h2>
				<Activity class="h-4 w-4" style="color: var(--text-dim);" />
			</div>
			{#if timeline.length === 0}
				<p class="text-sm" style="color: var(--text-muted);">No activity recorded yet.</p>
			{:else}
				<div class="space-y-3">
					{#each timeline as item}
						<div class="flex gap-3">
							<div
								class="mt-2 h-2.5 w-2.5 rounded-full"
								style={`background: ${getTimelineDotColor(item.type)};`}
							></div>
							<div
								class="min-w-0 flex-1 rounded-lg p-3"
								style="background: var(--bg-elev-2); border: 1px solid var(--border);"
							>
								<div class="flex flex-wrap items-center justify-between gap-2">
									<p class="text-sm font-semibold" style="color: var(--text);">{item.title}</p>
									<p class="text-xs" style="color: var(--text-dim);">{formatDate(item.at)}</p>
								</div>
								<p class="mt-1 text-xs sm:text-sm" style="color: var(--text-muted);">
									{item.description}
								</p>
								{#if item.orderId}
									<button
										onclick={() => goto(`/admin/orders/${item.orderId}`)}
										class="mt-2 inline-flex items-center gap-1 text-xs font-semibold"
										style="color: var(--link);"
									>
										<Clock3 class="h-3 w-3" />
										Open order
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<section
		class="rounded-xl p-4 sm:p-5"
		style="background: var(--bg-elev-1); border: 1px solid var(--border);"
	>
		<h2 class="mb-3 text-base font-semibold sm:text-lg" style="color: var(--text);">
			Recent Sessions
		</h2>
		{#if recentSessions.length === 0}
			<p class="text-sm" style="color: var(--text-muted);">No recent sessions found.</p>
		{:else}
			<div class="grid gap-2 sm:grid-cols-2">
				{#each recentSessions as session}
					<div
						class="rounded-lg p-3 text-xs sm:text-sm"
						style="background: var(--bg-elev-2); border: 1px solid var(--border);"
					>
						<p style="color: var(--text);">Created: {formatDate(session.createdAt)}</p>
						<p style="color: var(--text-muted);">
							Refreshed: {formatDate(session.lastRefreshedAt)}
						</p>
						<p style="color: var(--text-muted);">Expires: {formatDate(session.expiresAt)}</p>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
