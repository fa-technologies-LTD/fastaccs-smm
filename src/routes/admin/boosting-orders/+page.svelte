<script lang="ts">
	import { Copy, Zap, ExternalLink } from '$lib/icons';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import { getBoostingServiceConfig } from '$lib/helpers/boosting-service-config';
	import type { PageData } from './$types';

	interface BoostingOrderItem {
		id: string;
		productName: string;
		boostTargetUrl: string;
		boostQuantity: number | null;
		boostFulfillmentStatus: string | null;
		boostProviderReference: string | null;
		boostCompletedAt: string | null;
		createdAt: string;
		order: {
			id: string;
			orderNumber: string;
			guestEmail: string | null;
			user: { email: string | null; fullName: string | null } | null;
		};
		category: { metadata: unknown } | null;
	}

	let { data }: { data: PageData } = $props();

	if (data.error) {
		showError('Failed to load boosting orders', data.error);
	}

	let items = $state<BoostingOrderItem[]>(data.items);
	let statusFilter = $state<'pending' | 'in_progress' | 'completed' | 'all'>('pending');
	let busyItemId = $state<string | null>(null);

	const visibleItems = $derived.by(() => {
		if (statusFilter === 'all') return items;
		return items.filter((item) => (item.boostFulfillmentStatus || 'pending') === statusFilter);
	});

	const groupedByService = $derived.by(() => {
		const groups = new Map<string, BoostingOrderItem[]>();
		for (const item of visibleItems) {
			const existing = groups.get(item.productName) || [];
			existing.push(item);
			groups.set(item.productName, existing);
		}
		return Array.from(groups.entries());
	});

	const pendingCount = $derived(
		items.filter((item) => (item.boostFulfillmentStatus || 'pending') === 'pending').length
	);
	const inProgressCount = $derived(
		items.filter((item) => item.boostFulfillmentStatus === 'in_progress').length
	);
	const completedCount = $derived(
		items.filter((item) => item.boostFulfillmentStatus === 'completed').length
	);

	function getCustomerLabel(item: BoostingOrderItem): string {
		return item.order.user?.fullName || item.order.user?.email || item.order.guestEmail || 'Unknown';
	}

	function copyToClipboard(text: string, message = 'Copied to clipboard!') {
		navigator.clipboard
			.writeText(text)
			.then(() => showSuccess(message, ''))
			.catch(() => showError('Copy failed', 'Could not copy to clipboard'));
	}

	function copyAllLinks(serviceItems: BoostingOrderItem[]) {
		const links = serviceItems.map((item) => item.boostTargetUrl).join('\n');
		copyToClipboard(links, `${serviceItems.length} link${serviceItems.length === 1 ? '' : 's'} copied!`);
	}

	async function updateItem(itemId: string, status: string) {
		busyItemId = itemId;
		try {
			const response = await fetch(`/api/admin/boosting-orders/${encodeURIComponent(itemId)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status })
			});
			const result = await response.json();
			if (!response.ok || result.error) {
				throw new Error(result.error || 'Failed to update');
			}
			items = items.map((item) =>
				item.id === itemId
					? {
							...item,
							boostFulfillmentStatus: result.data.boostFulfillmentStatus,
							boostCompletedAt: result.data.boostCompletedAt
						}
					: item
			);
			showSuccess('Updated', '');
		} catch (error) {
			console.error('Failed to update boosting order:', error);
			showError('Update failed', error instanceof Error ? error.message : 'Please try again.');
		} finally {
			busyItemId = null;
		}
	}
</script>

<svelte:head>
	<title>Boosting Orders | Admin</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="flex items-center gap-2 text-2xl font-bold" style="color: var(--text);">
			<Zap class="h-6 w-6" style="color: var(--primary);" />
			Boosting Orders
		</h1>
		<p class="mt-1 text-sm" style="color: var(--text-muted);">
			Copy all links for a service at once, place them with your supplier, then mark each order
			in progress and completed.
		</p>
	</div>

	<div class="flex gap-2">
		{#each [['pending', `Pending (${pendingCount})`], ['in_progress', `In Progress (${inProgressCount})`], ['completed', `Completed (${completedCount})`], ['all', 'All']] as [value, label]}
			<button
				onclick={() => (statusFilter = value as typeof statusFilter)}
				class="rounded-full px-3 py-1.5 text-sm font-medium"
				style={statusFilter === value
					? 'background: var(--primary); color: #000;'
					: 'background: var(--surface); color: var(--text-muted); border: 1px solid var(--border);'}
			>
				{label}
			</button>
		{/each}
	</div>

	<div class="space-y-6">
		{#each groupedByService as [serviceName, serviceItems] (serviceName)}
			<div class="rounded-[var(--r-md)] border" style="border-color: var(--border); background: var(--bg-elev-1);">
				<div
					class="flex flex-wrap items-center justify-between gap-3 border-b p-4"
					style="border-color: var(--border);"
				>
					<div>
						<span class="font-semibold" style="color: var(--text);">{serviceName}</span>
						<span class="ml-2 text-xs" style="color: var(--text-muted);"
							>{serviceItems.length} order{serviceItems.length === 1 ? '' : 's'}</span
						>
					</div>
					<button
						onclick={() => copyAllLinks(serviceItems)}
						class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
						style="background: var(--primary); color: #000;"
					>
						<Copy size={14} />
						Copy All Links
					</button>
				</div>

				<div class="divide-y" style="border-color: var(--border);">
					{#each serviceItems as item (item.id)}
						{@const config = getBoostingServiceConfig(item.category?.metadata)}
						{@const status = item.boostFulfillmentStatus || 'pending'}
						<div class="flex flex-wrap items-start justify-between gap-3 p-4">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span
										class="rounded-full px-2 py-0.5 text-xs font-medium"
										style={status === 'completed'
											? 'background: rgba(5,212,113,0.15); color: var(--primary);'
											: status === 'in_progress'
												? 'background: rgba(234,179,8,0.15); color: #eab308;'
												: 'background: var(--surface); color: var(--text-muted);'}
									>
										{status === 'in_progress' ? 'In Progress' : status === 'completed' ? 'Completed' : 'Pending'}
									</span>
									{#if config.refillAvailable}
										<span class="text-xs" style="color: var(--text-dim);">{config.refillDays}-day refill</span>
									{/if}
								</div>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									{item.boostQuantity?.toLocaleString() ?? '?'} qty · Order {item.order.orderNumber} ·
									{getCustomerLabel(item)}
								</p>
								<div class="mt-2 flex items-center gap-2">
									<a
										href={item.boostTargetUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="truncate text-sm underline"
										style="color: var(--link); max-width: 28rem;"
									>
										{item.boostTargetUrl}
									</a>
									<button
										onclick={() => copyToClipboard(item.boostTargetUrl)}
										class="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium"
										style="background: var(--surface); color: var(--text); border: 1px solid var(--border);"
										title="Copy link"
									>
										<Copy size={12} />
										Copy
									</button>
									<a
										href={item.boostTargetUrl}
										target="_blank"
										rel="noopener noreferrer"
										style="color: var(--text-dim);"
										title="Open link"
									>
										<ExternalLink size={14} />
									</a>
								</div>
							</div>

							<div class="flex gap-2">
								{#if status === 'pending'}
									<button
										onclick={() => updateItem(item.id, 'in_progress')}
										disabled={busyItemId === item.id}
										class="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
										style="background: var(--primary); color: #000;"
									>
										Start
									</button>
								{:else if status === 'in_progress'}
									<button
										onclick={() => updateItem(item.id, 'completed')}
										disabled={busyItemId === item.id}
										class="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
										style="background: var(--primary); color: #000;"
									>
										Mark Complete
									</button>
								{:else}
									<button
										onclick={() => updateItem(item.id, 'in_progress')}
										disabled={busyItemId === item.id}
										class="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
										style="background: var(--surface); color: var(--text); border: 1px solid var(--border);"
									>
										Reopen
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}

		{#if groupedByService.length === 0}
			<div
				class="rounded-[var(--r-md)] border p-8 text-center"
				style="border-color: var(--border); background: var(--bg-elev-1);"
			>
				<p style="color: var(--text-muted);">No {statusFilter === 'all' ? '' : statusFilter} boosting orders.</p>
			</div>
		{/if}
	</div>
</div>
