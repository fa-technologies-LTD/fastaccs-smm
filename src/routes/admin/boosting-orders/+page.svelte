<script lang="ts">
	import { untrack } from 'svelte';
	import {
		AlertTriangle,
		Calendar,
		ChevronLeft,
		ChevronRight,
		Copy,
		DollarSign,
		ExternalLink,
		Search,
		ShoppingCart,
		Zap
	} from '$lib/icons';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import OrderTypeTabs from '$lib/components/admin/OrderTypeTabs.svelte';
	import { getBoostingServiceConfig } from '$lib/helpers/boosting-service-config';
	import { formatPrice } from '$lib/helpers/utils';
	import { formatAdminMoney } from '$lib/helpers/admin-money';
	import type { PageData } from './$types';

	type StatusFilter =
		| 'active'
		| 'pending'
		| 'needs_link'
		| 'in_progress'
		| 'completed'
		| 'rejected'
		| 'all';
	type ItemStatus = 'pending' | 'needs_link' | 'in_progress' | 'completed' | 'rejected';

	interface BoostingOrderItem {
		id: string;
		productName: string;
		boostTargetUrl: string;
		boostQuantity: number | null;
		boostFulfillmentStatus: string | null;
		boostProviderReference: string | null;
		boostCompletedAt: string | null;
		createdAt: string;
		latestIssue: { type: string; reason: string | null; occurredAt: string } | null;
		order: {
			id: string;
			orderNumber: string;
			guestEmail: string | null;
			createdAt: string;
			paidAt: string | null;
			user: { email: string | null; fullName: string | null } | null;
		};
		category: { metadata: unknown } | null;
	}

	interface ListMeta {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
		sort: 'newest' | 'oldest';
		status: string;
		search: string;
		statusCounts: Record<string, number>;
	}

	let { data }: { data: PageData } = $props();
	const canViewRevenue = $derived(Boolean((data as { canViewRevenue?: boolean }).canViewRevenue));
	function formatMonetaryAmount(amount: number): string {
		return formatAdminMoney(amount, {
			canView: canViewRevenue,
			hideMonetaryAmounts: false,
			format: formatPrice
		});
	}

	$effect(() => {
		if (data.error) showError('Failed to load boosting orders', data.error);
	});

	let items = $state<BoostingOrderItem[]>(untrack(() => data.items));
	let meta = $state<ListMeta>(untrack(() => data.meta as ListMeta));
	let stats = $state(untrack(() => data.stats));
	let statusFilter = $state<StatusFilter>('active');
	let sortOrder = $state<'newest' | 'oldest'>('newest');
	let searchDraft = $state('');
	let appliedSearch = $state('');
	let loading = $state(false);
	let busyItemId = $state<string | null>(null);

	const activeCount = $derived(
		(meta.statusCounts.pending || 0) +
			(meta.statusCounts.needs_link || 0) +
			(meta.statusCounts.in_progress || 0)
	);

	const statusOptions = $derived([
		{ value: 'active' as const, label: 'Active', count: activeCount },
		{ value: 'pending' as const, label: 'Pending', count: meta.statusCounts.pending || 0 },
		{
			value: 'needs_link' as const,
			label: 'Needs link',
			count: meta.statusCounts.needs_link || 0
		},
		{
			value: 'in_progress' as const,
			label: 'In progress',
			count: meta.statusCounts.in_progress || 0
		},
		{
			value: 'completed' as const,
			label: 'Completed',
			count: meta.statusCounts.completed || 0
		},
		{ value: 'rejected' as const, label: 'Rejected', count: meta.statusCounts.rejected || 0 },
		{ value: 'all' as const, label: 'All', count: stats.total_orders || 0 }
	]);

	function getStatus(item: BoostingOrderItem): ItemStatus {
		const value = item.boostFulfillmentStatus || 'pending';
		return ['pending', 'needs_link', 'in_progress', 'completed', 'rejected'].includes(value)
			? (value as ItemStatus)
			: 'pending';
	}

	function getStatusLabel(status: ItemStatus): string {
		if (status === 'needs_link') return 'Needs new link';
		if (status === 'in_progress') return 'In progress';
		if (status === 'completed') return 'Completed';
		if (status === 'rejected') return 'Rejected';
		return 'Pending';
	}

	function getStatusStyle(status: ItemStatus): string {
		if (status === 'completed') {
			return 'background: rgba(5,212,113,0.14); color: var(--primary); border-color: rgba(5,212,113,0.3);';
		}
		if (status === 'in_progress') {
			return 'background: rgba(59,130,246,0.14); color: #93c5fd; border-color: rgba(59,130,246,0.3);';
		}
		if (status === 'needs_link') {
			return 'background: rgba(234,179,8,0.14); color: #facc15; border-color: rgba(234,179,8,0.3);';
		}
		if (status === 'rejected') {
			return 'background: rgba(248,113,113,0.13); color: #fca5a5; border-color: rgba(248,113,113,0.3);';
		}
		return 'background: var(--surface); color: var(--text-muted); border-color: var(--border);';
	}

	function getCustomerLabel(item: BoostingOrderItem): string {
		return (
			item.order.user?.fullName || item.order.user?.email || item.order.guestEmail || 'Unknown'
		);
	}

	function formatDateTime(value: string | null | undefined): string {
		if (!value) return 'Unknown time';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown time';
		return date.toLocaleString('en-NG', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatAge(value: string): string {
		const milliseconds = Date.now() - new Date(value).getTime();
		if (!Number.isFinite(milliseconds) || milliseconds < 0) return '';
		const minutes = Math.floor(milliseconds / 60_000);
		if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	function copyToClipboard(text: string, message = 'Copied') {
		navigator.clipboard
			.writeText(text)
			.then(() => showSuccess(message, ''))
			.catch(() => showError('Copy failed', 'Could not copy to clipboard'));
	}

	function copyVisibleLinks() {
		if (items.length === 0) return;
		copyToClipboard(
			items.map((item) => item.boostTargetUrl).join('\n'),
			`${items.length} visible link${items.length === 1 ? '' : 's'} copied`
		);
	}

	async function loadItems(nextPage = 1) {
		if (loading) return;
		loading = true;
		try {
			const params = new URLSearchParams({
				status: statusFilter,
				sort: sortOrder,
				page: String(nextPage),
				pageSize: String(meta.pageSize || 25)
			});
			if (appliedSearch) params.set('q', appliedSearch);
			const response = await fetch(`/api/admin/boosting-orders?${params.toString()}`);
			const result = await response.json();
			if (!response.ok || !result.success) throw new Error(result.error || 'Failed to load orders');
			items = result.data || [];
			meta = result.meta;
		} catch (error) {
			showError(
				'Could not load boosting orders',
				error instanceof Error ? error.message : 'Try again.'
			);
		} finally {
			loading = false;
		}
	}

	async function applySearch(event: SubmitEvent) {
		event.preventDefault();
		appliedSearch = searchDraft.trim();
		await loadItems(1);
	}

	async function selectStatus(value: StatusFilter) {
		statusFilter = value;
		await loadItems(1);
	}

	function refreshAdminAttentionBadges(): void {
		window.dispatchEvent(new CustomEvent('fastaccs:admin-attention-refresh'));
	}

	async function updateItem(item: BoostingOrderItem, status: ItemStatus) {
		let reason = '';
		if (status === 'needs_link') {
			const response = prompt('What should the customer correct about this link?');
			if (response === null) return;
			reason = response.trim();
		}
		if (status === 'rejected') {
			const response = prompt(
				'Tell the customer why this cannot be fulfilled. This does not refund the paid order automatically.'
			);
			if (response === null) return;
			reason = response.trim();
			if (
				!confirm(
					'Mark this boost as rejected? You must separately refund or reopen the paid order.'
				)
			) {
				return;
			}
		}

		busyItemId = item.id;
		try {
			const response = await fetch(`/api/admin/boosting-orders/${encodeURIComponent(item.id)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status, reason })
			});
			const result = await response.json();
			if (!response.ok || result.error) throw new Error(result.error || 'Failed to update');
			showSuccess(status === 'needs_link' ? 'Customer notified' : 'Order updated', '');
			await loadItems(meta.page);
			refreshAdminAttentionBadges();
		} catch (error) {
			showError('Update failed', error instanceof Error ? error.message : 'Please try again.');
		} finally {
			busyItemId = null;
		}
	}

	async function updateProviderReference(item: BoostingOrderItem) {
		const value = prompt('Supplier order/reference ID:', item.boostProviderReference || '');
		if (value === null) return;
		busyItemId = item.id;
		try {
			const response = await fetch(`/api/admin/boosting-orders/${encodeURIComponent(item.id)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ providerReference: value })
			});
			const result = await response.json();
			if (!response.ok || result.error) throw new Error(result.error || 'Failed to save reference');
			items = items.map((row) =>
				row.id === item.id
					? { ...row, boostProviderReference: result.data.boostProviderReference }
					: row
			);
			showSuccess('Supplier reference saved', '');
		} catch (error) {
			showError('Could not save reference', error instanceof Error ? error.message : 'Try again.');
		} finally {
			busyItemId = null;
		}
	}
</script>

<svelte:head>
	<title>Boosting Orders | Admin</title>
</svelte:head>

<div class="space-y-5">
	<header>
		<h1 class="flex items-center gap-2 text-2xl font-bold" style="color: var(--text);">
			<Zap class="h-6 w-6" style="color: var(--primary);" />
			Boosting Orders
		</h1>
		<p class="mt-1 text-sm" style="color: var(--text-muted);">
			Newest work first. Review the link, place it with your supplier, and record progress.
		</p>
		<div class="mt-2"><OrderTypeTabs active="boosting" /></div>
	</header>

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
		<div
			class="rounded-[var(--r-md)] border p-4"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center gap-2 text-xs font-medium" style="color: var(--text-muted);">
				<DollarSign size={16} /> Lifetime net sales
			</div>
			<p class="mt-1 text-xl font-bold" style="color: var(--text);">
				{formatMonetaryAmount(stats.total_revenue)}
			</p>
		</div>
		<div
			class="rounded-[var(--r-md)] border p-4"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center gap-2 text-xs font-medium" style="color: var(--text-muted);">
				<DollarSign size={16} /> This month
			</div>
			<p class="mt-1 text-xl font-bold" style="color: var(--text);">
				{formatMonetaryAmount(stats.this_month_revenue)}
			</p>
		</div>
		<div
			class="rounded-[var(--r-md)] border p-4"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<div class="flex items-center gap-2 text-xs font-medium" style="color: var(--text-muted);">
				<ShoppingCart size={16} /> Paid orders
			</div>
			<p class="mt-1 text-xl font-bold" style="color: var(--text);">{stats.total_orders}</p>
		</div>
	</div>

	<section
		class="rounded-[var(--r-md)] border p-3 sm:p-4"
		style="border-color: var(--border); background: var(--bg-elev-1);"
	>
		<div class="flex flex-wrap gap-2">
			{#each statusOptions as option}
				<button
					type="button"
					onclick={() => selectStatus(option.value)}
					class="rounded-lg border px-3 py-2 text-xs font-semibold sm:text-sm"
					style={statusFilter === option.value
						? 'background: rgba(5,212,113,0.14); border-color: rgba(5,212,113,0.38); color: var(--primary);'
						: 'background: var(--surface); border-color: var(--border); color: var(--text-muted);'}
				>
					{option.label} <span class="opacity-70">{option.count}</span>
				</button>
			{/each}
		</div>

		<div class="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
			<form onsubmit={applySearch} class="flex min-w-0 gap-2">
				<label class="relative min-w-0 flex-1">
					<Search
						size={16}
						class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
						style="color: var(--text-dim);"
					/>
					<input
						bind:value={searchDraft}
						placeholder="Order, customer, service or link"
						class="w-full rounded-lg border py-2 pr-3 pl-9 text-sm"
						style="background: var(--bg); border-color: var(--border); color: var(--text);"
					/>
				</label>
				<button
					type="submit"
					class="rounded-lg border px-3 py-2 text-sm font-semibold"
					style="border-color: var(--border); color: var(--text);">Search</button
				>
			</form>
			<select
				bind:value={sortOrder}
				onchange={() => loadItems(1)}
				class="rounded-lg border px-3 py-2 text-sm"
				style="background: var(--bg); border-color: var(--border); color: var(--text);"
				aria-label="Order sort"
			>
				<option value="newest">Newest first</option>
				<option value="oldest">Oldest first</option>
			</select>
			<button
				type="button"
				onclick={copyVisibleLinks}
				disabled={items.length === 0}
				class="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
				style="border-color: var(--border); color: var(--text);"
			>
				<Copy size={15} /> Copy visible
			</button>
		</div>
		<p class="mt-2 text-xs" style="color: var(--text-dim);">
			{meta.total === 0
				? 'No matching orders'
				: `Showing ${(meta.page - 1) * meta.pageSize + 1}–${Math.min(meta.page * meta.pageSize, meta.total)} of ${meta.total}`}
		</p>
	</section>

	<div class="relative space-y-3" class:opacity-60={loading}>
		{#each items as item (item.id)}
			{@const config = getBoostingServiceConfig(item.category?.metadata)}
			{@const status = getStatus(item)}
			<article
				class="rounded-[var(--r-md)] border p-4"
				style="border-color: var(--border); background: var(--bg-elev-1);"
			>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="font-semibold" style="color: var(--text);">{item.productName}</h2>
							<span
								class="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
								style={getStatusStyle(status)}>{getStatusLabel(status)}</span
							>
							{#if config.refillAvailable}
								<span class="text-[11px]" style="color: var(--text-dim);"
									>{config.refillDays}-day refill</span
								>
							{/if}
						</div>
						<p class="mt-1 text-sm" style="color: var(--text-muted);">
							{item.boostQuantity?.toLocaleString() ?? '?'} quantity · {item.order.orderNumber} · {getCustomerLabel(
								item
							)}
						</p>
					</div>
					<div class="shrink-0 text-left sm:text-right">
						<p
							class="inline-flex items-center gap-1 text-xs font-medium"
							style="color: var(--text-muted);"
						>
							<Calendar size={14} /> Placed {formatAge(item.order.createdAt || item.createdAt)}
						</p>
						<p class="mt-0.5 text-xs" style="color: var(--text-dim);">
							{formatDateTime(item.order.createdAt || item.createdAt)}
						</p>
						{#if item.order.paidAt}<p class="mt-0.5 text-[11px]" style="color: var(--text-dim);">
								Paid {formatDateTime(item.order.paidAt)}
							</p>{/if}
					</div>
				</div>

				{#if item.latestIssue?.reason && ['needs_link', 'rejected'].includes(status)}
					<div
						class="mt-3 flex gap-2 rounded-lg border p-3 text-sm"
						style={status === 'rejected'
							? 'border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.07); color: var(--text-muted);'
							: 'border-color: rgba(234,179,8,0.3); background: rgba(234,179,8,0.07); color: var(--text-muted);'}
					>
						<AlertTriangle size={17} class="mt-0.5 shrink-0" />
						<div>
							<p>{item.latestIssue.reason}</p>
							{#if status === 'rejected'}<p
									class="mt-1 text-xs font-semibold"
									style="color: #fca5a5;"
								>
									Payment remains paid. Reopen it or refund from the order page.
								</p>{/if}
						</div>
					</div>
				{/if}

				<div
					class="mt-3 flex min-w-0 items-center gap-2 rounded-lg border p-2.5"
					style="border-color: var(--border); background: var(--bg);"
				>
					<a
						href={item.boostTargetUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="min-w-0 flex-1 truncate text-sm underline"
						style="color: var(--link);">{item.boostTargetUrl}</a
					>
					<button
						type="button"
						onclick={() => copyToClipboard(item.boostTargetUrl)}
						class="rounded-md border p-1.5"
						style="border-color: var(--border); color: var(--text);"
						title="Copy link"><Copy size={14} /></button
					>
					<a
						href={item.boostTargetUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="rounded-md border p-1.5"
						style="border-color: var(--border); color: var(--text);"
						title="Open link"><ExternalLink size={14} /></a
					>
				</div>

				<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
					<p class="text-xs" style="color: var(--text-dim);">
						Supplier ref: <span style="color: var(--text-muted);"
							>{item.boostProviderReference || 'Not added'}</span
						>
					</p>
					<div class="flex flex-wrap gap-2">
						<a
							href={`/admin/orders/${item.order.id}`}
							class="rounded-lg border px-3 py-1.5 text-xs font-semibold"
							style="border-color: var(--border); color: var(--text);">View order</a
						>
						<button
							type="button"
							onclick={() => updateProviderReference(item)}
							disabled={busyItemId === item.id}
							class="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
							style="border-color: var(--border); color: var(--text);">Supplier ref</button
						>
						{#if status === 'pending'}
							<button
								type="button"
								onclick={() => updateItem(item, 'in_progress')}
								disabled={busyItemId === item.id}
								class="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
								style="background: var(--primary); color: #00150b;">Start</button
							>
						{:else if status === 'in_progress'}
							<button
								type="button"
								onclick={() => updateItem(item, 'completed')}
								disabled={busyItemId === item.id}
								class="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
								style="background: var(--primary); color: #00150b;">Complete</button
							>
						{:else}
							<button
								type="button"
								onclick={() => updateItem(item, status === 'completed' ? 'in_progress' : 'pending')}
								disabled={busyItemId === item.id}
								class="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
								style="border-color: var(--border); color: var(--text);">Reopen</button
							>
						{/if}
						{#if !['completed', 'rejected'].includes(status)}
							<button
								type="button"
								onclick={() => updateItem(item, 'needs_link')}
								disabled={busyItemId === item.id}
								class="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
								style="border-color: rgba(234,179,8,0.35); color: #facc15;">Request link</button
							>
							<button
								type="button"
								onclick={() => updateItem(item, 'rejected')}
								disabled={busyItemId === item.id}
								class="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
								style="border-color: rgba(248,113,113,0.35); color: #fca5a5;">Can't fulfill</button
							>
						{/if}
					</div>
				</div>
			</article>
		{/each}

		{#if items.length === 0 && !loading}
			<div
				class="rounded-[var(--r-md)] border p-10 text-center"
				style="border-color: var(--border); background: var(--bg-elev-1);"
			>
				<p class="font-semibold" style="color: var(--text);">Nothing needs attention here.</p>
				<p class="mt-1 text-sm" style="color: var(--text-muted);">
					Try another status or clear your search.
				</p>
			</div>
		{/if}
	</div>

	{#if meta.totalPages > 1}
		<nav
			class="flex items-center justify-between rounded-lg border p-3"
			style="border-color: var(--border); background: var(--bg-elev-1);"
			aria-label="Boosting order pages"
		>
			<button
				type="button"
				onclick={() => loadItems(meta.page - 1)}
				disabled={meta.page <= 1 || loading}
				class="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
				style="border-color: var(--border); color: var(--text);"
				><ChevronLeft size={16} /> Previous</button
			>
			<span class="text-sm" style="color: var(--text-muted);"
				>Page {meta.page} of {meta.totalPages}</span
			>
			<button
				type="button"
				onclick={() => loadItems(meta.page + 1)}
				disabled={meta.page >= meta.totalPages || loading}
				class="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
				style="border-color: var(--border); color: var(--text);"
				>Next <ChevronRight size={16} /></button
			>
		</nav>
	{/if}
</div>
