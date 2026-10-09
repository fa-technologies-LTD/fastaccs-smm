<script lang="ts">
	import { onMount } from 'svelte';
	import type { RefundAnalyticsReview } from '$lib/services/refund-analytics';
	let data = $state<{
		webhooks: { id: string; status: string; attempts: number; lastError: string | null }[];
		refunds: { id: string; orderId: string; status: string; attempts: number }[];
		refundAnalytics: RefundAnalyticsReview[];
	}>({ webhooks: [], refunds: [], refundAnalytics: [] });
	const reviewLabels = {
		delivery_unknown: 'Reporting confirmation missing',
		invalid_reporting_state: 'Reporting data needs review',
		canonical_purchase_missing: 'Original purchase reporting needs review'
	};
	let loading = $state(true);
	let error = $state('');
	let busy = $state('');
	async function refresh() {
		try {
			const response = await fetch('/api/admin/payment-recovery');
			if (!response.ok) throw new Error('Could not load recovery tasks.');
			data = await response.json();
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load recovery tasks.';
		} finally {
			loading = false;
		}
	}
	async function retry(id: string) {
		busy = id;
		try {
			const response = await fetch('/api/admin/payment-recovery', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!response.ok) throw new Error('Could not queue this retry.');
			await refresh();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not queue this retry.';
		} finally {
			busy = '';
		}
	}
	onMount(() => {
		void refresh();
	});
</script>

<svelte:head><title>Payment recovery — Admin</title></svelte:head>
<section class="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
	<a href="/admin/orders" class="text-sm">← Orders</a>
	<div class="flex items-center justify-between gap-3">
		<h1 class="text-2xl font-bold">Payment recovery</h1>
		<button onclick={refresh} class="rounded-lg border px-3 py-2 text-sm">Refresh</button>
	</div>
	<p class="text-sm" style="color: var(--text-muted)">
		Retries verify the payment again. They do not release an order held for review.
	</p>
	{#if error}<p role="alert" class="text-sm text-red-400">{error}</p>{/if}
	{#if loading}<p>Loading…</p>{:else}
		<h2 class="text-lg font-semibold">Payment events</h2>
		{#each data.webhooks as item (item.id)}
			<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
				<div class="min-w-0">
					<p class="text-sm break-all">{item.id}</p>
					<p class="text-xs" style="color: var(--text-muted)">
						{item.status} · {item.attempts} attempts{item.lastError ? ` · ${item.lastError}` : ''}
					</p>
				</div>
				{#if item.status === 'quarantined'}<button
						disabled={busy !== ''}
						onclick={() => retry(item.id)}
						class="rounded-lg border px-3 py-2 text-sm"
						>{busy === item.id ? 'Queuing…' : 'Retry verification'}</button
					>{/if}
			</div>
		{:else}<p class="text-sm">No outstanding payment events.</p>{/each}
		<h2 class="text-lg font-semibold">Refund accounting</h2>
		<p class="text-sm" style="color: var(--text-muted)">
			Buyer credit is already refunded. These tasks finish reward adjustments automatically.
		</p>
		{#each data.refunds as item (item.id)}<div class="rounded-xl border p-4">
				<a href={`/admin/orders/${item.orderId}`} class="text-sm break-all">Order {item.orderId}</a>
				<p class="text-xs" style="color: var(--text-muted)">
					{item.status} · {item.attempts} attempts
				</p>
			</div>{:else}<p class="text-sm">No outstanding refund adjustments.</p>{/each}
		<h2 class="text-lg font-semibold">Refund reporting</h2>
		<p class="text-sm" style="color: var(--text-muted)">
			These refunds are already recorded. Check GA4 before resending an uncertain report.
		</p>
		{#each data.refundAnalytics as item (item.id)}
			<div class="rounded-xl border p-4">
				<a href={`/admin/orders/${item.id}`} class="text-sm break-all">Order {item.orderNumber}</a>
				<p class="text-xs" style="color: var(--text-muted)">{reviewLabels[item.reason]}</p>
			</div>
		{:else}<p class="text-sm">No refund reporting issues awaiting review.</p>{/each}
		<p class="text-xs" style="color: var(--text-muted)">
			Showing the oldest 50 outstanding tasks in each queue.
		</p>
	{/if}
</section>
