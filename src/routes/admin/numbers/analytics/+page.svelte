<script lang="ts">
	import { Phone, TrendingUp, AlertTriangle, ShieldCheck } from '$lib/icons';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const a = $derived(data.analytics);
	const lowBalance = $derived(
		data.hubBalanceCents != null && data.hubBalanceCents < data.lowBalanceThresholdCents
	);

	function ngn(n: number): string {
		return '₦' + Math.round(n).toLocaleString();
	}
	function pct(n: number | null): string {
		return n == null ? '—' : `${n}%`;
	}
	function secs(n: number | null): string {
		return n == null ? '—' : n < 60 ? `${n}s` : `${Math.round(n / 60)}m`;
	}
	function statusColor(s: string): string {
		if (s === 'received') return 'text-emerald-600';
		if (['refunded', 'expired', 'cancelled', 'failed'].includes(s)) return 'text-amber-600';
		return 'text-sky-600';
	}
</script>

<div class="p-6 max-w-6xl mx-auto">
	<div class="flex items-center justify-between mb-6 flex-wrap gap-3">
		<div class="flex items-center gap-3">
			<Phone class="w-6 h-6 text-sky-500" />
			<h1 class="text-2xl font-bold">Numbers — Analytics</h1>
		</div>
		<a href="/admin/numbers" class="text-sm text-sky-600 hover:underline">← Pricing</a>
	</div>

	{#if lowBalance}
		<div class="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
			<AlertTriangle class="w-4 h-4" />
			hub-man balance is low (${((data.hubBalanceCents ?? 0) / 100).toFixed(2)}) — top up to keep numbers selling.
		</div>
	{/if}

	<!-- KPI cards -->
	<div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
		<div class="p-4 rounded-lg border border-gray-200">
			<div class="text-xs text-gray-500">Total rents</div>
			<div class="text-2xl font-bold">{a.overall.total}</div>
		</div>
		<div class="p-4 rounded-lg border border-gray-200">
			<div class="text-xs text-gray-500">Success rate</div>
			<div class="text-2xl font-bold">{pct(a.overall.successRatePct)}</div>
		</div>
		<div class="p-4 rounded-lg border border-gray-200">
			<div class="text-xs text-gray-500">Revenue</div>
			<div class="text-2xl font-bold">{ngn(a.overall.revenueNgn)}</div>
		</div>
		<div class="p-4 rounded-lg border border-gray-200">
			<div class="text-xs text-gray-500">Margin</div>
			<div class="text-2xl font-bold text-emerald-600">{ngn(a.overall.marginNgn)}</div>
		</div>
		<div class="p-4 rounded-lg border {lowBalance ? 'border-red-300 bg-red-50' : 'border-gray-200'}">
			<div class="text-xs text-gray-500">hub-man balance</div>
			<div class="text-2xl font-bold {lowBalance ? 'text-red-600' : ''}">
				{data.hubBalanceCents == null ? '—' : `$${(data.hubBalanceCents / 100).toFixed(2)}`}
			</div>
		</div>
	</div>

	<!-- Per service/country -->
	<h2 class="font-semibold mb-2 flex items-center gap-2">
		<TrendingUp class="w-4 h-4 text-gray-400" /> By service & country
	</h2>
	<div class="overflow-x-auto rounded-lg border border-gray-200 mb-8">
		<table class="w-full text-sm">
			<thead class="bg-gray-50 text-left text-xs uppercase text-gray-500">
				<tr>
					<th class="px-4 py-3">Service</th>
					<th class="px-4 py-3">Country</th>
					<th class="px-4 py-3 text-right">Rents</th>
					<th class="px-4 py-3 text-right">Success</th>
					<th class="px-4 py-3 text-right">Avg OTP</th>
					<th class="px-4 py-3 text-right">Revenue</th>
					<th class="px-4 py-3 text-right">Margin</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100">
				{#each a.byService as row (row.serviceName + row.countryName)}
					<tr class={row.needsAttention ? 'bg-amber-50' : ''}>
						<td class="px-4 py-2 font-medium">
							{row.serviceName}
							{#if row.needsAttention}
								<span title="High failure rate — users having issues here">
									<AlertTriangle class="inline w-3.5 h-3.5 text-amber-500" />
								</span>
							{/if}
						</td>
						<td class="px-4 py-2">{row.countryName}</td>
						<td class="px-4 py-2 text-right">{row.total}</td>
						<td class="px-4 py-2 text-right {row.needsAttention ? 'text-amber-600 font-semibold' : ''}">
							{pct(row.successRatePct)}
						</td>
						<td class="px-4 py-2 text-right">{secs(row.avgTimeToOtpSec)}</td>
						<td class="px-4 py-2 text-right">{ngn(row.revenueNgn)}</td>
						<td class="px-4 py-2 text-right text-emerald-600">{ngn(row.marginNgn)}</td>
					</tr>
				{/each}
				{#if a.byService.length === 0}
					<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">
						No rentals yet.
					</td></tr>
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Recent -->
	<h2 class="font-semibold mb-2 flex items-center gap-2">
		<ShieldCheck class="w-4 h-4 text-gray-400" /> Recent rentals
	</h2>
	<div class="overflow-x-auto rounded-lg border border-gray-200">
		<table class="w-full text-sm">
			<thead class="bg-gray-50 text-left text-xs uppercase text-gray-500">
				<tr>
					<th class="px-4 py-3">When</th>
					<th class="px-4 py-3">Service</th>
					<th class="px-4 py-3">Number</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3 text-right">Sale</th>
					<th class="px-4 py-3 text-right">Cost</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100">
				{#each a.recent as r (r.createdAt + (r.phoneNumber ?? ''))}
					<tr>
						<td class="px-4 py-2 text-gray-500 whitespace-nowrap">
							{new Date(r.createdAt).toLocaleString()}
						</td>
						<td class="px-4 py-2">{r.serviceName} — {r.countryName}</td>
						<td class="px-4 py-2 font-mono">{r.phoneNumber ?? '—'}</td>
						<td class="px-4 py-2 font-medium {statusColor(r.status)}">{r.status}</td>
						<td class="px-4 py-2 text-right">{ngn(r.saleNgn)}</td>
						<td class="px-4 py-2 text-right">{r.costUsd == null ? '—' : `$${r.costUsd.toFixed(2)}`}</td>
					</tr>
				{/each}
				{#if a.recent.length === 0}
					<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">No rentals yet.</td></tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
