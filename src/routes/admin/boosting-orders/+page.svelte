<script lang="ts">
	import BoostingOrderSupport from '$lib/components/admin/BoostingOrderSupport.svelte';
	import ReviewOrderCard from '$lib/components/admin/ReviewOrderCard.svelte';
	import { boostReviewNotice, type BoostSupportState } from '$lib/helpers/boosting-support';
	import { untrack } from 'svelte';
	import {
		AlertTriangle,
		ChevronLeft,
		ChevronRight,
		Copy,
		ExternalLink,
		Search,
		Zap
	} from '$lib/icons';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import { getBoostingServiceConfig } from '$lib/helpers/boosting-service-config';
	import { formatPrice } from '$lib/helpers/utils';
	import { formatAdminMoney } from '$lib/helpers/admin-money';
	import { getBoostComplaintStatusLabel } from '$lib/helpers/boosting-complaint-progress';
	import {
		normalizeBoostItemStatus,
		type BoostItemStatus
	} from '$lib/helpers/boosting-admin-status';
	import type { PageData } from './$types';

	type StatusFilter =
		| 'active'
		| 'overdue'
		| 'pending'
		| 'needs_link'
		| 'in_progress'
		| 'under_review'
		| 'partial'
		| 'completed'
		| 'rejected'
		| 'cancelled'
		| 'all';
	type ItemStatus = BoostItemStatus;

	interface BoostingOrderItem {
		support?: BoostSupportState;
		id: string;
		holdReasons?: string[];
		overdueReview?: boolean;
		productName: string;
		boostTargetUrl: string;
		boostQuantity: number | null;
		boostFulfillmentStatus: string | null;
		boostProviderReference: string | null;
		boostCompletedAt: string | null;
		createdAt: string;
		latestIssue: { type: string; reason: string | null; occurredAt: string } | null;
		shadowDecision: {
			provider: string | null;
			providerServiceId: string | null;
			providerServiceName: string | null;
			quotedSupplierCostUsd: number | null;
			projectedMarginNgn: number | null;
			attention: string | null;
			checkedAt: string | null;
		} | null;
		complaints: Array<{
			id: string;
			type: string;
			status: string;
			createdAt: string;
			refillState: string | null;
			refillCheckedAt: string | null;
		}>;
		fulfillmentState: { status: string; mode: string } | null;
		progress?: {
			customerStatus: string | null;
			startCount: number | null;
			remains: number | null;
			supplierOrderId: string | null;
			rawProviderStatus: string | null;
			lastCheckedAt: string | null;
			refillDays: number | null;
		} | null;
		order: {
			status?: string;
			deliveryStatus?: string;
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
		canManageOrders?: boolean;
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
		sort: 'newest' | 'oldest';
		status: string;
		search: string;
		statusCounts: Record<string, number>;
		activeCount: number;
		overdueCount?: number;
		totalItems: number;
		canRunShadowRouting: boolean;
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
	let statusFilter = $state<StatusFilter>(
		untrack(() => (data.meta.status || 'active') as StatusFilter)
	);
	let sortOrder = $state<'newest' | 'oldest'>('newest');
	let searchDraft = $state(untrack(() => data.meta.search || ''));
	let appliedSearch = $state(untrack(() => data.meta.search || ''));
	let loading = $state(false);
	let busyItemId = $state<string | null>(null);
	let shadowRunning = $state(false);
	let expandedItemId = $state<string | null>(null);

	const activeCount = $derived(meta.activeCount || 0);

	const statusOptions = $derived([
		{ value: 'active' as const, label: 'Active', count: activeCount },
		{ value: 'overdue' as const, label: '24h review', count: meta.overdueCount || 0 },
		{ value: 'pending' as const, label: 'Pending', count: meta.statusCounts.pending || 0 },
		{
			value: 'under_review' as const,
			label: 'Needs review',
			count: meta.statusCounts.under_review || 0
		},
		{ value: 'partial' as const, label: 'Partly delivered', count: meta.statusCounts.partial || 0 },
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
		{ value: 'cancelled' as const, label: 'Cancelled', count: meta.statusCounts.cancelled || 0 },
		{ value: 'all' as const, label: 'All', count: meta.totalItems || 0 }
	]);
	async function refreshAll() {
		await loadItems(meta.page);
	}

	function getStatus(item: BoostingOrderItem): ItemStatus {
		if (item.support?.state === 'awaiting_customer') return 'needs_link';
		const status = normalizeBoostItemStatus(item.boostFulfillmentStatus);
		if (
			status === 'completed' &&
			(item.fulfillmentState?.status === 'manual_review' ||
				item.complaints?.some((complaint) => ['open', 'validated'].includes(complaint.status)))
		)
			return 'under_review';
		return status;
	}

	function getStatusLabel(status: ItemStatus): string {
		if (status === 'needs_link') return 'Needs new link';
		if (status === 'in_progress') return 'In progress';
		if (status === 'completed') return 'Completed';
		if (status === 'rejected') return 'Rejected';
		if (status === 'cancelled') return 'Cancelled';
		if (status === 'under_review') return 'Needs review';
		if (status === 'partial') return 'Partly delivered';
		return 'Pending';
	}

	function getStatusStyle(status: ItemStatus): string {
		if (status === 'completed') {
			return 'background: rgba(5,212,113,0.14); color: var(--primary); border-color: rgba(5,212,113,0.3);';
		}
		if (status === 'in_progress') {
			return 'background: rgba(59,130,246,0.14); color: #93c5fd; border-color: rgba(59,130,246,0.3);';
		}
		if (['needs_link', 'under_review', 'partial'].includes(status)) {
			return 'background: rgba(234,179,8,0.14); color: #facc15; border-color: rgba(234,179,8,0.3);';
		}
		if (status === 'rejected' || status === 'cancelled') {
			return 'background: rgba(248,113,113,0.13); color: #fca5a5; border-color: rgba(248,113,113,0.3);';
		}
		return 'background: var(--surface); color: var(--text-muted); border-color: var(--border);';
	}

	function getCustomerLabel(item: BoostingOrderItem): string {
		return (
			item.order.user?.fullName || item.order.user?.email || item.order.guestEmail || 'Unknown'
		);
	}

	function previewStatus(item: BoostingOrderItem): string {
		if (item.support?.state === 'awaiting_customer' || getStatus(item) === 'needs_link')
			return 'Waiting for link';
		return getStatusLabel(getStatus(item));
	}

	function previewNextStep(item: BoostingOrderItem): string {
		if (item.support?.state === 'awaiting_customer' || getStatus(item) === 'needs_link')
			return 'The customer needs to send a valid link.';
		if (item.support?.state === 'reply_received')
			return 'New link received. Review the customer’s reply.';
		if (item.complaints?.some((complaint) => ['open', 'validated'].includes(complaint.status)))
			return 'Customer reported a delivery issue. Open to review.';
		if (getStatus(item) === 'completed') return '';
		if (item.holdReasons?.[0]) return item.holdReasons[0];
		if (item.overdueReview) return 'Delivery is overdue for review—not confirmed failed.';
		return getStatus(item) === 'in_progress'
			? 'Supplier is processing. Delivery is not yet confirmed.'
			: '';
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
			minute: '2-digit',
			timeZone: 'Africa/Lagos'
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

	function supplierLabel(provider: string | null): string {
		if (provider === 'smm_raja') return 'SMM Raja';
		if (provider === 'bulk_follows') return 'BulkFollows';
		return 'No route';
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

	async function loadItems(nextPage = 1, requireSuccess = false) {
		if (loading) {
			if (requireSuccess) throw new Error('A list refresh is already running. Try Refresh review.');
			return;
		}
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
			if (expandedItemId && !items.some((item) => item.id === expandedItemId))
				expandedItemId = null;
		} catch (error) {
			showError(
				'Could not load boosting orders',
				error instanceof Error ? error.message : 'Try again.'
			);
			if (requireSuccess) throw error;
		} finally {
			loading = false;
		}
	}

	async function applySearch(event: SubmitEvent) {
		event.preventDefault();
		expandedItemId = null;
		appliedSearch = searchDraft.trim();
		await loadItems(1);
	}

	async function runShadowChecks(): Promise<void> {
		if (shadowRunning) return;
		shadowRunning = true;
		try {
			const response = await fetch('/api/admin/automation/boosting-shadow-route/run', {
				method: 'POST'
			});
			const payload = await response.json();
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'The route check could not run.');
			}
			if (payload.data?.status === 'skipped_overlap') {
				showError('Route check already running', 'Wait a moment, then refresh.');
				return;
			}
			const result = payload.data?.result || {};
			if (result.skipped === 'foundation_not_migrated') {
				showError('Boosting foundation not ready', 'Apply the approved migration first.');
				return;
			}
			showSuccess(
				'Route check complete',
				`${result.selected || 0} safe suggestion${result.selected === 1 ? '' : 's'} recorded. No supplier orders were placed.`
			);
			await loadItems(meta.page);
		} catch (error) {
			showError('Route check failed', error instanceof Error ? error.message : 'Try again.');
		} finally {
			shadowRunning = false;
		}
	}

	async function selectStatus(value: StatusFilter) {
		expandedItemId = null;
		statusFilter = value;
		await loadItems(1);
	}

	function refreshAdminAttentionBadges(): void {
		window.dispatchEvent(new CustomEvent('fastaccs:admin-attention-refresh'));
	}

	function complaintLabel(type: string): string {
		if (type === 'nothing_delivered') return 'Nothing delivered';
		if (type === 'delivery_stopped') return 'Delivery stopped early';
		if (type === 'dropped') return 'Drop / refill request';
		return type;
	}

	async function actOnComplaint(
		item: BoostingOrderItem,
		complaint: BoostingOrderItem['complaints'][number],
		action: 'validate' | 'reject' | 'escalate' | 'resolve'
	): Promise<void> {
		let note = '';
		if (action === 'validate' || action === 'reject') {
			const value = prompt(
				action === 'validate' ? 'Optional validation note:' : 'Why is this complaint not valid?'
			);
			if (value === null) return;
			note = value.trim();
		}
		if (action === 'escalate' && !confirm('Send the available supplier action now?')) return;
		busyItemId = item.id;
		try {
			const response = await fetch(
				`/api/admin/boosting-complaints/${encodeURIComponent(complaint.id)}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ action, note })
				}
			);
			const payload = await response.json();
			if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Action failed.');
			showSuccess('Complaint updated', payload.message || 'Saved.');
			await loadItems(meta.page);
		} catch (error) {
			showError(
				'Could not update complaint',
				error instanceof Error ? error.message : 'Try again.'
			);
		} finally {
			busyItemId = null;
		}
	}
</script>

<svelte:head>
	<title>Boosting — Orders & Analytics | Admin</title>
</svelte:head>

<div class="space-y-5">
	<header>
		<h1 class="flex items-center gap-2 text-2xl font-bold" style="color: var(--text);">
			<Zap class="h-6 w-6" style="color: var(--primary);" />
			Boosting Orders
		</h1>
		<p class="mt-1 text-sm" style="color: var(--text-muted);">
			Open an order to review it or help the customer.
		</p>
		<div class="mt-2 flex flex-wrap items-center justify-between gap-2">
			<div class="flex flex-wrap items-center gap-2">
				<a href="/admin/boosting-pricing" class="text-sm" style="color: var(--primary);"
					>Pricing →</a
				>
				<button
					type="button"
					onclick={refreshAll}
					disabled={loading}
					class="rounded-lg border px-3 py-2 text-xs"
					style="border-color: var(--border);">{loading ? 'Refreshing…' : 'Refresh'}</button
				>
				{#if meta.canRunShadowRouting}
					<button
						type="button"
						onclick={runShadowChecks}
						disabled={shadowRunning}
						class="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
						style="border-color: rgba(5,212,113,0.35); color: var(--primary);"
					>
						{shadowRunning ? 'Checking routes…' : 'Preview supplier routes'}
					</button>
				{/if}
			</div>
		</div>
	</header>
	{#if canViewRevenue}
		<p class="text-sm" style="color: var(--text-muted);">
			Sales, supplier cost and margin are in
			<a href="/admin/analytics?tab=boosting" style="color: var(--primary);">Boosting Sales</a>.
		</p>
	{/if}

	<section
		class="rounded-[var(--r-md)] border p-3 sm:p-4"
		style="border-color: var(--border); background: var(--bg-elev-1);"
	>
		<p class="mb-3 text-xs" style="color: var(--text-dim);">
			{meta.total === 0
				? 'No matching orders'
				: `Showing ${(meta.page - 1) * meta.pageSize + 1}–${Math.min(meta.page * meta.pageSize, meta.total)} of ${meta.total}`}
		</p>
		<div class="hidden flex-wrap gap-2 sm:flex">
			{#each statusOptions.filter( (option) => ['active', 'under_review', 'needs_link', 'completed', 'all'].includes(option.value) ) as option}
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
			<select
				aria-label="More order statuses"
				value={['active', 'under_review', 'needs_link', 'completed', 'all'].includes(statusFilter)
					? ''
					: statusFilter}
				onchange={(event) => {
					if (event.currentTarget.value)
						void selectStatus(event.currentTarget.value as StatusFilter);
				}}
				class="rounded-lg border px-3 py-2 text-xs"
				style="background:var(--bg);border-color:var(--border);color:var(--text-muted)"
			>
				<option value="">More statuses</option>
				{#each statusOptions.filter((option) => !['active', 'under_review', 'needs_link', 'completed', 'all'].includes(option.value)) as option}
					<option value={option.value}>{option.label} ({option.count})</option>
				{/each}
			</select>
		</div>
		<select
			aria-label="Order status"
			value={statusFilter}
			onchange={(event) => {
				void selectStatus(event.currentTarget.value as StatusFilter);
			}}
			class="w-full rounded-lg border px-3 py-2 text-sm sm:hidden"
			style="background:var(--bg);border-color:var(--border);color:var(--text)"
		>
			{#each statusOptions as option}<option value={option.value}
					>{option.label} ({option.count})</option
				>{/each}
		</select>

		<details class="queue-tools">
			<summary>Search & sort</summary>
			<div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
				<form onsubmit={applySearch} class="col-span-2 flex min-w-0 gap-2 md:col-span-1">
					<label class="relative min-w-0 flex-1">
						<Search
							size={16}
							class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
							style="color: var(--text-dim);"
						/>
						<input
							bind:value={searchDraft}
							aria-label="Search orders"
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
					<Copy size={15} /> Copy links
				</button>
			</div>
		</details>
	</section>

	<div class="order-list relative" class:opacity-60={loading} aria-busy={loading}>
		{#each items as item (item.id)}
			{@const config = getBoostingServiceConfig(item.category?.metadata)}
			{@const status = getStatus(item)}
			{@const refillDays = item.fulfillmentState
				? item.progress?.refillDays
				: config.refillAvailable
					? config.refillDays
					: null}
			<ReviewOrderCard
				id={item.id}
				title={item.productName}
				reference={item.order.orderNumber}
				status={previewStatus(item)}
				statusStyle={getStatusStyle(status)}
				metadata={`${item.boostQuantity?.toLocaleString() ?? '?'} qty · ${getCustomerLabel(item)} · ${formatAge(item.order.createdAt || item.createdAt)}`}
				nextStep={previewNextStep(item)}
				open={expandedItemId === item.id}
				onToggle={() => {
					expandedItemId = expandedItemId === item.id ? null : item.id;
				}}
			>
				<dl class="order-facts">
					<div>
						<dt>Order</dt>
						<dd>{item.order.orderNumber}</dd>
					</div>
					<div>
						<dt>Placed</dt>
						<dd>{formatDateTime(item.order.createdAt || item.createdAt)}</dd>
					</div>
					<div>
						<dt>Paid</dt>
						<dd>{item.order.paidAt ? formatDateTime(item.order.paidAt) : 'Not recorded'}</dd>
					</div>
					{#if refillDays}<div>
							<dt>Purchased cover</dt>
							<dd>{refillDays}-day refill</dd>
						</div>{/if}
				</dl>
				{#if item.progress}<p class="mt-3 text-xs" style="color: var(--text-muted);">
						{item.progress.rawProviderStatus
							? `Supplier: ${item.progress.rawProviderStatus}`
							: 'Awaiting supplier update'}
						{#if item.progress.remains !== null && item.progress.remains >= 0 && item.boostQuantity !== null && item.boostQuantity > 0}
							· {Math.max(
								0,
								Math.min(item.boostQuantity, item.boostQuantity - item.progress.remains)
							).toLocaleString()} / {item.boostQuantity.toLocaleString()} supplier-reported{/if}
						{#if item.progress.lastCheckedAt}
							· Checked {formatAge(item.progress.lastCheckedAt)}{/if}
					</p>{/if}

				{#if item.latestIssue?.reason && ['needs_link', 'rejected'].includes(status) && !['awaiting_customer', 'reply_received'].includes(item.support?.state ?? '')}
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

				{#if item.complaints?.length}
					<div class="mt-3 space-y-2">
						{#each item.complaints as complaint (complaint.id)}
							<div
								class="rounded-lg border p-3"
								style="border-color: rgba(248,113,113,.32); background: rgba(248,113,113,.06);"
							>
								<div class="flex flex-wrap items-center justify-between gap-2">
									<p class="text-sm font-semibold" style="color: var(--text);">
										Customer report: {complaintLabel(complaint.type)}
									</p>
									<span class="text-[11px] uppercase" style="color: #fca5a5;"
										>{getBoostComplaintStatusLabel(complaint)}</span
									>
								</div>
								<div class="mt-2 flex flex-wrap gap-2">
									{#if complaint.status === 'open'}<button
											type="button"
											onclick={() => actOnComplaint(item, complaint, 'validate')}
											class="rounded-md border px-2.5 py-1 text-xs"
											style="border-color: var(--border); color: var(--text);">Valid</button
										><button
											type="button"
											onclick={() => actOnComplaint(item, complaint, 'reject')}
											class="rounded-md border px-2.5 py-1 text-xs"
											style="border-color: var(--border); color: var(--text-muted);"
											>Not valid</button
										>{/if}
									{#if complaint.status === 'validated'}<button
											type="button"
											onclick={() => actOnComplaint(item, complaint, 'escalate')}
											class="rounded-md px-2.5 py-1 text-xs font-semibold"
											style="background: var(--primary); color: #00150b;"
											>Escalate to supplier</button
										>{/if}
									{#if complaint.status === 'escalating' || complaint.status === 'escalation_unknown'}<p
											class="text-xs"
											style="color: #fbbf24;"
										>
											Supplier response uncertain — check its panel before doing anything else.
										</p>{/if}
									{#if complaint.status === 'escalated' || complaint.status === 'escalation_unknown'}<button
											type="button"
											onclick={() => actOnComplaint(item, complaint, 'resolve')}
											class="rounded-md border px-2.5 py-1 text-xs"
											style="border-color: var(--border); color: var(--text);">Mark resolved</button
										>{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if item.holdReasons?.length && !['awaiting_customer', 'reply_received'].includes(item.support?.state ?? '')}
					<section
						class="mt-3 rounded-lg border p-3"
						style="border-color: rgba(234,179,8,.3); background: rgba(234,179,8,.06);"
						aria-label="Why this order needs review"
					>
						<p class="text-sm font-bold" style="color: #facc15;">Why this order needs review</p>
						<ul class="mt-2 list-disc pl-5 text-sm" style="color: var(--text-muted);">
							{#each item.holdReasons as reason}<li>{reason}</li>{/each}
						</ul>
						<p class="mt-2 text-xs" style="color: var(--text-dim);">
							These are recorded checks, not a fresh supplier status. Review delivery and charges
							before resolving the order.
						</p>
					</section>
				{/if}
				{#if item.shadowDecision}
					<details
						class="mt-3 rounded-lg border p-3"
						style={item.shadowDecision.provider
							? 'border-color: rgba(5,212,113,0.28); background: rgba(5,212,113,0.06);'
							: 'border-color: rgba(234,179,8,0.28); background: rgba(234,179,8,0.06);'}
					>
						<summary class="cursor-pointer text-xs font-semibold" style="color:var(--text-muted)"
							>Supplier details</summary
						>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-xs font-bold" style="color: var(--text);">
								{item.fulfillmentState?.mode === 'shadow' ? 'Shadow suggestion' : 'Supplier record'}
							</p>
							<span class="text-[10px] font-semibold" style="color: var(--text-dim);"
								>{item.fulfillmentState?.mode === 'shadow'
									? 'No supplier order placed'
									: `${item.fulfillmentState?.mode || 'automation'} · ${item.fulfillmentState?.status || 'processing'}`}</span
							>
						</div>
						{#if item.shadowDecision.provider}
							<p class="mt-1 text-sm" style="color: var(--text-muted);">
								{supplierLabel(item.shadowDecision.provider)} #{item.shadowDecision
									.providerServiceId} ·
								{item.shadowDecision.providerServiceName}
							</p>
							{#if canViewRevenue}
								<p class="mt-1 text-xs" style="color: var(--text-dim);">
									${item.shadowDecision.quotedSupplierCostUsd?.toFixed(4) ?? '—'} estimated cost ·
									{formatMonetaryAmount(item.shadowDecision.projectedMarginNgn ?? 0)} projected margin
								</p>
							{/if}
						{:else if !item.holdReasons?.length}
							<p class="mt-1 text-sm" style="color: #facc15;">
								No supplier submission is recorded. Review this order’s history.
							</p>
						{/if}
					</details>
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
							>{item.progress?.supplierOrderId || item.boostProviderReference || 'Not added'}</span
						>
					</p>
					<div class="flex flex-wrap gap-2">
						{#if item.overdueReview && !item.holdReasons?.length && !['awaiting_customer', 'reply_received'].includes(item.support?.state ?? '')}
							<p
								class="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300"
							>
								{boostReviewNotice(item.shadowDecision?.attention)}
							</p>
						{/if}
						<button
							type="button"
							onclick={() =>
								copyToClipboard(
									item.progress?.supplierOrderId || item.boostProviderReference || ''
								)}
							disabled={busyItemId === item.id ||
								!(item.progress?.supplierOrderId || item.boostProviderReference)}
							class="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
							style="border-color: var(--border); color: var(--text);">Copy supplier ref</button
						>
					</div>
				</div>
				<BoostingOrderSupport
					itemId={item.id}
					orderId={item.order.id}
					productName={item.productName}
					status={item.boostFulfillmentStatus === 'refunded' ? 'refunded' : status}
					quantity={item.boostQuantity ?? 1}
					support={item.support}
					held={item.fulfillmentState?.status === 'manual_review' ||
						(item.fulfillmentState?.status === 'completed' &&
							item.complaints.some((complaint) =>
								['open', 'validated'].includes(complaint.status)
							)) ||
						(!item.fulfillmentState &&
							(status !== 'completed' || item.order.deliveryStatus !== 'delivered'))}
					canManage={meta.canManageOrders === true}
					canRequestLink={item.fulfillmentState?.status !== 'completed' && status !== 'completed'}
					onUpdated={async () => {
						await loadItems(meta.page, true);
						refreshAdminAttentionBadges();
					}}
				/>
			</ReviewOrderCard>
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

<style>
	.order-list {
		display: grid;
		gap: 20px;
	}
	.queue-tools {
		margin-top: 12px;
	}
	.queue-tools > summary {
		cursor: pointer;
		padding: 4px 0;
		font-size: 12px;
		color: var(--text-muted);
	}
	.order-facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
		font-size: 12px;
	}
	.order-facts dt {
		color: var(--text-dim);
		margin-bottom: 4px;
	}
	.order-facts dd {
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	@media (min-width: 768px) {
		.order-facts {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
