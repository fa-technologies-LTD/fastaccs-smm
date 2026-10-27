<script lang="ts">
	import type { PageData } from './$types';
	import OrderStageChip from '$lib/components/OrderStageChip.svelte';
	import { getOrderStage } from '$lib/helpers/order-stage';

	let { data }: { data: PageData } = $props();

	function ngn(n: number | null): string {
		return n === null ? '—' : '₦' + Math.round(n).toLocaleString();
	}
	function providerLabel(provider: string): string {
		return provider === 'pvapins' ? 'PVAPins' : provider === 'hubman' ? 'Hubman' : provider;
	}
	function attemptCost(attempt: (typeof data.rows)[number]['attempts'][number]): string | null {
		const cost = attempt.actualCostUsd ?? attempt.expectedCostUsd;
		return cost == null ? null : `$${cost.toFixed(2)}`;
	}
	function pageHref(page: number): string {
		const parts = [
			data.search ? `q=${encodeURIComponent(data.search)}` : '',
			page > 1 ? `page=${page}` : ''
		].filter(Boolean);
		return `/admin/numbers/orders${parts.length ? `?${parts.join('&')}` : ''}`;
	}
</script>

<svelte:head><title>Numbers Orders - Admin Panel</title></svelte:head>

<div class="space-y-4">
	<div>
		<h1 class="text-2xl font-bold" style="color: var(--text);">Numbers Orders</h1>
		<p class="mt-1 text-sm" style="color: var(--text-muted);">
			Every number bought, newest first, with the supplier attempts behind it.
		</p>
	</div>

	<form method="GET" class="flex flex-wrap gap-2" role="search">
		<label class="sr-only" for="numbers-orders-search">Search Numbers Orders</label>
		<input
			id="numbers-orders-search"
			name="q"
			type="search"
			value={data.search}
			placeholder="Search number, order number, buyer email or app"
			class="min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm"
			style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
		/>
		<button
			type="submit"
			class="rounded-full px-4 py-1.5 text-sm font-semibold"
			style="background: var(--surface); border: 1px solid var(--border); color: var(--text);"
			>Search</button
		>
	</form>

	<p class="text-xs" style="color: var(--text-muted);">
		{data.total.toLocaleString()}
		{data.total === 1 ? 'order' : 'orders'}{data.search ? ` matching “${data.search}”` : ''}
	</p>

	<div class="overflow-x-auto rounded-lg" style="border: 1px solid var(--border);">
		<table class="w-full text-sm">
			<thead style="background: var(--bg-elev-1);">
				<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
					<th class="px-4 py-3">Order</th>
					<th class="px-4 py-3">Buyer</th>
					<th class="px-4 py-3">Number</th>
					<th class="px-4 py-3">Stage</th>
					<th class="px-4 py-3">Supplier</th>
					<th class="px-4 py-3 text-right">Net sale</th>
					{#if data.canViewRevenue}<th class="px-4 py-3 text-right">Cost</th>{/if}
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row, index (`${row.createdAt}:${row.phoneNumber ?? ''}:${index}`)}
					<tr style="border-top: 1px solid var(--border); background: var(--surface);">
						<td class="px-4 py-2 align-top whitespace-nowrap">
							{#if row.orderId}
								<a
									href={`/admin/orders/${row.orderId}`}
									class="font-medium hover:underline"
									style="color: var(--link);">{row.orderNumber ?? 'Open order'}</a
								>
							{/if}
							<div class="text-xs" style="color: var(--text-muted);">
								{new Date(row.createdAt).toLocaleString('en-NG', {
									day: 'numeric',
									month: 'short',
									hour: '2-digit',
									minute: '2-digit',
									timeZone: 'Africa/Lagos'
								})}
							</div>
						</td>
						<td class="px-4 py-2 align-top" style="color: var(--text);">
							{#if row.buyer}
								{#if row.buyerUserId}
									<a
										href={`/admin/users/${row.buyerUserId}`}
										class="hover:underline"
										style="color: var(--link);">{row.buyer}</a
									>
								{:else}
									{row.buyer}
								{/if}
							{:else}
								<span style="color: var(--text-dim);">guest</span>
							{/if}
						</td>
						<td class="px-4 py-2 align-top">
							<div class="font-mono" style="color: var(--text);">{row.phoneNumber ?? '—'}</div>
							<div class="text-xs" style="color: var(--text-muted);">
								{row.serviceName} · {row.countryName}
							</div>
						</td>
						<td class="px-4 py-2 align-top">
							{#if row.order}
								<OrderStageChip stage={getOrderStage(row.order)} />
							{/if}
						</td>
						<td class="px-4 py-2 align-top">
							<div class="flex flex-col items-start gap-1.5">
								<span
									class="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
									style={row.provider === 'pvapins'
										? 'background: rgba(167,139,250,0.14); color: #a78bfa; border: 1px solid rgba(167,139,250,0.3);'
										: 'background: rgba(56,189,248,0.12); color: #38bdf8; border: 1px solid rgba(56,189,248,0.28);'}
									>{providerLabel(row.provider)}</span
								>
								{#if row.attempts.length > 0}
									<details class="text-xs" style="color: var(--text-muted);">
										<summary class="cursor-pointer hover:underline">
											{row.attempts.length}
											{row.attempts.length === 1 ? 'attempt' : 'attempts'}
										</summary>
										<ol class="mt-2 space-y-1.5" aria-label="Provider attempt trail">
											{#each row.attempts as attempt, step (`${attempt.createdAt}:${attempt.provider}:${attempt.providerServiceRef}:${step}`)}
												<li class="whitespace-nowrap">
													<span class="font-semibold" style="color: var(--text);"
														>{step + 1}. {providerLabel(attempt.provider)}</span
													>
													· <span class="font-mono">{attempt.providerServiceRef}</span> · {attempt.outcome.replaceAll(
														'_',
														' '
													)}
													{#if attemptCost(attempt)}· {attemptCost(attempt)}{/if}
												</li>
											{/each}
										</ol>
									</details>
								{/if}
							</div>
						</td>
						<td class="px-4 py-2 text-right align-top" style="color: var(--text);">
							{ngn(row.saleNgn)}
						</td>
						{#if data.canViewRevenue}
							<td class="px-4 py-2 text-right align-top" style="color: var(--text-muted);">
								{row.costUsd == null ? '—' : `$${row.costUsd.toFixed(2)}`}
							</td>
						{/if}
					</tr>
				{:else}
					<tr style="background: var(--surface);">
						<td colspan="7" class="px-4 py-8 text-center" style="color: var(--text-dim);">
							{data.search ? 'No number orders match that search.' : 'No number orders yet.'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if data.pageCount > 1}
		<nav class="flex items-center justify-between text-sm" aria-label="Numbers Orders pages">
			{#if data.page > 1}
				<a href={pageHref(data.page - 1)} style="color: var(--link);">← Newer</a>
			{:else}<span></span>{/if}
			<span style="color: var(--text-muted);">Page {data.page} of {data.pageCount}</span>
			{#if data.page < data.pageCount}
				<a href={pageHref(data.page + 1)} style="color: var(--link);">Older →</a>
			{:else}<span></span>{/if}
		</nav>
	{/if}
</div>
